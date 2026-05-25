package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"easyink/render/host/internal/browser"
	"easyink/render/host/internal/config"
	"easyink/render/host/internal/diagnostics"
	"easyink/render/host/internal/ipc"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/render"
)

type Runtime struct {
	cfg       config.RuntimeConfig
	statePath string
	ipcPath   string
	nonce     string
	browser   *browser.Manager
	renderer  *render.Service
	sem       chan struct{}
	queue     chan struct{}
	stop      chan struct{}
	closed    atomic.Bool
	running   atomic.Int64
	pending   atomic.Int64
	lastUsed  atomic.Int64
	startedAt time.Time
	lock      *Lock
	stopOnce  sync.Once
}

func NewRuntime(ctx context.Context, cfg config.RuntimeConfig, statePath, ipcPath, nonce string) (*Runtime, error) {
	manager, err := browser.NewWithConfig(ctx, cfg.Browser, cfg.ProfileRoot)
	if err != nil {
		return nil, err
	}
	now := time.Now().UnixNano()
	rt := &Runtime{
		cfg:       cfg,
		statePath: statePath,
		ipcPath:   ipcPath,
		nonce:     nonce,
		browser:   manager,
		renderer:  render.NewService(manager),
		sem:       make(chan struct{}, cfg.MaxConcurrency),
		queue:     make(chan struct{}, cfg.MaxQueueSize),
		stop:      make(chan struct{}),
		startedAt: time.Now().UTC(),
	}
	rt.lastUsed.Store(now)
	return rt, nil
}

func (r *Runtime) SetProcessLock(lock *Lock) {
	r.lock = lock
}

func (r *Runtime) Run(ctx context.Context) error {
	defer r.releaseProcessLock()

	listener, err := ipc.Listen(r.ipcPath)
	if err != nil {
		r.browser.Shutdown()
		return err
	}
	defer ipc.Remove(r.ipcPath)
	defer listener.Close()
	defer RemoveState(r.statePath)
	defer r.browser.Shutdown()

	if err := SaveState(r.statePath, NewState(r.cfg, r.ipcPath, r.nonce)); err != nil {
		return err
	}

	errCh := make(chan error, 1)
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				if r.closed.Load() {
					errCh <- nil
					return
				}
				errCh <- err
				return
			}
			go r.handleConn(conn)
		}
	}()
	go r.idleWatch(listener)

	select {
	case <-ctx.Done():
		r.shutdown(listener)
		return ctx.Err()
	case <-r.stop:
		r.shutdown(listener)
		return nil
	case err := <-errCh:
		r.shutdown(listener)
		return err
	}
}

func (r *Runtime) handleConn(conn net.Conn) {
	defer conn.Close()
	for {
		frame, err := ipc.ReadFrame(conn)
		if err != nil {
			if errors.Is(err, io.EOF) {
				return
			}
			return
		}
		response := r.handleFrame(frame)
		_ = ipc.WriteFrame(conn, response)
		if frame.Header.Method == "daemon.shutdown" {
			return
		}
	}
}

func (r *Runtime) handleFrame(frame ipc.Frame) ipc.Frame {
	r.touch()
	if frame.Header.Type != "request" {
		return errorFrame(frame.Header.ID, "INVALID_FRAME", "frame type must be request", nil)
	}
	if metaNonce(frame.Header.Meta) != "" && metaNonce(frame.Header.Meta) != r.nonce {
		return errorFrame(frame.Header.ID, "DAEMON_NONCE_MISMATCH", "daemon nonce mismatch", nil)
	}
	switch frame.Header.Method {
	case "daemon.ping":
		return jsonFrame(frame.Header.ID, map[string]any{
			"ok":                true,
			"pid":               NewState(r.cfg, r.ipcPath, r.nonce).PID,
			"hostVersion":       protocol.HostVersion,
			"protocolVersion":   protocol.ProtocolVersion,
			"configFingerprint": r.cfg.Fingerprint(),
		})
	case "daemon.status":
		return jsonFrame(frame.Header.ID, r.status())
	case "daemon.shutdown":
		go r.stopNow()
		return jsonFrame(frame.Header.ID, map[string]any{"ok": true})
	case "browser.inspect":
		return jsonFrame(frame.Header.ID, r.browser.Health(context.Background()))
	case "render.printPdf":
		return r.render(frame)
	default:
		return errorFrame(frame.Header.ID, protocol.ErrInvalidRequest, "unsupported daemon method", map[string]any{"method": frame.Header.Method})
	}
}

func (r *Runtime) render(frame ipc.Frame) ipc.Frame {
	release, ok := r.acquireRenderSlot(context.Background())
	if !ok {
		return errorFrame(frame.Header.ID, protocol.ErrTooManyRequests, "render queue is full", nil)
	}
	defer release()
	r.running.Add(1)
	defer r.running.Add(-1)

	var req protocol.PrintPDFRequest
	if err := json.Unmarshal(frame.Payload, &req); err != nil {
		return errorFrame(frame.Header.ID, protocol.ErrInvalidRequest, err.Error(), nil)
	}
	timeoutMs := r.cfg.RequestTimeoutMs
	if req.Wait.TimeoutMs > 0 && req.Wait.TimeoutMs < timeoutMs {
		timeoutMs = req.Wait.TimeoutMs
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	result, err := r.renderer.RenderPrintPDF(ctx, req)
	result.Diagnostics = diagnostics.Persist(r.cfg.LogDir, result.Diagnostics, result.Attachments, req.Diagnostics)
	if err != nil {
		coded := codedError(err)
		header := responseHeader(frame.Header.ID, false)
		header.Error = &ipc.Error{Code: coded.Code, Message: coded.Message, Details: coded.Details}
		header.Diagnostics = result.Diagnostics
		return ipc.Frame{Header: header}
	}
	header := responseHeader(frame.Header.ID, true)
	header.ContentType = "application/pdf"
	header.PayloadLength = int64(len(result.PDF))
	header.Diagnostics = result.Diagnostics
	return ipc.Frame{Header: header, Payload: result.PDF}
}

func (r *Runtime) acquireRenderSlot(ctx context.Context) (func(), bool) {
	if r.closed.Load() {
		return nil, false
	}
	select {
	case r.sem <- struct{}{}:
		return func() { <-r.sem }, true
	default:
	}
	if r.cfg.MaxQueueSize <= 0 {
		return nil, false
	}
	select {
	case r.queue <- struct{}{}:
		r.pending.Add(1)
		defer func() {
			<-r.queue
			r.pending.Add(-1)
		}()
	case <-ctx.Done():
		return nil, false
	case <-r.stop:
		return nil, false
	default:
		return nil, false
	}
	select {
	case r.sem <- struct{}{}:
		return func() { <-r.sem }, true
	case <-ctx.Done():
		return nil, false
	case <-r.stop:
		return nil, false
	}
}

func (r *Runtime) status() map[string]any {
	health := r.browser.Health(context.Background())
	return map[string]any{
		"pid":               NewState(r.cfg, r.ipcPath, r.nonce).PID,
		"ipc":               r.ipcPath,
		"hostVersion":       protocol.HostVersion,
		"protocolVersion":   protocol.ProtocolVersion,
		"configFingerprint": r.cfg.Fingerprint(),
		"browser": map[string]any{
			"kind":      health.Kind,
			"name":      health.Name,
			"version":   health.Version,
			"ready":     health.Ready,
			"restarts":  health.Restarts,
			"lastError": health.LastError,
		},
		"queue": map[string]any{
			"running":        r.running.Load(),
			"pending":        r.pending.Load(),
			"maxConcurrency": r.cfg.MaxConcurrency,
			"maxQueueSize":   r.cfg.MaxQueueSize,
		},
		"uptimeMs": time.Since(r.startedAt).Milliseconds(),
	}
}

func (r *Runtime) idleWatch(listener net.Listener) {
	if r.cfg.IdleTimeoutMs == 0 {
		return
	}
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	timeout := time.Duration(r.cfg.IdleTimeoutMs) * time.Millisecond
	for range ticker.C {
		if r.closed.Load() {
			return
		}
		if r.running.Load() != 0 || r.pending.Load() != 0 {
			continue
		}
		last := time.Unix(0, r.lastUsed.Load())
		if time.Since(last) >= timeout {
			r.shutdown(listener)
			r.stopNow()
			return
		}
	}
}

func (r *Runtime) touch() {
	r.lastUsed.Store(time.Now().UnixNano())
	state, err := LoadState(r.statePath)
	if err == nil {
		state.LastUsedAt = time.Now().UTC()
		_ = SaveState(r.statePath, state)
	}
}

func (r *Runtime) shutdown(listener net.Listener) {
	r.closed.Store(true)
	_ = listener.Close()
}

func (r *Runtime) stopNow() {
	r.stopOnce.Do(func() {
		close(r.stop)
	})
}

func (r *Runtime) releaseProcessLock() {
	if r.lock != nil {
		r.lock.Release()
	}
}

func jsonFrame(id string, value any) ipc.Frame {
	payload, _ := json.Marshal(value)
	header := responseHeader(id, true)
	header.ContentType = "application/json"
	header.PayloadLength = int64(len(payload))
	return ipc.Frame{Header: header, Payload: payload}
}

func responseHeader(id string, ok bool) ipc.Header {
	return ipc.Header{
		ID:   id,
		Type: "response",
		OK:   ok,
		Meta: map[string]any{"protocolVersion": protocol.ProtocolVersion},
	}
}

func errorFrame(id, code, message string, details map[string]any) ipc.Frame {
	header := responseHeader(id, false)
	header.Error = &ipc.Error{Code: code, Message: message, Details: details}
	return ipc.Frame{Header: header}
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
	if errors.Is(err, context.DeadlineExceeded) {
		return errorView{Code: protocol.ErrRenderTimeout, Message: err.Error()}
	}
	return errorView{Code: protocol.ErrRenderFailed, Message: err.Error()}
}

func metaNonce(meta map[string]any) string {
	if meta == nil {
		return ""
	}
	if value, ok := meta["nonce"].(string); ok {
		return value
	}
	return ""
}

func DecodeJSONPayload[T any](frame ipc.Frame) (T, error) {
	var value T
	if !frame.Header.OK {
		if frame.Header.Error != nil {
			return value, fmt.Errorf("%s: %s", frame.Header.Error.Code, frame.Header.Error.Message)
		}
		return value, errors.New("daemon returned error")
	}
	if err := json.Unmarshal(frame.Payload, &value); err != nil {
		return value, err
	}
	return value, nil
}
