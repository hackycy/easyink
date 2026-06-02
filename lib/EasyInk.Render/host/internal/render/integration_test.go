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

func TestRenderPrintPDFUsesOfflineResourceBundle(t *testing.T) {
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
		RequestID: "req-offline-resource",
		Source: protocol.Source{
			Type: "html",
			HTML: `<!doctype html><html><body>
				<img src="https://easyink.local/resources/pixel.svg">
				<main class="easyink-ready">Offline resource</main>
			</body></html>`,
			Resources: []protocol.Resource{
				{
					URL:         "https://easyink.local/resources/pixel.svg",
					ContentType: "image/svg+xml",
					Base64:      base64.StdEncoding.EncodeToString([]byte(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="black"/></svg>`)),
				},
			},
		},
		Wait: protocol.WaitOptions{Until: "networkIdle", TimeoutMs: 5000},
	})
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if len(result.Diagnostics.FailedRequests) != 0 {
		t.Fatalf("unexpected failed requests: %#v", result.Diagnostics.FailedRequests)
	}
	if !strings.HasPrefix(string(result.PDF), "%PDF-") {
		t.Fatalf("expected PDF output")
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
