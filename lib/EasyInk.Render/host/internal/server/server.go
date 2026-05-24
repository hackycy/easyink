package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"easyink/render/host/internal/browser"
	"easyink/render/host/internal/config"
	"easyink/render/host/internal/diagnostics"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/render"
)

type Server struct {
	cfg      config.Config
	browser  *browser.Manager
	renderer *render.Service
	sem      chan struct{}
	queue    chan struct{}
	shutdown sync.Once
	stop     chan struct{}
	closed   atomic.Bool
	running  atomic.Int64
	pending  atomic.Int64
}

func New(cfg config.Config, browserManager *browser.Manager) *Server {
	return &Server{
		cfg:      cfg,
		browser:  browserManager,
		renderer: render.NewService(browserManager),
		sem:      make(chan struct{}, cfg.MaxConcurrency),
		queue:    make(chan struct{}, cfg.MaxQueueSize),
		stop:     make(chan struct{}),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/info", s.auth(s.info))
	mux.HandleFunc("/v1/health", s.auth(s.health))
	mux.HandleFunc("/v1/render/print-pdf", s.auth(s.printPDF))
	return mux
}

func (s *Server) Run(ctx context.Context) error {
	httpServer := &http.Server{
		Addr:              s.cfg.Addr(),
		Handler:           s.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Printf("easyink-render-host listening on http://%s", s.cfg.Addr())
		errCh <- httpServer.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
		s.closed.Store(true)
		s.shutdown.Do(func() {
			close(s.stop)
		})
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return ctx.Err()
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func (s *Server) info(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "", protocol.ErrInvalidRequest, "method not allowed", nil, emptyDiagnostics(""))
		return
	}
	browserName := "chrome-for-testing"
	browserVersion := "unavailable"
	if s.browser != nil {
		browserName = s.browser.BrowserName()
		browserVersion = s.browser.Version()
	}
	writeJSON(w, http.StatusOK, protocol.InfoResponse{
		HostVersion:     protocol.HostVersion,
		ProtocolVersion: protocol.ProtocolVersion,
		BrowserName:     browserName,
		BrowserVersion:  browserVersion,
		Capabilities: []string{
			"print-pdf",
			"source-html",
			"source-pdf",
			"source-easyink",
			"diagnostics",
		},
	})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "", protocol.ErrInvalidRequest, "method not allowed", nil, emptyDiagnostics(""))
		return
	}
	browserHealth := browser.Health{
		Ready:     false,
		Version:   "unavailable",
		LastError: "browser manager is not configured",
	}
	if s.browser != nil {
		browserHealth = s.browser.Health(r.Context())
	}
	status := "ok"
	browserStatus := "ready"
	if !browserHealth.Ready {
		status = "degraded"
		browserStatus = "recovering"
	}
	writeJSON(w, http.StatusOK, protocol.HealthResponse{
		Status: status,
		Browser: protocol.BrowserHealth{
			Status:    browserStatus,
			Version:   browserHealth.Version,
			Restarts:  browserHealth.Restarts,
			LastError: browserHealth.LastError,
		},
		Queue: protocol.QueueHealth{
			Running:        int(s.running.Load()),
			Pending:        int(s.pending.Load()),
			MaxConcurrency: s.cfg.MaxConcurrency,
			MaxQueueSize:   s.cfg.MaxQueueSize,
		},
	})
}

func (s *Server) printPDF(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "", protocol.ErrInvalidRequest, "method not allowed", nil, emptyDiagnostics(""))
		return
	}
	if s.closed.Load() {
		writeError(w, http.StatusServiceUnavailable, "", protocol.ErrRenderFailed, "server is shutting down", nil, emptyDiagnostics(""))
		return
	}
	release, ok := s.acquireRenderSlot(r.Context())
	if !ok {
		status := http.StatusTooManyRequests
		code := protocol.ErrTooManyRequests
		message := "render queue is full"
		if s.closed.Load() {
			status = http.StatusServiceUnavailable
			code = protocol.ErrRenderFailed
			message = "server is shutting down"
		}
		writeError(w, status, "", code, message, nil, emptyDiagnostics(""))
		return
	}
	defer release()
	s.running.Add(1)
	defer s.running.Add(-1)

	var req protocol.PrintPDFRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "", protocol.ErrInvalidRequest, err.Error(), nil, emptyDiagnostics(""))
		return
	}

	timeoutMs := s.cfg.RequestTimeoutMs
	if req.Wait.TimeoutMs > 0 && req.Wait.TimeoutMs < timeoutMs {
		timeoutMs = req.Wait.TimeoutMs
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	result, err := s.renderer.RenderPrintPDF(ctx, req)
	result.Diagnostics = s.persistDiagnostics(result.Diagnostics, result.Attachments)
	if err != nil {
		status := statusFor(err)
		coded := codedError(err)
		writeError(w, status, req.RequestID, coded.Code, coded.Message, coded.Details, result.Diagnostics)
		return
	}

	if req.Output.Type == "base64Json" {
		w.Header().Set("X-EasyInk-Request-Id", req.RequestID)
		w.Header().Set("X-EasyInk-Diagnostics-Id", result.Diagnostics.ID)
		writeJSON(w, http.StatusOK, protocol.Base64PDFResponse{
			Success:     true,
			RequestID:   req.RequestID,
			ContentType: "application/pdf",
			Base64:      base64.StdEncoding.EncodeToString(result.PDF),
			PageCount:   result.PageCount,
			Diagnostics: result.Diagnostics,
		})
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("X-EasyInk-Request-Id", req.RequestID)
	w.Header().Set("X-EasyInk-Diagnostics-Id", result.Diagnostics.ID)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(result.PDF)
}

func (s *Server) acquireRenderSlot(ctx context.Context) (func(), bool) {
	if s.closed.Load() {
		return nil, false
	}
	select {
	case s.sem <- struct{}{}:
		return func() { <-s.sem }, true
	default:
	}
	if s.cfg.MaxQueueSize <= 0 {
		return nil, false
	}
	select {
	case s.queue <- struct{}{}:
		s.pending.Add(1)
		defer func() {
			<-s.queue
			s.pending.Add(-1)
		}()
	case <-ctx.Done():
		return nil, false
	case <-s.stop:
		return nil, false
	default:
		return nil, false
	}
	select {
	case s.sem <- struct{}{}:
		return func() { <-s.sem }, true
	case <-ctx.Done():
		return nil, false
	case <-s.stop:
		return nil, false
	}
}

func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" {
			token = r.Header.Get("X-EasyInk-Auth-Token")
		}
		if token != s.cfg.AuthToken {
			writeError(w, http.StatusUnauthorized, "", protocol.ErrUnauthorized, "invalid auth token", nil, emptyDiagnostics(""))
			return
		}
		next(w, r)
	}
}

type errorView struct {
	Code    string
	Message string
	Details map[string]any
}

func codedError(err error) errorView {
	var coded *render.CodedError
	if errors.As(err, &coded) {
		return errorView{Code: coded.Code, Message: coded.Message, Details: coded.Details}
	}
	return errorView{Code: protocol.ErrRenderFailed, Message: err.Error()}
}

func statusFor(err error) int {
	view := codedError(err)
	switch view.Code {
	case protocol.ErrInvalidRequest, protocol.ErrInvalidPDF:
		return http.StatusBadRequest
	case protocol.ErrUnauthorized:
		return http.StatusUnauthorized
	case protocol.ErrTooManyRequests:
		return http.StatusTooManyRequests
	case protocol.ErrSecurityBlocked:
		return http.StatusForbidden
	case protocol.ErrRenderTimeout:
		return http.StatusGatewayTimeout
	default:
		return http.StatusInternalServerError
	}
}

func writeError(w http.ResponseWriter, status int, requestID, code, message string, details map[string]any, diag protocol.Diagnostics) {
	if diag.RequestID == "" {
		diag = emptyDiagnostics(requestID)
	}
	if requestID != "" {
		w.Header().Set("X-EasyInk-Request-Id", requestID)
	}
	if diag.ID != "" {
		w.Header().Set("X-EasyInk-Diagnostics-Id", diag.ID)
	}
	writeJSON(w, status, protocol.ErrorResponse{
		Success:   false,
		RequestID: requestID,
		Error: protocol.ErrorBody{
			Code:    code,
			Message: message,
			Details: details,
		},
		Diagnostics: diag,
	})
}

func emptyDiagnostics(requestID string) protocol.Diagnostics {
	return protocol.Diagnostics{
		RequestID:       requestID,
		HostVersion:     protocol.HostVersion,
		ProtocolVersion: protocol.ProtocolVersion,
		ConsoleErrors:   []string{},
		FailedRequests:  []string{},
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (s *Server) persistDiagnostics(diag protocol.Diagnostics, attachments render.DiagnosticAttachments) protocol.Diagnostics {
	if path, err := diagnostics.WriteAttachment(s.cfg.LogDir, diag.ID, "snapshot.html", attachments.HTMLSnapshot); err != nil {
		log.Printf("write html snapshot failed for %s: %v", diag.ID, err)
	} else {
		diag.HTMLSnapshotPath = path
	}
	if path, err := diagnostics.WriteAttachment(s.cfg.LogDir, diag.ID, "screenshot.png", attachments.Screenshot); err != nil {
		log.Printf("write screenshot failed for %s: %v", diag.ID, err)
	} else {
		diag.ScreenshotPath = path
	}
	path, err := diagnostics.WriteSummary(s.cfg.LogDir, diag)
	if err != nil {
		log.Printf("write diagnostics summary failed for %s: %v", diag.ID, err)
		return diag
	}
	diag.AttachmentPath = path
	path, err = diagnostics.WriteLog(s.cfg.LogDir, diag)
	if err != nil {
		log.Printf("write diagnostics log failed for %s: %v", diag.ID, err)
		return diag
	}
	diag.LogPath = path
	if path, err = diagnostics.WriteSummary(s.cfg.LogDir, diag); err != nil {
		log.Printf("write diagnostics summary failed for %s: %v", diag.ID, err)
		return diag
	}
	diag.AttachmentPath = path
	return diag
}
