package daemon

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"easyink/render/host/internal/config"
	"easyink/render/host/internal/protocol"
)

type State struct {
	PID               int                  `json:"pid"`
	IPC               string               `json:"ipc"`
	Nonce             string               `json:"nonce"`
	Browser           config.BrowserConfig `json:"browser"`
	ProfileRoot       string               `json:"profileRoot"`
	TempDir           string               `json:"tempDir"`
	LogDir            string               `json:"logDir"`
	HostVersion       string               `json:"hostVersion"`
	ProtocolVersion   string               `json:"protocolVersion"`
	ConfigFingerprint string               `json:"configFingerprint"`
	StartedAt         time.Time            `json:"startedAt"`
	LastUsedAt        time.Time            `json:"lastUsedAt"`
}

func NewState(runtime config.RuntimeConfig, ipcPath, nonce string) State {
	now := time.Now().UTC()
	return State{
		PID:               os.Getpid(),
		IPC:               ipcPath,
		Nonce:             nonce,
		Browser:           runtime.Browser,
		ProfileRoot:       runtime.ProfileRoot,
		TempDir:           runtime.TempDir,
		LogDir:            runtime.LogDir,
		HostVersion:       protocol.HostVersion,
		ProtocolVersion:   protocol.ProtocolVersion,
		ConfigFingerprint: runtime.Fingerprint(),
		StartedAt:         now,
		LastUsedAt:        now,
	}
}

func LoadState(path string) (State, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return State{}, err
	}
	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return State{}, err
	}
	return state, nil
}

func SaveState(path string, state State) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

func RemoveState(path string) {
	_ = os.Remove(path)
}

type Lock struct {
	path string
	file *os.File
}

func AcquireLock(path string, timeout time.Duration) (*Lock, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	deadline := time.Now().Add(timeout)
	for {
		file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0o600)
		if err == nil {
			return &Lock{path: path, file: file}, nil
		}
		if !errors.Is(err, os.ErrExist) || time.Now().After(deadline) {
			return nil, err
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func (l *Lock) Release() {
	if l == nil {
		return
	}
	if l.file != nil {
		_ = l.file.Close()
	}
	_ = os.Remove(l.path)
}
