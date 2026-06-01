package browser

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"easyink/render/host/internal/config"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

const minChromiumMajorVersion = 80

var proxyEnvironmentKeys = []string{
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"ALL_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"all_proxy",
	"no_proxy",
}

type Manager struct {
	mu             sync.Mutex
	parent         context.Context
	browser        context.Context
	cancel         func()
	path           string
	name           string
	headless       string
	disableSandbox bool
	profileRoot    string
	version        string
	restarts       int
	lastError      string
	shutdown       bool
}

type Health struct {
	Ready     bool
	Name      string
	Version   string
	Restarts  int
	LastError string
}

type InspectResult struct {
	Name       string `json:"name"`
	Version    string `json:"version"`
	Headless   bool   `json:"headless"`
	CDP        bool   `json:"cdp"`
	PrintToPDF bool   `json:"printToPDF"`
}

func New(ctx context.Context, browserPath, profileRoot string) (*Manager, error) {
	return NewWithConfig(ctx, config.BrowserConfig{
		Path:         browserPath,
		HeadlessMode: "auto",
	}, profileRoot)
}

func NewWithConfig(ctx context.Context, browserConfig config.BrowserConfig, profileRoot string) (*Manager, error) {
	if strings.TrimSpace(browserConfig.HeadlessMode) == "" {
		browserConfig.HeadlessMode = "auto"
	}
	manager := &Manager{
		parent:         ctx,
		path:           browserConfig.Path,
		name:           config.BrowserNameChromium,
		headless:       browserConfig.HeadlessMode,
		disableSandbox: browserConfig.DisableSandbox,
		profileRoot:    profileRoot,
		version:        "unknown",
	}
	if err := manager.startLocked(); err != nil {
		return nil, err
	}
	return manager, nil
}

func (m *Manager) Version() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.version
}

func (m *Manager) BrowserName() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.name
}

func (m *Manager) Health(parent context.Context) Health {
	err := m.EnsureReady(parent)
	m.mu.Lock()
	defer m.mu.Unlock()
	if err != nil {
		return Health{
			Ready:     false,
			Name:      m.name,
			Version:   m.version,
			Restarts:  m.restarts,
			LastError: err.Error(),
		}
	}
	return Health{
		Ready:     true,
		Name:      m.name,
		Version:   m.version,
		Restarts:  m.restarts,
		LastError: m.lastError,
	}
}

func (m *Manager) EnsureReady(parent context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.shutdown {
		return context.Canceled
	}
	if parent != nil {
		select {
		case <-parent.Done():
			return parent.Err()
		default:
		}
	}
	if err := m.probeVersionLocked(); err != nil {
		m.lastError = err.Error()
		if restartErr := m.restartLocked(); restartErr != nil {
			m.lastError = restartErr.Error()
			return restartErr
		}
	}
	return nil
}

func (m *Manager) ForceRestart(parent context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.shutdown {
		return context.Canceled
	}
	if parent != nil {
		select {
		case <-parent.Done():
			return parent.Err()
		default:
		}
	}
	return m.restartLocked()
}

func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.shutdown {
		return
	}
	m.shutdown = true
	if m.cancel != nil {
		m.cancel()
	}
}

func (m *Manager) NewPage(parent context.Context) (context.Context, context.CancelFunc, error) {
	if err := m.EnsureReady(parent); err != nil {
		return nil, nil, err
	}
	m.mu.Lock()
	browserCtx := m.browser
	m.mu.Unlock()

	pageCtx, pageCancel := chromedp.NewContext(browserCtx, chromedp.WithNewBrowserContext())
	done := make(chan struct{})
	var once sync.Once
	cancel := func() {
		once.Do(func() {
			close(done)
			pageCancel()
		})
	}
	if parent == nil {
		parent = context.Background()
	}
	go func() {
		select {
		case <-parent.Done():
			cancel()
		case <-done:
		}
	}()
	return pageCtx, cancel, nil
}

func (m *Manager) startLocked() error {
	if strings.TrimSpace(m.path) == "" {
		return errors.New("browser path is required")
	}
	if info, err := os.Stat(m.path); err != nil {
		return fmt.Errorf("browser path is not accessible: %w", err)
	} else if info.IsDir() {
		return errors.New("browser path must point to an executable file")
	}
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(m.path),
		chromedp.UserDataDir(m.profileRoot),
		chromedp.Env(disabledProxyEnvironment()...),
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("proxy-server", "direct://"),
		chromedp.Flag("proxy-bypass-list", "*"),
	)
	if m.disableSandbox {
		opts = append(opts, chromedp.Flag("no-sandbox", true))
	}
	opts = append(opts, headlessOptions(m.headless)...)
	allocator, allocatorCancel := chromedp.NewExecAllocator(m.parent, opts...)
	browserCtx, browserCancel := chromedp.NewContext(allocator)
	m.browser = browserCtx
	m.cancel = func() {
		browserCancel()
		allocatorCancel()
	}
	if err := m.probeVersionLocked(); err != nil {
		m.cancel()
		m.lastError = err.Error()
		return err
	}
	m.lastError = ""
	return nil
}

func (m *Manager) restartLocked() error {
	if m.cancel != nil {
		m.cancel()
	}
	m.restarts++
	m.version = "unknown"
	return m.startLocked()
}

func disabledProxyEnvironment() []string {
	env := make([]string, 0, len(proxyEnvironmentKeys))
	for _, key := range proxyEnvironmentKeys {
		env = append(env, key+"=")
	}
	return env
}

func (m *Manager) probeVersionLocked() error {
	if m.shutdown {
		return context.Canceled
	}
	var value string
	if err := chromedp.Run(m.browser, chromedp.Evaluate(`navigator.userAgent`, &value)); err != nil {
		return err
	}
	if err := validateChromiumUserAgent(value); err != nil {
		return err
	}
	m.version = parseChromeVersion(value)
	m.name = parseBrowserName(value)
	return nil
}

func (m *Manager) stopForTest() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		m.cancel()
	}
}

func parseChromeVersion(userAgent string) string {
	for _, part := range strings.Fields(userAgent) {
		if strings.HasPrefix(part, "Chrome/") || strings.HasPrefix(part, "HeadlessChrome/") || strings.HasPrefix(part, "Chromium/") {
			items := strings.SplitN(part, "/", 2)
			if len(items) == 2 {
				return items[1]
			}
		}
	}
	return "unknown"
}

func parseBrowserName(userAgent string) string {
	lower := strings.ToLower(userAgent)
	switch {
	case strings.Contains(lower, "headlesschrome/"):
		return "chromium"
	case strings.Contains(lower, "chromium/"):
		return "chromium"
	case strings.Contains(lower, "chrome/"):
		return "chromium"
	default:
		return "unknown"
	}
}

func parseChromeMajorVersion(userAgent string) (int, bool) {
	version := parseChromeVersion(userAgent)
	if version == "unknown" {
		return 0, false
	}
	majorText, _, _ := strings.Cut(version, ".")
	major, err := strconv.Atoi(majorText)
	if err != nil {
		return 0, false
	}
	return major, true
}

func validateChromiumUserAgent(userAgent string) error {
	lower := strings.ToLower(userAgent)
	if strings.Contains(lower, "edg/") {
		return errors.New("browser must be Chromium or Chrome; Microsoft Edge is not supported")
	}
	major, ok := parseChromeMajorVersion(userAgent)
	if !ok {
		return errors.New("browser must be Chromium-compatible and expose a Chrome/Chromium user agent")
	}
	if major < minChromiumMajorVersion {
		return fmt.Errorf("chromium version %d is not supported; minimum supported major version is %d", major, minChromiumMajorVersion)
	}
	return nil
}

func headlessOptions(mode string) []chromedp.ExecAllocatorOption {
	switch mode {
	case "none":
		return nil
	case "old":
		return []chromedp.ExecAllocatorOption{chromedp.Flag("headless", true)}
	case "new":
		return []chromedp.ExecAllocatorOption{chromedp.Flag("headless", "new")}
	default:
		return []chromedp.ExecAllocatorOption{chromedp.Flag("headless", true)}
	}
}

func Inspect(ctx context.Context, browserConfig config.BrowserConfig, profileRoot string) (InspectResult, error) {
	if profileRoot == "" {
		profileRoot = os.TempDir()
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	manager, err := NewWithConfig(ctx, browserConfig, profileRoot)
	if err != nil {
		return InspectResult{}, err
	}
	defer manager.Shutdown()

	pageCtx, pageCancel, err := manager.NewPage(ctx)
	if err != nil {
		return InspectResult{}, err
	}
	defer pageCancel()

	printOK := false
	if err := chromedp.Run(pageCtx, chromedp.ActionFunc(func(ctx context.Context) error {
		_, _, err := page.PrintToPDF().Do(ctx)
		if err == nil {
			printOK = true
		}
		return err
	})); err != nil {
		return InspectResult{}, err
	}

	health := manager.Health(ctx)
	return InspectResult{
		Name:       health.Name,
		Version:    health.Version,
		Headless:   browserConfig.HeadlessMode != "none",
		CDP:        health.Ready,
		PrintToPDF: printOK,
	}, nil
}
