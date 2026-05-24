package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"easyink/render/host/internal/browser"
	"easyink/render/host/internal/config"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/render"
)

func TestAuthRejectsMissingToken(t *testing.T) {
	s := &Server{cfg: config.Config{AuthToken: "token"}}
	req := httptest.NewRequest(http.MethodGet, "/v1/info", nil)
	rec := httptest.NewRecorder()
	s.auth(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	})(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestAuthAllowsBearerToken(t *testing.T) {
	s := &Server{cfg: config.Config{AuthToken: "token"}}
	req := httptest.NewRequest(http.MethodGet, "/v1/info", nil)
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()
	called := false
	s.auth(func(w http.ResponseWriter, r *http.Request) {
		called = true
	})(rec, req)
	if !called {
		t.Fatal("handler was not called")
	}
}

func TestPersistDiagnosticsWritesSummaryAndSetsAttachmentPath(t *testing.T) {
	dir := t.TempDir()
	s := &Server{cfg: config.Config{LogDir: dir}}
	diag := s.persistDiagnostics(
		protocol.Diagnostics{
			ID:        "diag-test",
			RequestID: "req-test",
		},
		render.DiagnosticAttachments{
			HTMLSnapshot: []byte("<html></html>"),
			Screenshot:   []byte("png"),
		},
		protocol.DiagnosticsOptions{},
	)
	if diag.AttachmentPath == "" {
		t.Fatal("expected attachment path")
	}
	if diag.HTMLSnapshotPath != "" {
		t.Fatal("expected html snapshot path to be omitted by default")
	}
	if diag.ScreenshotPath != "" {
		t.Fatal("expected screenshot path to be omitted by default")
	}
	if diag.LogPath == "" {
		t.Fatal("expected log path")
	}
	if filepath.Dir(diag.AttachmentPath) != filepath.Join(dir, "diagnostics", "diag-test") {
		t.Fatalf("unexpected attachment path: %s", diag.AttachmentPath)
	}
	data, err := os.ReadFile(diag.AttachmentPath)
	if err != nil {
		t.Fatalf("read diagnostics summary: %v", err)
	}
	var parsed protocol.Diagnostics
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("parse diagnostics summary: %v", err)
	}
	if parsed.RequestID != "req-test" {
		t.Fatalf("requestId = %q", parsed.RequestID)
	}
	if parsed.LogPath != diag.LogPath {
		t.Fatalf("summary logPath = %q, want %q", parsed.LogPath, diag.LogPath)
	}
	logData, err := os.ReadFile(diag.LogPath)
	if err != nil {
		t.Fatalf("read diagnostics log: %v", err)
	}
	if !strings.Contains(string(logData), "requestId=req-test") {
		t.Fatalf("log did not include requestId: %s", string(logData))
	}
}

func TestPersistDiagnosticsWritesRequestedAttachments(t *testing.T) {
	dir := t.TempDir()
	s := &Server{cfg: config.Config{LogDir: dir}}
	diag := s.persistDiagnostics(
		protocol.Diagnostics{
			ID:        "diag-test",
			RequestID: "req-test",
		},
		render.DiagnosticAttachments{
			HTMLSnapshot: []byte("<html></html>"),
			Screenshot:   []byte("png"),
		},
		protocol.DiagnosticsOptions{
			IncludeHTMLSnapshot: true,
			IncludeScreenshot:   true,
		},
	)
	if diag.HTMLSnapshotPath == "" {
		t.Fatal("expected html snapshot path")
	}
	if diag.ScreenshotPath == "" {
		t.Fatal("expected screenshot path")
	}
	if _, err := os.Stat(diag.HTMLSnapshotPath); err != nil {
		t.Fatalf("expected html snapshot on disk: %v", err)
	}
	if _, err := os.Stat(diag.ScreenshotPath); err != nil {
		t.Fatalf("expected screenshot on disk: %v", err)
	}
}

func TestSanitizedHeadersRedactsSecrets(t *testing.T) {
	headers := http.Header{}
	headers.Set("Authorization", "Bearer secret")
	headers.Set("X-EasyInk-Auth-Token", "secret")
	headers.Set("X-Trace-Id", "trace")

	got := sanitizedHeaders(headers)

	if got["Authorization"] != "[redacted]" {
		t.Fatalf("authorization = %q", got["Authorization"])
	}
	if got["X-Easyink-Auth-Token"] != "[redacted]" {
		t.Fatalf("token = %q", got["X-Easyink-Auth-Token"])
	}
	if got["X-Trace-Id"] != "trace" {
		t.Fatalf("trace = %q", got["X-Trace-Id"])
	}
}

func TestAcquireRenderSlotQueuesPendingRequest(t *testing.T) {
	s := &Server{
		cfg: config.Config{
			MaxConcurrency: 1,
			MaxQueueSize:   1,
		},
		sem:   make(chan struct{}, 1),
		queue: make(chan struct{}, 1),
	}
	releaseFirst, ok := s.acquireRenderSlot(context.Background())
	if !ok {
		t.Fatal("expected first request to acquire render slot")
	}

	acquiredSecond := make(chan func(), 1)
	go func() {
		releaseSecond, ok := s.acquireRenderSlot(context.Background())
		if ok {
			acquiredSecond <- releaseSecond
			return
		}
		acquiredSecond <- nil
	}()
	waitForPending(t, s, 1)

	_, ok = s.acquireRenderSlot(context.Background())
	if ok {
		t.Fatal("expected third request to be rejected when queue is full")
	}

	releaseFirst()
	releaseFirst = func() {}

	select {
	case releaseSecond := <-acquiredSecond:
		if releaseSecond == nil {
			t.Fatal("expected queued request to acquire render slot")
		}
		defer releaseSecond()
	case <-time.After(2 * time.Second):
		t.Fatal("queued request did not acquire render slot")
	}
	waitForPending(t, s, 0)
}

func TestHealthReportsQueueState(t *testing.T) {
	s := &Server{
		cfg: config.Config{
			AuthToken:      "token",
			MaxConcurrency: 2,
			MaxQueueSize:   3,
		},
		sem:   make(chan struct{}, 2),
		queue: make(chan struct{}, 3),
	}
	s.running.Store(1)
	s.pending.Store(2)
	req := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()

	s.health(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var parsed protocol.HealthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("parse health response: %v", err)
	}
	if parsed.Queue.Running != 1 || parsed.Queue.Pending != 2 || parsed.Queue.MaxConcurrency != 2 || parsed.Queue.MaxQueueSize != 3 {
		t.Fatalf("unexpected queue state: %#v", parsed.Queue)
	}
}

func waitForPending(t *testing.T, s *Server, want int64) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if got := s.pending.Load(); got == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("pending = %d, want %d", s.pending.Load(), want)
}

func TestPrintPDFRejectsUnsupportedWaitUntil(t *testing.T) {
	dir := t.TempDir()
	s := &Server{
		cfg: config.Config{
			AuthToken:        "token",
			LogDir:           dir,
			MaxConcurrency:   1,
			MaxQueueSize:     1,
			RequestTimeoutMs: 30000,
		},
		renderer: render.NewService(nil),
		sem:      make(chan struct{}, 1),
		queue:    make(chan struct{}, 1),
	}
	body := []byte(`{
		"requestId": "req-invalid-wait",
		"source": {
			"type": "html",
			"html": "<!doctype html><html><body>Invalid wait</body></html>"
		},
		"wait": {"until": "paint"}
	}`)
	req := httptest.NewRequest(http.MethodPost, "/v1/render/print-pdf", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()

	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var parsed protocol.ErrorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if parsed.Error.Code != protocol.ErrInvalidRequest {
		t.Fatalf("error code = %q", parsed.Error.Code)
	}
	if parsed.Diagnostics.AttachmentPath == "" {
		t.Fatal("expected diagnostics summary path")
	}
	if parsed.Diagnostics.LogPath == "" {
		t.Fatal("expected diagnostics log path")
	}
	if rec.Header().Get("X-EasyInk-Request-Id") != "req-invalid-wait" {
		t.Fatalf("request header = %q", rec.Header().Get("X-EasyInk-Request-Id"))
	}
	if rec.Header().Get("X-EasyInk-Diagnostics-Id") != parsed.Diagnostics.ID {
		t.Fatalf("diagnostics header = %q, want %q", rec.Header().Get("X-EasyInk-Diagnostics-Id"), parsed.Diagnostics.ID)
	}
	if _, err := os.Stat(parsed.Diagnostics.AttachmentPath); err != nil {
		t.Fatalf("expected diagnostics summary on disk: %v", err)
	}
	if _, err := os.Stat(parsed.Diagnostics.LogPath); err != nil {
		t.Fatalf("expected diagnostics log on disk: %v", err)
	}
}

func TestAcquireRenderSlotStopsWhenServerCloses(t *testing.T) {
	s := &Server{
		cfg: config.Config{
			MaxConcurrency: 1,
			MaxQueueSize:   1,
		},
		sem:   make(chan struct{}, 1),
		queue: make(chan struct{}, 1),
		stop:  make(chan struct{}),
	}
	close(s.stop)
	s.closed.Store(true)

	if release, ok := s.acquireRenderSlot(context.Background()); ok || release != nil {
		t.Fatal("expected closed server to reject render slots")
	}
}

func TestPrintPDFReturnsServiceUnavailableWhenShuttingDown(t *testing.T) {
	s := &Server{
		cfg: config.Config{
			AuthToken:        "token",
			MaxConcurrency:   1,
			MaxQueueSize:     1,
			RequestTimeoutMs: 30000,
		},
		renderer: render.NewService(nil),
		sem:      make(chan struct{}, 1),
		queue:    make(chan struct{}, 1),
		stop:     make(chan struct{}),
	}
	close(s.stop)
	s.closed.Store(true)

	req := httptest.NewRequest(http.MethodPost, "/v1/render/print-pdf", bytes.NewReader([]byte(`{
		"requestId": "req-shutdown",
		"source": {
			"type": "html",
			"html": "<!doctype html><html><body>Shutdown</body></html>"
		}
	}`)))
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()

	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var parsed protocol.ErrorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if parsed.Error.Code != protocol.ErrRenderFailed {
		t.Fatalf("error code = %q", parsed.Error.Code)
	}
}

func TestHTTPPrintPDFEndToEnd(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	manager, err := browser.New(ctx, browserPath, t.TempDir())
	if err != nil {
		t.Fatalf("start browser: %v", err)
	}
	defer manager.Shutdown()

	logDir := t.TempDir()
	srv := New(config.Config{
		Host:             "127.0.0.1",
		Port:             18181,
		LogDir:           logDir,
		MaxConcurrency:   1,
		MaxQueueSize:     1,
		RequestTimeoutMs: 5000,
		AuthToken:        "token",
	}, manager)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	reqBody := []byte(`{
		"requestId": "req-http-e2e",
		"source": {
			"type": "html",
			"html": "<!doctype html><html><body><main class=\"easyink-ready\">HTTP E2E</main></body></html>"
		},
		"wait": {"until": "load"},
		"output": {"type": "base64Json"},
		"diagnostics": {"includeRequestHeaders": true}
	}`)
	req, err := http.NewRequest(http.MethodPost, ts.URL+"/v1/render/print-pdf", bytes.NewReader(reqBody))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer token")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http request: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body = %s", resp.StatusCode, string(body))
	}
	if resp.Header.Get("Content-Type") != "application/json" {
		t.Fatalf("content-type = %q", resp.Header.Get("Content-Type"))
	}
	if resp.Header.Get("X-EasyInk-Request-Id") != "req-http-e2e" {
		t.Fatalf("request header = %q", resp.Header.Get("X-EasyInk-Request-Id"))
	}
	var parsed protocol.Base64PDFResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if !parsed.Success {
		t.Fatal("expected success response")
	}
	if parsed.RequestID != "req-http-e2e" {
		t.Fatalf("requestId = %q", parsed.RequestID)
	}
	if parsed.PageCount == 0 {
		t.Fatal("expected page count")
	}
	if parsed.Diagnostics.AttachmentPath == "" || parsed.Diagnostics.LogPath == "" {
		t.Fatalf("expected diagnostics paths, got %#v", parsed.Diagnostics)
	}
	if parsed.Diagnostics.RequestHeaders["Authorization"] != "[redacted]" {
		t.Fatalf("expected authorization to be redacted, got %#v", parsed.Diagnostics.RequestHeaders)
	}
	if resp.Header.Get("X-EasyInk-Diagnostics-Id") != parsed.Diagnostics.ID {
		t.Fatalf("diagnostics header = %q, want %q", resp.Header.Get("X-EasyInk-Diagnostics-Id"), parsed.Diagnostics.ID)
	}
	if _, err := os.Stat(parsed.Diagnostics.AttachmentPath); err != nil {
		t.Fatalf("expected diagnostics summary on disk: %v", err)
	}
	if _, err := os.Stat(parsed.Diagnostics.LogPath); err != nil {
		t.Fatalf("expected diagnostics log on disk: %v", err)
	}
}
