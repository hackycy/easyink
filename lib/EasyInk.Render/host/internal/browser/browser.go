package browser

import (
	"context"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
)

type Manager struct {
	allocator context.Context
	cancel    context.CancelFunc
	path      string
	version   string
}

func New(ctx context.Context, browserPath, profileRoot string) (*Manager, error) {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(browserPath),
		chromedp.UserDataDir(profileRoot),
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("headless", "new"),
		chromedp.Flag("no-sandbox", true),
	)
	allocator, cancel := chromedp.NewExecAllocator(ctx, opts...)
	manager := &Manager{
		allocator: allocator,
		cancel:    cancel,
		path:      browserPath,
		version:   "unknown",
	}
	if err := manager.probeVersion(ctx); err != nil {
		cancel()
		return nil, err
	}
	return manager, nil
}

func (m *Manager) Version() string {
	return m.version
}

func (m *Manager) BrowserName() string {
	return "chrome-for-testing"
}

func (m *Manager) Shutdown() {
	m.cancel()
}

func (m *Manager) NewPage(parent context.Context) (context.Context, context.CancelFunc) {
	return chromedp.NewContext(m.allocator)
}

func (m *Manager) probeVersion(parent context.Context) error {
	ctx, cancel := chromedp.NewContext(m.allocator)
	defer cancel()
	ctx, timeoutCancel := context.WithTimeout(ctx, 10*time.Second)
	defer timeoutCancel()
	var value string
	if err := chromedp.Run(ctx, chromedp.Evaluate(`navigator.userAgent`, &value)); err != nil {
		return err
	}
	m.version = parseChromeVersion(value)
	return nil
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
