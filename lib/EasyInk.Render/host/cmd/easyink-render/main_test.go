package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"easyink/render/host/internal/ipc"
)

func TestVersionCommand(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"version"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("exit = %d stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "easyink-render") {
		t.Fatalf("unexpected stdout: %s", stdout.String())
	}
}

func TestShortVersionFlag(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"-v"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("exit = %d stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "easyink-render") {
		t.Fatalf("unexpected stdout: %s", stdout.String())
	}
}

func TestRootHelpCommand(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run(nil, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("exit = %d stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Usage:") {
		t.Fatalf("unexpected stdout: %s", stdout.String())
	}
}

func TestRenderNoDaemonRejectsPDFSource(t *testing.T) {
	temp := t.TempDir()
	requestPath := filepath.Join(temp, "request.json")
	outPath := filepath.Join(temp, "out.pdf")
	diagnosticsPath := filepath.Join(temp, "diag.json")
	request := `{
		"requestId": "req-cli-pdf",
		"source": {
			"type": "pdf"
		}
	}`
	if err := os.WriteFile(requestPath, []byte(request), 0o644); err != nil {
		t.Fatalf("write request: %v", err)
	}
	var stdout, stderr bytes.Buffer
	code := run([]string{
		"render",
		"--no-daemon",
		"--request", requestPath,
		"--out", outPath,
		"--diagnostics-out", diagnosticsPath,
		"--log-dir", temp,
		"--json",
	}, &stdout, &stderr)
	if code == 0 {
		t.Fatalf("exit = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if _, err := os.Stat(diagnosticsPath); err != nil {
		t.Fatalf("expected diagnostics copy: %v", err)
	}
	if !strings.Contains(stdout.String(), `"code": "UNSUPPORTED_SOURCE"`) {
		t.Fatalf("unexpected stdout: %s", stdout.String())
	}
}

func TestRenderRejectsTrailingJSON(t *testing.T) {
	temp := t.TempDir()
	requestPath := filepath.Join(temp, "request.json")
	outPath := filepath.Join(temp, "out.pdf")
	request := `{
		"requestId": "req-cli-pdf",
		"source": {
			"type": "html",
			"html": "<!doctype html><html><body>Hello</body></html>"
		}
	} {}`
	if err := os.WriteFile(requestPath, []byte(request), 0o644); err != nil {
		t.Fatalf("write request: %v", err)
	}
	var stdout, stderr bytes.Buffer
	code := run([]string{
		"render",
		"--no-daemon",
		"--request", requestPath,
		"--out", outPath,
		"--log-dir", temp,
	}, &stdout, &stderr)
	if code != 3 {
		t.Fatalf("exit = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if !strings.Contains(stderr.String(), "single object") {
		t.Fatalf("unexpected stderr: %s", stderr.String())
	}
}

func TestReadRequestRejectsOversizedFile(t *testing.T) {
	temp := t.TempDir()
	requestPath := filepath.Join(temp, "request.json")
	file, err := os.Create(requestPath)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if err := file.Truncate(ipc.MaxPayloadBytes + 1); err != nil {
		_ = file.Close()
		t.Fatalf("truncate request: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close request: %v", err)
	}

	_, _, code, err := readRequest(requestPath)
	if err == nil || code != 3 || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("code=%d err=%v", code, err)
	}
}
