package daemon

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
	meta lockMetadata
}

type lockMetadata struct {
	PID        int       `json:"pid"`
	AcquiredAt time.Time `json:"acquiredAt"`
	Token      string    `json:"token"`
}

const unknownLockStaleAfter = 2 * time.Minute

func StartLockPath(statePath string) string {
	return filepath.Join(filepath.Dir(statePath), "daemon.start.lock")
}

func ProcessLockPath(statePath string) string {
	return filepath.Join(filepath.Dir(statePath), "daemon.process.lock")
}

func AcquireLock(path string, timeout time.Duration) (*Lock, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	deadline := time.Now().Add(timeout)
	for {
		lock, err := tryAcquireLock(path)
		if err == nil {
			return lock, nil
		}
		if !errors.Is(err, os.ErrExist) {
			return nil, err
		}
		if removed, staleErr := removeStaleLock(path); staleErr != nil {
			return nil, staleErr
		} else if removed {
			continue
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("lock is held: %s", path)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func tryAcquireLock(path string) (*Lock, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	metadata := lockMetadata{PID: os.Getpid(), AcquiredAt: time.Now().UTC(), Token: newLockToken()}
	data, err := json.Marshal(metadata)
	if err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return nil, err
	}
	if _, err := file.Write(append(data, '\n')); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return nil, err
	}
	return &Lock{path: path, file: file, meta: metadata}, nil
}

func removeStaleLock(path string) (bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return true, nil
		}
		return false, err
	}
	var metadata lockMetadata
	if err := json.Unmarshal(data, &metadata); err != nil || metadata.PID <= 0 {
		info, statErr := os.Stat(path)
		if statErr != nil {
			if errors.Is(statErr, os.ErrNotExist) {
				return true, nil
			}
			return false, statErr
		}
		if time.Since(info.ModTime()) < unknownLockStaleAfter {
			return false, nil
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return false, err
		}
		return true, nil
	}
	if processExists(metadata.PID) {
		return false, nil
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return false, err
	}
	return true, nil
}

func (l *Lock) Release() {
	if l == nil {
		return
	}
	if l.file != nil {
		_ = l.file.Close()
	}
	if lockOwnedByCurrentProcess(l.path, l.meta) {
		_ = os.Remove(l.path)
	}
}

func lockOwnedByCurrentProcess(path string, expected lockMetadata) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	var metadata lockMetadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		return false
	}
	return metadata.PID == expected.PID && metadata.Token != "" && metadata.Token == expected.Token
}

func newLockToken() string {
	var data [16]byte
	if _, err := rand.Read(data[:]); err == nil {
		return hex.EncodeToString(data[:])
	}
	return fmt.Sprintf("%d-%d", os.Getpid(), time.Now().UnixNano())
}
