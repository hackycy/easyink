package browser

import (
	"context"
	"strings"
	"sync"

	"github.com/chromedp/chromedp"
)

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
	mu          sync.Mutex
	parent      context.Context
	browser     context.Context
	cancel      func()
	path        string
	profileRoot string
	version     string
	restarts    int
	lastError   string
	shutdown    bool
}

type Health struct {
	Ready     bool
	Version   string
	Restarts  int
	LastError string
}

func New(ctx context.Context, browserPath, profileRoot string) (*Manager, error) {
	manager := &Manager{
		parent:      ctx,
		path:        browserPath,
		profileRoot: profileRoot,
		version:     "unknown",
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
	return "chrome-for-testing"
}

func (m *Manager) Health(parent context.Context) Health {
	err := m.EnsureReady(parent)
	m.mu.Lock()
	defer m.mu.Unlock()
	if err != nil {
		return Health{
			Ready:     false,
			Version:   m.version,
			Restarts:  m.restarts,
			LastError: err.Error(),
		}
	}
	return Health{
		Ready:     true,
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
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(m.path),
		chromedp.UserDataDir(m.profileRoot),
		chromedp.Env(disabledProxyEnvironment()...),
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("headless", "new"),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("proxy-server", "direct://"),
		chromedp.Flag("proxy-bypass-list", "*"),
	)
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
	m.version = parseChromeVersion(value)
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
		if strings.HasPrefix(part, "Chrome/") || strings.HasPrefix(part, "HeadlessChrome/") {
			items := strings.SplitN(part, "/", 2)
			if len(items) == 2 {
				return items[1]
			}
		}
	}
	return "unknown"
}
