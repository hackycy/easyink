package render

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"testing"

	"easyink/render/host/internal/diagnostics"
	"easyink/render/host/internal/protocol"
	"github.com/chromedp/cdproto/network"
)

func TestRenderPrintPDFRejectsPDFSource(t *testing.T) {
	service := &Service{}
	_, err := service.RenderPrintPDF(context.Background(), protocol.PrintPDFRequest{
		RequestID: "req-pdf",
		Source: protocol.Source{
			Type: "pdf",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "unsupported source.type") {
		t.Fatalf("expected unsupported source error, got %v", err)
	}
}

func TestCountPDFPagesHasMinimumForValidPDFBytes(t *testing.T) {
	if got := countPDFPages([]byte("%PDF-1.4\n%%EOF")); got != 1 {
		t.Fatalf("page count = %d", got)
	}
}

func TestCountPDFPagesUsesParserBeforeFallback(t *testing.T) {
	input := minimalPDF(t, "/Type /Page")
	if got := countPDFPages(input); got != 1 {
		t.Fatalf("page count = %d", got)
	}
}

func TestHTMLWithBaseURLInjectsBaseIntoHead(t *testing.T) {
	got := htmlWithBaseURL("<!doctype html><html><head><title>x</title></head><body></body></html>", "https://example.com/templates/")
	if !strings.Contains(got, `<base href="https://example.com/templates/">`) {
		t.Fatalf("expected base tag, got %s", got)
	}
}

func TestHTMLWithBaseURLPreservesExistingBase(t *testing.T) {
	input := `<html><head><base href="https://already.example/"></head><body></body></html>`
	if got := htmlWithBaseURL(input, "https://example.com/"); got != input {
		t.Fatalf("expected existing base to be preserved")
	}
}

func TestBuildOfflineResourcesValidatesAndGeneratesFontCSS(t *testing.T) {
	resources, css, err := buildOfflineResources(protocol.Source{
		Resources: []protocol.Resource{
			{
				URL:         "https://easyink.local/resources/logo.png",
				ContentType: "image/png",
				Base64:      base64.StdEncoding.EncodeToString([]byte("png")),
			},
		},
		Fonts: []protocol.FontResource{
			{
				Family:      "Receipt Font",
				URL:         "https://easyink.local/fonts/receipt.woff2",
				ContentType: "font/woff2",
				Base64:      base64.StdEncoding.EncodeToString([]byte("font")),
				Weight:      "700",
				Style:       "normal",
			},
		},
	}, defaultMaxInputBytes)
	if err != nil {
		t.Fatalf("build offline resources: %v", err)
	}
	if len(resources) != 2 {
		t.Fatalf("resources = %#v", resources)
	}
	if !strings.Contains(css, `font-family:"Receipt Font"`) {
		t.Fatalf("font css = %s", css)
	}
	if !strings.Contains(css, `src:url("https://easyink.local/fonts/receipt.woff2") format('woff2')`) {
		t.Fatalf("font css = %s", css)
	}
}

func TestBuildOfflineResourcesRejectsExternalURL(t *testing.T) {
	_, _, err := buildOfflineResources(protocol.Source{
		Resources: []protocol.Resource{
			{
				URL:         "https://example.com/logo.png",
				ContentType: "image/png",
				Base64:      base64.StdEncoding.EncodeToString([]byte("png")),
			},
		},
	}, defaultMaxInputBytes)
	if err == nil || !strings.Contains(err.Error(), "easyink.local") {
		t.Fatalf("expected easyink.local validation error, got %v", err)
	}
}

func TestBuildOfflineResourcesRejectsOversizedBundle(t *testing.T) {
	_, _, err := buildOfflineResources(protocol.Source{
		Resources: []protocol.Resource{
			{
				URL:         "https://easyink.local/resources/logo.png",
				ContentType: "image/png",
				Base64:      base64.StdEncoding.EncodeToString([]byte("toolarge")),
			},
		},
	}, 4)
	if err == nil || !strings.Contains(err.Error(), "maxInputBytes") {
		t.Fatalf("expected maxInputBytes error, got %v", err)
	}
}

func TestSanitizeFinalURLRedactsDataURL(t *testing.T) {
	if got := sanitizeFinalURL("data:text/html;base64,PGh0bWw+"); got != "data:<redacted>" {
		t.Fatalf("sanitized URL = %q", got)
	}
	if got := sanitizeFinalURL("https://example.com/template.html"); got != "https://example.com/template.html" {
		t.Fatalf("sanitized URL = %q", got)
	}
}

func TestResolveWaitPlan(t *testing.T) {
	tests := []struct {
		name        string
		options     protocol.WaitOptions
		selectors   []string
		networkIdle bool
		wantErr     string
	}{
		{
			name:    "default load",
			options: protocol.WaitOptions{},
		},
		{
			name:      "selector",
			options:   protocol.WaitOptions{Until: "selector", Selector: ".ready"},
			selectors: []string{".ready"},
		},
		{
			name:        "network idle keeps explicit selector",
			options:     protocol.WaitOptions{Until: "networkIdle", Selector: ".ready"},
			selectors:   []string{".ready"},
			networkIdle: true,
		},
		{
			name:      "easyink ready",
			options:   protocol.WaitOptions{Until: "easyinkReady"},
			selectors: []string{".easyink-ready"},
		},
		{
			name:    "selector requires selector",
			options: protocol.WaitOptions{Until: "selector"},
			wantErr: "wait.selector",
		},
		{
			name:    "unsupported until",
			options: protocol.WaitOptions{Until: "paint"},
			wantErr: "unsupported wait.until",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			plan, err := resolveWaitPlan(tc.options)
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("expected error containing %q, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("resolve wait: %v", err)
			}
			if strings.Join(plan.selectors, ",") != strings.Join(tc.selectors, ",") {
				t.Fatalf("selectors = %#v", plan.selectors)
			}
			if plan.networkIdle != tc.networkIdle {
				t.Fatalf("networkIdle = %v", plan.networkIdle)
			}
		})
	}
}

func TestRedirectResponseBlockedBySecurityPolicy(t *testing.T) {
	collector := diagnostics.New("req-redirect", "html", "unknown")
	tracker := newPageTracker(nil, protocol.PrintPDFRequest{
		RequestID: "req-redirect",
		Source: protocol.Source{
			Type:    "html",
			BaseURL: "https://example.com/",
		},
		Security: protocol.SecurityOptions{
			AllowedOrigins: []string{"https://cdn.example.com"},
		},
	}, collector)

	tracker.handleRedirectResponse(network.RequestID("1"), &network.Response{
		URL:    "https://cdn.example.com/asset",
		Status: 302,
		Headers: network.Headers{
			"Location": "http://127.0.0.1/admin",
		},
	})

	got := collector.Snapshot()
	if len(got.FailedRequests) == 0 {
		t.Fatal("expected blocked redirect to be recorded")
	}
	if !strings.Contains(strings.Join(got.FailedRequests, "\n"), "redirect target is not allowed") {
		t.Fatalf("unexpected failed requests: %#v", got.FailedRequests)
	}
}

func minimalPDF(t *testing.T, title string) []byte {
	t.Helper()
	objects := []string{
		"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
		"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
		"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n",
		"4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
	}
	infoObjectID := 0
	if title != "" {
		infoObjectID = len(objects) + 1
		objects = append(objects, fmt.Sprintf("%d 0 obj\n<< /Title (%s) >>\nendobj\n", infoObjectID, escapePDFString(title)))
	}
	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects)+1)
	for i, obj := range objects {
		offsets[i+1] = buf.Len()
		buf.WriteString(obj)
	}
	xrefOffset := buf.Len()
	buf.WriteString("xref\n")
	buf.WriteString(fmt.Sprintf("0 %d\n", len(objects)+1))
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i < len(offsets); i++ {
		buf.WriteString(fmt.Sprintf("%010d 00000 n \n", offsets[i]))
	}
	buf.WriteString("trailer\n")
	if infoObjectID > 0 {
		buf.WriteString(fmt.Sprintf("<< /Size %d /Root 1 0 R /Info %d 0 R >>\n", len(objects)+1, infoObjectID))
	} else {
		buf.WriteString(fmt.Sprintf("<< /Size %d /Root 1 0 R >>\n", len(objects)+1))
	}
	buf.WriteString("startxref\n")
	buf.WriteString(fmt.Sprintf("%d\n", xrefOffset))
	buf.WriteString("%%EOF\n")
	return buf.Bytes()
}

func escapePDFString(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `(`, `\(`)
	value = strings.ReplaceAll(value, `)`, `\)`)
	return value
}
