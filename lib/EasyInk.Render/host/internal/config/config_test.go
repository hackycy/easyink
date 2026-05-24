package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRuntimeConfigValidation(t *testing.T) {
	browser := filepath.Join(t.TempDir(), "chrome")
	if err := os.WriteFile(browser, []byte("fake"), 0o755); err != nil {
		t.Fatalf("write browser: %v", err)
	}
	cfg := Defaults()
	cfg.Browser.Kind = "chromium"
	cfg.Browser.Path = browser
	cfg.ProfileRoot = t.TempDir()
	cfg.TempDir = t.TempDir()
	cfg.LogDir = t.TempDir()

	if err := cfg.ValidateRuntime(true); err != nil {
		t.Fatalf("validate runtime: %v", err)
	}

	cfg.Browser.Kind = "netscape"
	if err := cfg.ValidateRuntime(true); err == nil || !strings.Contains(err.Error(), "unsupported browser.kind") {
		t.Fatalf("expected unsupported browser kind, got %v", err)
	}
}

func TestRuntimeFingerprintChangesWithBrowserPath(t *testing.T) {
	cfg := Defaults()
	cfg.Browser.Kind = "chromium"
	cfg.Browser.Path = "/browser/a"
	original := cfg.Fingerprint()

	cfg.Browser.Path = "/browser/b"
	if got := cfg.Fingerprint(); got == original {
		t.Fatal("expected fingerprint to change when browser path changes")
	}
}

func TestMergeOverrideKeepsUnsetValues(t *testing.T) {
	cfg := Defaults()
	cfg.Browser.Kind = "chromium"
	cfg.MaxQueueSize = 16
	queueSize := 0

	got := MergeOverride(cfg, Override{
		BrowserPath:  "/tmp/chrome",
		MaxQueueSize: &queueSize,
	})

	if got.Browser.Kind != "chromium" {
		t.Fatalf("browser kind = %q", got.Browser.Kind)
	}
	if got.Browser.Path != "/tmp/chrome" {
		t.Fatalf("browser path = %q", got.Browser.Path)
	}
	if got.MaxQueueSize != 0 {
		t.Fatalf("max queue size = %d", got.MaxQueueSize)
	}
}
