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
	cfg.Browser.Path = browser
	cfg.ProfileRoot = t.TempDir()
	cfg.TempDir = t.TempDir()
	cfg.LogDir = t.TempDir()

	if err := cfg.ValidateRuntime(true); err != nil {
		t.Fatalf("validate runtime: %v", err)
	}
}

func TestLoadRuntimeRejectsUnknownFields(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)
	path := ConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("create config dir: %v", err)
	}
	data := []byte(`{
		"browser": { "path": "/tmp/chromium", "headlessMode": "auto" },
		"profileRoot": "/tmp/profile",
		"tempDir": "/tmp/temp",
		"logDir": "/tmp/logs",
		"maxConcurrency": 2,
		"maxQueueSize": 16,
		"requestTimeoutMs": 30000,
		"idleTimeoutMs": 0,
		"unexpected": true
	}`)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	_, err := LoadRuntime()
	if err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("expected unknown field error, got %v", err)
	}
}

func TestRuntimeFingerprintChangesWithBrowserPath(t *testing.T) {
	cfg := Defaults()
	cfg.Browser.Path = "/browser/a"
	original := cfg.Fingerprint()

	cfg.Browser.Path = "/browser/b"
	if got := cfg.Fingerprint(); got == original {
		t.Fatal("expected fingerprint to change when browser path changes")
	}
}

func TestMergeOverrideKeepsUnsetValues(t *testing.T) {
	cfg := Defaults()
	cfg.MaxQueueSize = 16
	queueSize := 0

	got := MergeOverride(cfg, Override{
		BrowserPath:    "/tmp/chrome",
		DisableSandbox: true,
		MaxQueueSize:   &queueSize,
	})

	if got.Browser.Path != "/tmp/chrome" {
		t.Fatalf("browser path = %q", got.Browser.Path)
	}
	if !got.Browser.DisableSandbox {
		t.Fatal("expected sandbox override")
	}
	if got.MaxQueueSize != 0 {
		t.Fatalf("max queue size = %d", got.MaxQueueSize)
	}
}
