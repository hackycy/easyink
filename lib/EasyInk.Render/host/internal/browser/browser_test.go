package browser

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/chromedp/chromedp"
)

func TestParseChromeVersion(t *testing.T) {
	got := parseChromeVersion("Mozilla/5.0 HeadlessChrome/123.0.1.2 Safari/537.36")
	if got != "123.0.1.2" {
		t.Fatalf("version = %q", got)
	}
}

func TestDisabledProxyEnvironmentClearsKnownProxyVariables(t *testing.T) {
	got := disabledProxyEnvironment()
	seen := map[string]bool{}
	for _, item := range got {
		seen[item] = true
	}
	for _, key := range proxyEnvironmentKeys {
		if !seen[key+"="] {
			t.Fatalf("expected %s to be cleared, got %#v", key, got)
		}
	}
}

func TestManagerRestartsAfterBrowserContextStops(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	manager, err := New(ctx, browserPath, t.TempDir())
	if err != nil {
		t.Fatalf("start browser: %v", err)
	}
	defer manager.Shutdown()

	first := manager.Health(ctx)
	if !first.Ready {
		t.Fatalf("browser should be ready: %#v", first)
	}
	manager.stopForTest()
	if err := manager.EnsureReady(ctx); err != nil {
		t.Fatalf("ensure ready after stop: %v", err)
	}
	second := manager.Health(ctx)
	if !second.Ready {
		t.Fatalf("browser should recover: %#v", second)
	}
	if second.Restarts == 0 {
		t.Fatalf("expected restart count to increase: %#v", second)
	}
	if second.Version == "" || second.Version == "unknown" {
		t.Fatalf("expected browser version after restart: %#v", second)
	}
}

func TestManagerCreatesIsolatedBrowserContexts(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	manager, err := New(ctx, browserPath, t.TempDir())
	if err != nil {
		t.Fatalf("start browser: %v", err)
	}
	defer manager.Shutdown()

	first, firstCancel, err := manager.NewPage(ctx)
	if err != nil {
		t.Fatalf("new first page: %v", err)
	}
	defer firstCancel()
	if err := chromedp.Run(first,
		chromedp.Navigate("https://example.com/"),
		chromedp.Evaluate(`document.cookie = "easyink=context-a"; localStorage.setItem("easyink", "context-a")`, nil),
	); err != nil {
		t.Fatalf("write first context state: %v", err)
	}

	second, secondCancel, err := manager.NewPage(ctx)
	if err != nil {
		t.Fatalf("new second page: %v", err)
	}
	defer secondCancel()
	var cookieValue string
	var storageValue string
	if err := chromedp.Run(second,
		chromedp.Navigate("https://example.com/"),
		chromedp.Evaluate(`document.cookie`, &cookieValue),
		chromedp.Evaluate(`localStorage.getItem("easyink") || ""`, &storageValue),
	); err != nil {
		t.Fatalf("read second context state: %v", err)
	}
	if cookieValue != "" {
		t.Fatalf("expected isolated cookies, got %q", cookieValue)
	}
	if storageValue != "" {
		t.Fatalf("expected isolated localStorage, got %q", storageValue)
	}
}
