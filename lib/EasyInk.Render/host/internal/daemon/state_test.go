package daemon

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

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

func TestAcquireLockBlocksConcurrentOwner(t *testing.T) {
	path := filepath.Join(t.TempDir(), "daemon.start.lock")
	lock, err := AcquireLock(path, time.Second)
	if err != nil {
		t.Fatalf("acquire lock: %v", err)
	}
	defer lock.Release()

	if _, err := AcquireLock(path, 20*time.Millisecond); err == nil {
		t.Fatal("expected concurrent lock acquisition to fail")
	}
}

func TestAcquireLockRemovesDeadPIDLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "daemon.process.lock")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	data, err := json.Marshal(lockMetadata{
		PID:        -1,
		AcquiredAt: time.Now().Add(-time.Hour),
	})
	if err != nil {
		t.Fatalf("marshal lock: %v", err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o600); err != nil {
		t.Fatalf("write stale lock: %v", err)
	}
	old := time.Now().Add(-unknownLockStaleAfter - time.Second)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	lock, err := AcquireLock(path, time.Second)
	if err != nil {
		t.Fatalf("acquire after stale lock: %v", err)
	}
	lock.Release()
}

func TestLockReleaseDoesNotRemoveNewOwner(t *testing.T) {
	path := filepath.Join(t.TempDir(), "daemon.process.lock")
	first, err := AcquireLock(path, time.Second)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	firstMetadata := first.meta
	first.Release()

	second, err := AcquireLock(path, time.Second)
	if err != nil {
		t.Fatalf("second acquire: %v", err)
	}
	defer second.Release()

	first.meta = firstMetadata
	first.Release()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected second owner lock to remain: %v", err)
	}
}
