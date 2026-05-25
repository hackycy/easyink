//go:build !windows

package ipc

import (
	"errors"
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestListenDoesNotRemoveLiveUnixSocket(t *testing.T) {
	endpoint := filepath.Join(t.TempDir(), "daemon.sock")
	listener, err := Listen(endpoint)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()
	defer Remove(endpoint)

	_, err = Listen(endpoint)
	if !errors.Is(err, os.ErrExist) {
		t.Fatalf("second listen error = %v, want os.ErrExist", err)
	}

	conn, err := net.Dial("unix", endpoint)
	if err != nil {
		t.Fatalf("original socket should remain dialable: %v", err)
	}
	_ = conn.Close()
}

func TestListenRemovesStaleUnixSocket(t *testing.T) {
	endpoint := filepath.Join(t.TempDir(), "daemon.sock")
	if err := os.MkdirAll(filepath.Dir(endpoint), 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(endpoint, nil, 0o600); err != nil {
		t.Fatalf("write stale endpoint: %v", err)
	}

	listener, err := Listen(endpoint)
	if err != nil {
		t.Fatalf("listen after stale endpoint: %v", err)
	}
	defer listener.Close()
	defer Remove(endpoint)
}
