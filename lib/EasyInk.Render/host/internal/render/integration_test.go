package render_test

import (
	"context"
	"encoding/base64"
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
	input := []byte("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF")
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
}
