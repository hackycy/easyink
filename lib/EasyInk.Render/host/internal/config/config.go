package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"easyink/render/host/internal/protocol"
)

type BrowserConfig struct {
	Kind         string `json:"kind"`
	Path         string `json:"path"`
	Channel      string `json:"channel,omitempty"`
	Version      string `json:"version,omitempty"`
	HeadlessMode string `json:"headlessMode"`
}

type RuntimeConfig struct {
	Browser          BrowserConfig `json:"browser"`
	ProfileRoot      string        `json:"profileRoot"`
	TempDir          string        `json:"tempDir"`
	LogDir           string        `json:"logDir"`
	MaxConcurrency   int           `json:"maxConcurrency"`
	MaxQueueSize     int           `json:"maxQueueSize"`
	RequestTimeoutMs int           `json:"requestTimeoutMs"`
	IdleTimeoutMs    int           `json:"idleTimeoutMs"`
}

type Override struct {
	BrowserKind      string
	BrowserPath      string
	HeadlessMode     string
	ProfileRoot      string
	TempDir          string
	LogDir           string
	MaxConcurrency   int
	MaxQueueSize     *int
	RequestTimeoutMs int
	IdleTimeoutMs    int
}

var SupportedBrowserKinds = map[string]bool{
	"chrome-for-testing": true,
	"chromium":           true,
	"chrome":             true,
	"edge":               true,
	"headless-shell":     true,
	"custom":             true,
}

var SupportedHeadlessModes = map[string]bool{
	"auto":  true,
	"new":   true,
	"old":   true,
	"shell": true,
	"none":  true,
}

func Defaults() RuntimeConfig {
	stateRoot := StateRoot()
	return RuntimeConfig{
		Browser: BrowserConfig{
			Kind:         "chrome-for-testing",
			HeadlessMode: "auto",
		},
		ProfileRoot:      filepath.Join(stateRoot, "profile"),
		TempDir:          filepath.Join(stateRoot, "temp"),
		LogDir:           filepath.Join(stateRoot, "logs"),
		MaxConcurrency:   2,
		MaxQueueSize:     16,
		RequestTimeoutMs: 30000,
		IdleTimeoutMs:    0,
	}
}

func LoadRuntime() (RuntimeConfig, error) {
	cfg := Defaults()
	path := ConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ApplyEnvironment(cfg), nil
		}
		return RuntimeConfig{}, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return RuntimeConfig{}, err
	}
	return ApplyEnvironment(cfg), nil
}

func SaveRuntime(cfg RuntimeConfig) error {
	if err := cfg.ValidateRuntime(false); err != nil {
		return err
	}
	path := ConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

func ApplyEnvironment(cfg RuntimeConfig) RuntimeConfig {
	if value := os.Getenv("EASYINK_RENDER_BROWSER_KIND"); value != "" {
		cfg.Browser.Kind = value
	}
	if value := os.Getenv("EASYINK_RENDER_BROWSER_PATH"); value != "" {
		cfg.Browser.Path = value
	}
	if value := os.Getenv("EASYINK_RENDER_PROFILE_ROOT"); value != "" {
		cfg.ProfileRoot = value
	}
	if value := os.Getenv("EASYINK_RENDER_TEMP_DIR"); value != "" {
		cfg.TempDir = value
	}
	if value := os.Getenv("EASYINK_RENDER_LOG_DIR"); value != "" {
		cfg.LogDir = value
	}
	if value := os.Getenv("EASYINK_RENDER_IDLE_TIMEOUT_MS"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			cfg.IdleTimeoutMs = parsed
		}
	}
	return cfg
}

func MergeOverride(cfg RuntimeConfig, override Override) RuntimeConfig {
	if override.BrowserKind != "" {
		cfg.Browser.Kind = override.BrowserKind
	}
	if override.BrowserPath != "" {
		cfg.Browser.Path = override.BrowserPath
	}
	if override.HeadlessMode != "" {
		cfg.Browser.HeadlessMode = override.HeadlessMode
	}
	if override.ProfileRoot != "" {
		cfg.ProfileRoot = override.ProfileRoot
	}
	if override.TempDir != "" {
		cfg.TempDir = override.TempDir
	}
	if override.LogDir != "" {
		cfg.LogDir = override.LogDir
	}
	if override.MaxConcurrency > 0 {
		cfg.MaxConcurrency = override.MaxConcurrency
	}
	if override.MaxQueueSize != nil {
		cfg.MaxQueueSize = *override.MaxQueueSize
	}
	if override.RequestTimeoutMs > 0 {
		cfg.RequestTimeoutMs = override.RequestTimeoutMs
	}
	if override.IdleTimeoutMs >= 0 {
		cfg.IdleTimeoutMs = override.IdleTimeoutMs
	}
	return cfg
}

func (c RuntimeConfig) ValidateRuntime(requireBrowserPath bool) error {
	if strings.TrimSpace(c.Browser.Kind) == "" {
		return errors.New("browser.kind is required")
	}
	if !SupportedBrowserKinds[c.Browser.Kind] {
		return fmt.Errorf("unsupported browser.kind: %s", c.Browser.Kind)
	}
	if c.Browser.HeadlessMode == "" {
		c.Browser.HeadlessMode = "auto"
	}
	if !SupportedHeadlessModes[c.Browser.HeadlessMode] {
		return fmt.Errorf("unsupported browser.headlessMode: %s", c.Browser.HeadlessMode)
	}
	if requireBrowserPath && strings.TrimSpace(c.Browser.Path) == "" {
		return errors.New("browser.path is required")
	}
	if strings.TrimSpace(c.Browser.Path) != "" {
		if info, err := os.Stat(c.Browser.Path); err != nil {
			return fmt.Errorf("browser.path is not accessible: %w", err)
		} else if info.IsDir() {
			return errors.New("browser.path must point to an executable file")
		}
	}
	if c.MaxConcurrency <= 0 {
		return errors.New("maxConcurrency must be greater than 0")
	}
	if c.MaxQueueSize < 0 {
		return errors.New("maxQueueSize must be greater than or equal to 0")
	}
	if c.RequestTimeoutMs <= 0 {
		return errors.New("requestTimeoutMs must be greater than 0")
	}
	if c.IdleTimeoutMs < 0 {
		return errors.New("idleTimeoutMs must be greater than or equal to 0")
	}
	for name, dir := range map[string]string{"profileRoot": c.ProfileRoot, "tempDir": c.TempDir, "logDir": c.LogDir} {
		if err := ensureWritableDir(dir); err != nil {
			return fmt.Errorf("%s is not writable: %w", name, err)
		}
	}
	return nil
}

func (c RuntimeConfig) Fingerprint() string {
	payload := struct {
		Browser          BrowserConfig `json:"browser"`
		ProfileRoot      string        `json:"profileRoot"`
		TempDir          string        `json:"tempDir"`
		LogDir           string        `json:"logDir"`
		MaxConcurrency   int           `json:"maxConcurrency"`
		MaxQueueSize     int           `json:"maxQueueSize"`
		RequestTimeoutMs int           `json:"requestTimeoutMs"`
		IdleTimeoutMs    int           `json:"idleTimeoutMs"`
		HostVersion      string        `json:"hostVersion"`
		ProtocolVersion  string        `json:"protocolVersion"`
	}{
		Browser:          c.Browser,
		ProfileRoot:      filepath.Clean(c.ProfileRoot),
		TempDir:          filepath.Clean(c.TempDir),
		LogDir:           filepath.Clean(c.LogDir),
		MaxConcurrency:   c.MaxConcurrency,
		MaxQueueSize:     c.MaxQueueSize,
		RequestTimeoutMs: c.RequestTimeoutMs,
		IdleTimeoutMs:    c.IdleTimeoutMs,
		HostVersion:      protocol.HostVersion,
		ProtocolVersion:  protocol.ProtocolVersion,
	}
	data, _ := json.Marshal(payload)
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func ConfigPath() string {
	if runtime.GOOS == "windows" {
		if dir := os.Getenv("APPDATA"); dir != "" {
			return filepath.Join(dir, "EasyInk.Render", "config.json")
		}
	}
	if dir := os.Getenv("XDG_CONFIG_HOME"); dir != "" {
		return filepath.Join(dir, "easyink-render", "config.json")
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		if runtime.GOOS == "windows" {
			return filepath.Join(home, "AppData", "Roaming", "EasyInk.Render", "config.json")
		}
		return filepath.Join(home, ".config", "easyink-render", "config.json")
	}
	return filepath.Join(os.TempDir(), "easyink-render", "config.json")
}

func StateRoot() string {
	if runtime.GOOS == "windows" {
		if dir := os.Getenv("LOCALAPPDATA"); dir != "" {
			return filepath.Join(dir, "EasyInk.Render")
		}
		if home, err := os.UserHomeDir(); err == nil && home != "" {
			return filepath.Join(home, "AppData", "Local", "EasyInk.Render")
		}
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".easyink-render")
	}
	return filepath.Join(os.TempDir(), "easyink-render")
}

func StatePath() string {
	return filepath.Join(StateRoot(), "daemon.json")
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
