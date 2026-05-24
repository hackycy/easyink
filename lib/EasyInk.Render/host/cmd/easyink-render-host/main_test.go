package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const samplePDFBase64 = "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAwID4+CnN0cmVhbQoKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMDIgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA1IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgoyNTEKJSVFT0YK"

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

func TestRenderNoDaemonPDF(t *testing.T) {
	temp := t.TempDir()
	requestPath := filepath.Join(temp, "request.json")
	outPath := filepath.Join(temp, "out.pdf")
	diagnosticsPath := filepath.Join(temp, "diag.json")
	request := `{
		"requestId": "req-cli-pdf",
		"source": {
			"type": "pdf",
			"pdfBase64": "` + samplePDFBase64 + `"
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
	if code != 0 {
		t.Fatalf("exit = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		t.Fatal("expected PDF output")
	}
	if _, err := os.Stat(diagnosticsPath); err != nil {
		t.Fatalf("expected diagnostics copy: %v", err)
	}
	if !strings.Contains(stdout.String(), `"success": true`) {
		t.Fatalf("unexpected stdout: %s", stdout.String())
	}
}
