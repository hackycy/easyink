//go:build !windows

package ipc

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"time"
)

func DefaultEndpoint() string {
	if dir := os.Getenv("XDG_RUNTIME_DIR"); dir != "" {
		return filepath.Join(dir, "easyink-render", "daemon.sock")
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".easyink-render", "run", "daemon.sock")
	}
	return filepath.Join(os.TempDir(), "easyink-render", "daemon.sock")
}

func Listen(endpoint string) (net.Listener, error) {
	if err := os.MkdirAll(filepath.Dir(endpoint), 0o700); err != nil {
		return nil, err
	}
	if err := removeStaleEndpoint(endpoint); err != nil {
		return nil, err
	}
	listener, err := net.Listen("unix", endpoint)
	if err != nil {
		return nil, err
	}
	_ = os.Chmod(endpoint, 0o600)
	return listener, nil
}

func Dial(ctx context.Context, endpoint string) (net.Conn, error) {
	dialer := net.Dialer{}
	return dialer.DialContext(ctx, "unix", endpoint)
}

func Remove(endpoint string) {
	_ = os.Remove(endpoint)
}

func removeStaleEndpoint(endpoint string) error {
	conn, err := net.DialTimeout("unix", endpoint, 200*time.Millisecond)
	if err == nil {
		_ = conn.Close()
		return os.ErrExist
	}
	if _, statErr := os.Stat(endpoint); statErr == nil {
		return os.Remove(endpoint)
	} else if os.IsNotExist(statErr) {
		return nil
	} else {
		return statErr
	}
}
