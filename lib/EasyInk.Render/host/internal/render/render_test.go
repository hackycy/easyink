package render

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"strings"
	"testing"

	"easyink/render/host/internal/diagnostics"
	"easyink/render/host/internal/protocol"
	"github.com/chromedp/cdproto/network"
)

func TestNormalizePDFValidatesAndReturnsBytes(t *testing.T) {
	service := &Service{}
	input := minimalPDF(t, PDFMetadata{})
	result, err := service.normalizePDF(protocol.PrintPDFRequest{
		RequestID: "req-pdf",
		Source: protocol.Source{
			Type:      "pdf",
			PDFBase64: base64.StdEncoding.EncodeToString(input),
		},
	})
	if err != nil {
		t.Fatalf("normalize pdf: %v", err)
	}
	if string(result.PDF) != string(input) {
		t.Fatal("expected PDF bytes to be returned unchanged")
	}
	if result.PageCount != 1 {
		t.Fatalf("page count = %d", result.PageCount)
	}
}

func TestNormalizePDFReadsMetadata(t *testing.T) {
	service := &Service{}
	input := minimalPDF(t, PDFMetadata{
		Title:    "EasyInk Test PDF",
		Author:   "EasyInk",
		Creator:  "Render Test",
		Producer: "Go",
	})
	result, err := service.normalizePDF(protocol.PrintPDFRequest{
		RequestID: "req-pdf",
		Source: protocol.Source{
			Type:      "pdf",
			PDFBase64: base64.StdEncoding.EncodeToString(input),
		},
	})
	if err != nil {
		t.Fatalf("normalize pdf: %v", err)
	}
	if result.PDFMetadata.Title != "EasyInk Test PDF" {
		t.Fatalf("title = %q", result.PDFMetadata.Title)
	}
	if result.PDFMetadata.Author != "EasyInk" {
		t.Fatalf("author = %q", result.PDFMetadata.Author)
	}
	if result.PDFMetadata.Creator != "Render Test" {
		t.Fatalf("creator = %q", result.PDFMetadata.Creator)
	}
	if result.PDFMetadata.Producer != "Go" {
		t.Fatalf("producer = %q", result.PDFMetadata.Producer)
	}
}

func TestNormalizePDFRejectsInvalidHeader(t *testing.T) {
	service := &Service{}
	_, err := service.normalizePDF(protocol.PrintPDFRequest{
		RequestID: "req-pdf",
		Source: protocol.Source{
			Type:      "pdf",
			PDFBase64: base64.StdEncoding.EncodeToString([]byte("hello")),
		},
	})
	if err == nil || !strings.Contains(err.Error(), "header") {
		t.Fatalf("expected header error, got %v", err)
	}
}

func TestCountPDFPagesHasMinimumForValidPDFBytes(t *testing.T) {
	if got := countPDFPages([]byte("%PDF-1.4\n%%EOF")); got != 1 {
		t.Fatalf("page count = %d", got)
	}
}

func TestNormalizePDFRejectsMissingStartXref(t *testing.T) {
	service := &Service{}
	input := []byte("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF")
	_, err := service.normalizePDF(protocol.PrintPDFRequest{
		RequestID: "req-pdf",
		Source: protocol.Source{
			Type:      "pdf",
			PDFBase64: base64.StdEncoding.EncodeToString(input),
		},
	})
	if err == nil || !strings.Contains(err.Error(), "startxref") {
		t.Fatalf("expected startxref error, got %v", err)
	}
}

func TestNormalizePDFRejectsStructurallyInvalidPDF(t *testing.T) {
	service := &Service{}
	input := []byte("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF")
	_, err := service.normalizePDF(protocol.PrintPDFRequest{
		RequestID: "req-pdf",
		Source: protocol.Source{
			Type:      "pdf",
			PDFBase64: base64.StdEncoding.EncodeToString(input),
		},
	})
	if err == nil || !strings.Contains(err.Error(), "structure") {
		t.Fatalf("expected structure error, got %v", err)
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

func minimalPDF(t *testing.T, metadata PDFMetadata) []byte {
	t.Helper()
	objects := []string{
		"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
		"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
		"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n",
		"4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
	}
	infoObjectID := 0
	if metadata != (PDFMetadata{}) {
		infoObjectID = len(objects) + 1
		objects = append(objects, fmt.Sprintf(
			"%d 0 obj\n<< /Title (%s) /Author (%s) /Creator (%s) /Producer (%s) >>\nendobj\n",
			infoObjectID,
			escapePDFString(metadata.Title),
			escapePDFString(metadata.Author),
			escapePDFString(metadata.Creator),
			escapePDFString(metadata.Producer),
		))
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
