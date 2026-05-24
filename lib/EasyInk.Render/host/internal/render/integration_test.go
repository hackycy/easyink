package render_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"easyink/render/host/internal/browser"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/render"
)

func TestRenderPrintPDFHTMLAndEasyInkWithBrowser(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	manager, err := browser.New(ctx, browserPath, t.TempDir())
	if err != nil {
		t.Fatalf("start browser: %v", err)
	}
	defer manager.Shutdown()
	service := render.NewService(manager)

	for _, tc := range []struct {
		name string
		req  protocol.PrintPDFRequest
	}{
		{
			name: "html",
			req: protocol.PrintPDFRequest{
				RequestID: "req-html",
				Source: protocol.Source{
					Type: "html",
					HTML: `<!doctype html><html><body><main class="easyink-ready">Hello EasyInk</main></body></html>`,
				},
				PDF: protocol.PDFOptions{
					PaperWidthMm:  80,
					PaperHeightMm: 120,
					MarginMm:      &protocol.MarginMm{},
				},
			},
		},
		{
			name: "easyink",
			req: protocol.PrintPDFRequest{
				RequestID: "req-easyink",
				Source: protocol.Source{
					Type:   "easyink",
					Schema: []byte(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[]}`),
					Data:   []byte(`{"receipt":{"no":"R-001"}}`),
				},
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, err := service.RenderPrintPDF(ctx, tc.req)
			if err != nil {
				t.Fatalf("render: %v", err)
			}
			if !strings.HasPrefix(string(result.PDF), "%PDF-") {
				t.Fatalf("expected PDF output, got %q", string(result.PDF[:min(8, len(result.PDF))]))
			}
			if result.Diagnostics.RequestID != tc.req.RequestID {
				t.Fatalf("diagnostics requestId = %q", result.Diagnostics.RequestID)
			}
		})
	}
}

func TestRenderPrintPDFPDFPassThrough(t *testing.T) {
	service := render.NewService(nil)
	input := minimalIntegrationPDF(t)
	result, err := service.RenderPrintPDF(context.Background(), protocol.PrintPDFRequest{
		RequestID: "req-pdf",
		Source: protocol.Source{
			Type:      "pdf",
			PDFBase64: base64.StdEncoding.EncodeToString(input),
		},
	})
	if err != nil {
		t.Fatalf("render pdf: %v", err)
	}
	if string(result.PDF) != string(input) {
		t.Fatal("expected PDF pass-through")
	}
	if result.PageCount != 1 {
		t.Fatalf("page count = %d", result.PageCount)
	}
	if result.Diagnostics.PageCount != 1 {
		t.Fatalf("diagnostics page count = %d", result.Diagnostics.PageCount)
	}
}

func TestRenderPrintPDFPDFDiagnosticsIncludesMetadata(t *testing.T) {
	service := render.NewService(nil)
	input := minimalIntegrationPDFWithInfo(t, "Integration PDF")
	result, err := service.RenderPrintPDF(context.Background(), protocol.PrintPDFRequest{
		RequestID: "req-pdf-info",
		Source: protocol.Source{
			Type:      "pdf",
			PDFBase64: base64.StdEncoding.EncodeToString(input),
		},
	})
	if err != nil {
		t.Fatalf("render pdf: %v", err)
	}
	if result.Diagnostics.PDFTitle != "Integration PDF" {
		t.Fatalf("diagnostics title = %q", result.Diagnostics.PDFTitle)
	}
}

func minimalIntegrationPDF(t *testing.T) []byte {
	t.Helper()
	return minimalIntegrationPDFWithInfo(t, "")
}

func minimalIntegrationPDFWithInfo(t *testing.T, title string) []byte {
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
		objects = append(objects, fmt.Sprintf("%d 0 obj\n<< /Title (%s) >>\nendobj\n", infoObjectID, escapeIntegrationPDFString(title)))
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

func escapeIntegrationPDFString(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `(`, `\(`)
	value = strings.ReplaceAll(value, `)`, `\)`)
	return value
}

func TestRenderPrintPDFCapturesBrowserDiagnostics(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	manager, err := browser.New(ctx, browserPath, t.TempDir())
	if err != nil {
		t.Fatalf("start browser: %v", err)
	}
	defer manager.Shutdown()
	service := render.NewService(manager)

	result, err := service.RenderPrintPDF(ctx, protocol.PrintPDFRequest{
		RequestID: "req-diag",
		Source: protocol.Source{
			Type: "html",
			HTML: `<!doctype html><html><body>
				<img src="http://localhost/private.png">
				<main class="easyink-ready">Diagnostics</main>
				<script>console.error("easyink diagnostic error")</script>
			</body></html>`,
		},
		Wait: protocol.WaitOptions{Until: "networkIdle", TimeoutMs: 5000},
	})
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if len(result.Diagnostics.ConsoleErrors) == 0 {
		t.Fatal("expected console errors to be captured")
	}
	if len(result.Diagnostics.FailedRequests) == 0 {
		t.Fatal("expected failed requests to be captured")
	}
	if !strings.Contains(strings.Join(result.Diagnostics.FailedRequests, "\n"), "localhost") {
		t.Fatalf("expected localhost blocked request, got %#v", result.Diagnostics.FailedRequests)
	}
}

func TestRenderPrintPDFCapturesFailureAttachments(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	manager, err := browser.New(ctx, browserPath, t.TempDir())
	if err != nil {
		t.Fatalf("start browser: %v", err)
	}
	defer manager.Shutdown()
	service := render.NewService(manager)

	result, err := service.RenderPrintPDF(ctx, protocol.PrintPDFRequest{
		RequestID: "req-timeout-attachments",
		Source: protocol.Source{
			Type: "html",
			HTML: `<!doctype html><html><body><main>Missing selector</main></body></html>`,
		},
		Wait: protocol.WaitOptions{Selector: ".never-ready", TimeoutMs: 100},
	})
	if err == nil {
		t.Fatal("expected render timeout")
	}
	if len(result.Attachments.HTMLSnapshot) == 0 {
		t.Fatal("expected HTML snapshot attachment")
	}
	if !strings.Contains(string(result.Attachments.HTMLSnapshot), "Missing selector") {
		t.Fatalf("unexpected HTML snapshot: %s", string(result.Attachments.HTMLSnapshot))
	}
	if len(result.Attachments.Screenshot) == 0 {
		t.Fatal("expected screenshot attachment")
	}
}

func TestRenderPrintPDFRejectsUnsupportedWaitUntil(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	manager, err := browser.New(ctx, browserPath, t.TempDir())
	if err != nil {
		t.Fatalf("start browser: %v", err)
	}
	defer manager.Shutdown()
	service := render.NewService(manager)

	_, err = service.RenderPrintPDF(ctx, protocol.PrintPDFRequest{
		RequestID: "req-invalid-wait",
		Source: protocol.Source{
			Type: "html",
			HTML: `<!doctype html><html><body><main>Invalid wait</main></body></html>`,
		},
		Wait: protocol.WaitOptions{Until: "paint", TimeoutMs: 5000},
	})
	if err == nil || !strings.Contains(err.Error(), "unsupported wait.until") {
		t.Fatalf("expected unsupported wait error, got %v", err)
	}
}
