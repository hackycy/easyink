package config

import (
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
)

type Config struct {
	Host             string
	Port             int
	BrowserPath      string
	ProfileRoot      string
	TempDir          string
	LogDir           string
	MaxConcurrency   int
	RequestTimeoutMs int
	AuthToken        string
}

func Parse(args []string) (Config, error) {
	cfg := Config{}
	fs := flag.NewFlagSet("easyink-render-host", flag.ContinueOnError)
	fs.StringVar(&cfg.Host, "host", "127.0.0.1", "loopback host to listen on")
	fs.IntVar(&cfg.Port, "port", 18181, "HTTP port")
	fs.StringVar(&cfg.BrowserPath, "browser-path", "", "Chrome for Testing executable path")
	fs.StringVar(&cfg.ProfileRoot, "profile-root", "", "Chrome profile cache root")
	fs.StringVar(&cfg.TempDir, "temp-dir", "", "temporary file directory")
	fs.StringVar(&cfg.LogDir, "log-dir", "", "diagnostics log directory")
	fs.IntVar(&cfg.MaxConcurrency, "max-concurrency", 2, "maximum concurrent render requests")
	fs.IntVar(&cfg.RequestTimeoutMs, "request-timeout-ms", 30000, "render request timeout in milliseconds")
	fs.StringVar(&cfg.AuthToken, "auth-token", "", "local bearer token")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	if cfg.ProfileRoot == "" {
		cfg.ProfileRoot = os.TempDir()
	}
	if cfg.TempDir == "" {
		cfg.TempDir = os.TempDir()
	}
	if cfg.LogDir == "" {
		cfg.LogDir = os.TempDir()
	}
	return cfg, cfg.Validate()
}

func (c Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func (c Config) Validate() error {
	if c.Host != "127.0.0.1" {
		return errors.New("host must be 127.0.0.1")
	}
	if c.Port <= 0 || c.Port > 65535 {
		return errors.New("port must be between 1 and 65535")
	}
	if c.AuthToken == "" {
		return errors.New("auth-token is required")
	}
	if c.BrowserPath == "" {
		return errors.New("browser-path is required")
	}
	if info, err := os.Stat(c.BrowserPath); err != nil {
		return fmt.Errorf("browser-path is not accessible: %w", err)
	} else if info.IsDir() {
		return errors.New("browser-path must point to an executable file")
	}
	if c.MaxConcurrency <= 0 {
		return errors.New("max-concurrency must be greater than 0")
	}
	if c.RequestTimeoutMs <= 0 {
		return errors.New("request-timeout-ms must be greater than 0")
	}
	for name, dir := range map[string]string{"profile-root": c.ProfileRoot, "temp-dir": c.TempDir, "log-dir": c.LogDir} {
		if err := ensureWritableDir(dir); err != nil {
			return fmt.Errorf("%s is not writable: %w", name, err)
		}
	}
	if ip := net.ParseIP(c.Host); ip == nil || !ip.IsLoopback() {
		return errors.New("host must be loopback")
	}
	return nil
}

func ensureWritableDir(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".easyink-write-test-*")
	if err != nil {
		return err
	}
	name := file.Name()
	if err := file.Close(); err != nil {
		return err
	}
	return os.Remove(name)
}
