package render_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"easyink/render/host/internal/browser"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/render"

	pdfparse "github.com/ledongthuc/pdf"
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

func TestRenderAwaitsRuntimeCleanupWithBrowser(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Fatal("EASYINK_RENDER_BROWSER_PATH is required for runtime cleanup acceptance")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	manager, err := browser.New(ctx, browserPath, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Shutdown()
	result, err := render.NewService(manager).RenderPrintPDF(ctx, protocol.PrintPDFRequest{
		RequestID: "runtime-cleanup",
		Source: protocol.Source{Type: "html", HTML: `<!doctype html><html><body>Cleanup output<script>
		window.__easyinkDestroy = () => new Promise(resolve => setTimeout(() => {
		  console.error('cleanup-completed-marker'); resolve();
		}, 150));
		</script></body></html>`},
		Wait: protocol.WaitOptions{Until: "load", TimeoutMs: 10000},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(result.PDF, []byte("%PDF-")) {
		t.Fatal("missing actual PDF output")
	}
	if !strings.Contains(strings.Join(result.Diagnostics.ConsoleErrors, "\n"), "cleanup-completed-marker") {
		t.Fatalf("host returned before runtime cleanup settled: %+v", result.Diagnostics)
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

func TestRenderPrintPDFLoadsLargeHTMLWithOfflineResources(t *testing.T) {
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
		RequestID: "req-large-html",
		Source: protocol.Source{
			Type:    "html",
			BaseURL: "https://easyink.local/resources/",
			// The captured load marker verifies the default load wait, script execution and image decoding.
			HTML: `<!doctype html><html><head></head><body onload="document.querySelector('main').textContent = 'Loaded 中文 ' + window.offlineMessage + ' ' + document.querySelector('img').naturalWidth + ' ' + window.isSecureContext + ' ' + typeof crypto.randomUUID; console.error(document.querySelector('main').textContent)">
				<main>Still loading</main><img src="pixel.svg"><!--` + strings.Repeat("x", 3*1024*1024) + `-->
				<script src="message.js"></script></body></html>`,
			Resources: []protocol.Resource{
				{
					URL:         "https://easyink.local/resources/pixel.svg",
					ContentType: "image/svg+xml",
					Base64:      base64.StdEncoding.EncodeToString([]byte(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="black"/></svg>`)),
				},
				{
					URL:         "https://easyink.local/resources/message.js",
					ContentType: "application/javascript",
					Base64:      base64.StdEncoding.EncodeToString([]byte(`window.offlineMessage = "transport"`)),
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("render large HTML: %v", err)
	}
	if len(result.Diagnostics.FailedRequests) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", result.Diagnostics)
	}
	logs := result.Diagnostics.ConsoleErrors
	var loadMarker string
	if len(logs) != 1 || json.Unmarshal([]byte(logs[0]), &loadMarker) != nil || loadMarker != "Loaded 中文 transport 1 true function" {
		t.Fatalf("expected secure load event with UTF-8 text and loaded script/image, got %#v", logs)
	}
	if result.Diagnostics.FinalURL != "data:<redacted>" {
		t.Fatalf("final URL = %q", result.Diagnostics.FinalURL)
	}
	if !bytes.HasPrefix(result.PDF, []byte("%PDF-")) || result.PageCount != 1 {
		t.Fatalf("expected single-page PDF, got %d pages", result.PageCount)
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

func TestRenderPrintPDFPreservesCJKTextWithoutMetaCharset(t *testing.T) {
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
	font, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "playground", "public", "fonts", "站酷快乐体.ttf"))
	if err != nil {
		t.Fatalf("read CJK fixture font: %v", err)
	}

	result, err := service.RenderPrintPDF(ctx, protocol.PrintPDFRequest{
		RequestID: "req-cjk-html-no-meta",
		Source: protocol.Source{
			Type:  "html",
			HTML:  `<!doctype html><html><head><title>中文打印测试</title><style>body{font-family:FixtureCJK;font-size:22px}</style></head><body><main class="easyink-ready">中文打印测试：商品名称 墨水 数量 价格 合计 ¥123.45</main></body></html>`,
			Fonts: []protocol.FontResource{{Family: "FixtureCJK", URL: "https://easyink.local/fonts/cjk.ttf", ContentType: "font/ttf", Base64: base64.StdEncoding.EncodeToString(font)}},
		},
		PDF: protocol.PDFOptions{
			PaperWidthMm:  80,
			PaperHeightMm: 120,
			MarginMm:      &protocol.MarginMm{Top: 4, Right: 4, Bottom: 4, Left: 4},
		},
	})
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	reader, err := pdfparse.NewReader(bytes.NewReader(result.PDF), int64(len(result.PDF)))
	if err != nil {
		t.Fatalf("read pdf: %v", err)
	}
	plainText, err := reader.GetPlainText()
	if err != nil {
		t.Fatalf("extract pdf text: %v", err)
	}
	textBytes, err := io.ReadAll(plainText)
	if err != nil {
		t.Fatalf("read pdf text: %v", err)
	}
	text := string(textBytes)
	for _, expected := range []string{"中文打印测试", "商品名称", "墨水", "¥123.45"} {
		if !strings.Contains(text, expected) {
			t.Fatalf("expected extracted PDF text to include %q, got %q", expected, text)
		}
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
