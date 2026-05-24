package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseRequiresLoopbackAndToken(t *testing.T) {
	browser := filepath.Join(t.TempDir(), "chrome")
	if err := os.WriteFile(browser, []byte("fake"), 0o755); err != nil {
		t.Fatalf("write browser: %v", err)
	}

	_, err := Parse([]string{
		"--host", "0.0.0.0",
		"--auth-token", "token",
		"--browser-path", browser,
	})
	if err == nil {
		t.Fatal("expected non-loopback host to fail")
	}

	_, err = Parse([]string{
		"--host", "127.0.0.1",
		"--browser-path", browser,
	})
	if err == nil {
		t.Fatal("expected missing token to fail")
	}
}

func TestParseAcceptsMaxQueueSize(t *testing.T) {
	browser := filepath.Join(t.TempDir(), "chrome")
	if err := os.WriteFile(browser, []byte("fake"), 0o755); err != nil {
		t.Fatalf("write browser: %v", err)
	}

	cfg, err := Parse([]string{
		"--host", "127.0.0.1",
		"--auth-token", "token",
		"--browser-path", browser,
		"--max-queue-size", "7",
	})
	if err != nil {
		t.Fatalf("parse config: %v", err)
	}
	if cfg.MaxQueueSize != 7 {
		t.Fatalf("max queue size = %d", cfg.MaxQueueSize)
	}

	_, err = Parse([]string{
		"--host", "127.0.0.1",
		"--auth-token", "token",
		"--browser-path", browser,
		"--max-queue-size", "-1",
	})
	if err == nil {
		t.Fatal("expected negative max queue size to fail")
	}
}
