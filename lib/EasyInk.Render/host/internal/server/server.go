package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"easyink/render/host/internal/browser"
	"easyink/render/host/internal/config"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/render"
)

type Server struct {
	cfg      config.Config
	browser  *browser.Manager
	renderer *render.Service
	sem      chan struct{}
	running  atomic.Int64
}

func New(cfg config.Config, browserManager *browser.Manager) *Server {
	return &Server{
		cfg:      cfg,
		browser:  browserManager,
		renderer: render.NewService(browserManager),
		sem:      make(chan struct{}, cfg.MaxConcurrency),
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
	writeJSON(w, http.StatusOK, protocol.InfoResponse{
		HostVersion:     protocol.HostVersion,
		ProtocolVersion: protocol.ProtocolVersion,
		BrowserName:     s.browser.BrowserName(),
		BrowserVersion:  s.browser.Version(),
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
	writeJSON(w, http.StatusOK, protocol.HealthResponse{
		Status:  "ok",
		Browser: "ready",
		Queue: protocol.QueueHealth{
			Running:        int(s.running.Load()),
			Pending:        len(s.sem),
			MaxConcurrency: s.cfg.MaxConcurrency,
		},
	})
}

func (s *Server) printPDF(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "", protocol.ErrInvalidRequest, "method not allowed", nil, emptyDiagnostics(""))
		return
	}
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	default:
		writeError(w, http.StatusTooManyRequests, "", protocol.ErrTooManyRequests, "render queue is full", nil, emptyDiagnostics(""))
		return
	}
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
	if err != nil {
		status := statusFor(err)
		coded := codedError(err)
		writeError(w, status, req.RequestID, coded.Code, coded.Message, coded.Details, result.Diagnostics)
		return
	}

	if req.Output.Type == "base64Json" {
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
