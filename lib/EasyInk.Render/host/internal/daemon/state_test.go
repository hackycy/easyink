package daemon

import (
	"os"
	"path/filepath"
	"testing"

	"easyink/render/host/internal/config"
)

func TestStateRoundTrip(t *testing.T) {
	cfg := config.Defaults()
	cfg.Browser.Path = filepath.Join(t.TempDir(), "chrome")
	if err := os.WriteFile(cfg.Browser.Path, []byte("fake"), 0o755); err != nil {
		t.Fatalf("write browser: %v", err)
	}
	cfg.ProfileRoot = t.TempDir()
	cfg.TempDir = t.TempDir()
	cfg.LogDir = t.TempDir()
	state := NewState(cfg, "ipc-path", "nonce")
	path := filepath.Join(t.TempDir(), "daemon.json")
	if err := SaveState(path, state); err != nil {
		t.Fatalf("save state: %v", err)
	}
	got, err := LoadState(path)
	if err != nil {
		t.Fatalf("load state: %v", err)
	}
	if got.IPC != "ipc-path" || got.Nonce != "nonce" {
		t.Fatalf("unexpected state: %#v", got)
	}
	if got.ConfigFingerprint != cfg.Fingerprint() {
		t.Fatalf("fingerprint = %q, want %q", got.ConfigFingerprint, cfg.Fingerprint())
	}
}
