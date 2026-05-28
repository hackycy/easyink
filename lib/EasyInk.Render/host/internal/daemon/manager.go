package daemon

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"time"

	"easyink/render/host/internal/config"
	"easyink/render/host/internal/ipc"
	"easyink/render/host/internal/protocol"
)

type Manager struct {
	Config    config.RuntimeConfig
	StatePath string
	IPCPath   string
}

func NewManager(cfg config.RuntimeConfig) Manager {
	return Manager{
		Config:    cfg,
		StatePath: config.StatePath(),
		IPCPath:   ipc.DefaultEndpoint(),
	}
}

func (m Manager) Status(ctx context.Context) (map[string]any, error) {
	state, err := LoadState(m.StatePath)
	if err != nil {
		return nil, err
	}
	client, err := ipc.DialClient(ctx, state.IPC)
	if err != nil {
		return nil, err
	}
	defer client.Close()
	frame, err := client.Call(ctx, ipc.Frame{Header: requestHeader("daemon.status", state.Nonce), Payload: nil})
	if err != nil {
		return nil, err
	}
	return DecodeJSONPayload[map[string]any](frame)
}

func (m Manager) Stop(ctx context.Context) error {
	state, err := LoadState(m.StatePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	client, err := ipc.DialClient(ctx, state.IPC)
	if err != nil {
		return err
	}
	defer client.Close()
	frame, err := client.Call(ctx, ipc.Frame{Header: requestHeader("daemon.shutdown", state.Nonce)})
	if err != nil {
		return err
	}
	if !frame.Header.OK {
		if frame.Header.Error != nil {
			return fmt.Errorf("%s: %s", frame.Header.Error.Code, frame.Header.Error.Message)
		}
		return errors.New("daemon shutdown failed")
	}
	return nil
}

func (m Manager) Restart(ctx context.Context) error {
	_ = m.Stop(ctx)
	time.Sleep(200 * time.Millisecond)
	_, err := m.Ensure(ctx, true)
	return err
}

func (m Manager) Ensure(ctx context.Context, forceRestart bool) (State, error) {
	if err := m.Config.ValidateRuntime(true); err != nil {
		return State{}, err
	}
	lock, err := AcquireLock(StartLockPath(m.StatePath), 10*time.Second)
	if err != nil {
		return State{}, err
	}
	defer lock.Release()

	if forceRestart {
		_ = m.Stop(ctx)
	} else if state, client, err := m.connect(ctx); err == nil {
		defer client.Close()
		if state.ConfigFingerprint == m.Config.Fingerprint() {
			return state, nil
		}
		_ = m.Stop(ctx)
	} else if state, err := LoadState(m.StatePath); err == nil && state.IPC != "" {
		_ = shutdownState(ctx, state)
	}

	nonce := randomNonce()
	args := []string{
		"daemon", "run",
		"--ipc", m.IPCPath,
		"--state", m.StatePath,
		"--nonce", nonce,
		"--browser-kind", m.Config.Browser.Kind,
		"--browser-path", m.Config.Browser.Path,
		"--profile-root", m.Config.ProfileRoot,
		"--temp-dir", m.Config.TempDir,
		"--log-dir", m.Config.LogDir,
		"--max-concurrency", strconv.Itoa(m.Config.MaxConcurrency),
		"--max-queue-size", strconv.Itoa(m.Config.MaxQueueSize),
		"--request-timeout-ms", strconv.Itoa(m.Config.RequestTimeoutMs),
		"--idle-timeout-ms", strconv.Itoa(m.Config.IdleTimeoutMs),
	}
	if m.Config.Browser.DisableSandbox {
		args = append(args, "--disable-sandbox")
	}
	exe, err := os.Executable()
	if err != nil {
		return State{}, err
	}
	cmd := exec.CommandContext(context.Background(), exe, args...)
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		return State{}, err
	}
	_ = cmd.Process.Release()

	deadline := time.Now().Add(15 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		state, client, err := m.connect(ctx)
		if err == nil {
			defer client.Close()
			if state.ConfigFingerprint == m.Config.Fingerprint() {
				return state, nil
			}
			lastErr = fmt.Errorf("daemon fingerprint mismatch")
		} else {
			lastErr = err
		}
		select {
		case <-ctx.Done():
			return State{}, ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}
	return State{}, fmt.Errorf("daemon startup failed: %w", lastErr)
}

func shutdownState(ctx context.Context, state State) error {
	client, err := ipc.DialClient(ctx, state.IPC)
	if err != nil {
		return err
	}
	defer client.Close()
	frame, err := client.Call(ctx, ipc.Frame{Header: requestHeader("daemon.shutdown", state.Nonce)})
	if err != nil {
		return err
	}
	if !frame.Header.OK {
		return errors.New("daemon shutdown failed")
	}
	return nil
}

func (m Manager) Render(ctx context.Context, request []byte, forceRestart bool) (ipc.Frame, State, error) {
	state, err := m.Ensure(ctx, forceRestart)
	if err != nil {
		return ipc.Frame{}, State{}, err
	}
	client, err := ipc.DialClient(ctx, state.IPC)
	if err != nil {
		return ipc.Frame{}, State{}, err
	}
	defer client.Close()
	frame, err := client.Call(ctx, ipc.Frame{
		Header:  requestHeader("render.printPdf", state.Nonce),
		Payload: request,
	})
	if err != nil {
		return ipc.Frame{}, State{}, err
	}
	return frame, state, nil
}

func (m Manager) connect(ctx context.Context) (State, *ipc.Client, error) {
	state, err := LoadState(m.StatePath)
	if err != nil {
		return State{}, nil, err
	}
	if state.ConfigFingerprint != m.Config.Fingerprint() {
		return state, nil, errors.New("daemon config fingerprint mismatch")
	}
	client, err := ipc.DialClient(ctx, state.IPC)
	if err != nil {
		return state, nil, err
	}
	frame, err := client.Call(ctx, ipc.Frame{Header: requestHeader("daemon.ping", state.Nonce)})
	if err != nil {
		_ = client.Close()
		return state, nil, err
	}
	var pong map[string]any
	if frame.Header.OK {
		_ = json.Unmarshal(frame.Payload, &pong)
	}
	if !frame.Header.OK || pong["protocolVersion"] != protocol.ProtocolVersion {
		_ = client.Close()
		return state, nil, errors.New("daemon ping failed")
	}
	return state, client, nil
}

func requestHeader(method, nonce string) ipc.Header {
	return ipc.Header{
		ID:     randomNonce(),
		Type:   "request",
		Method: method,
		Meta: map[string]any{
			"protocolVersion": protocol.ProtocolVersion,
			"nonce":           nonce,
		},
	}
}

func randomNonce() string {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(data[:])
}
