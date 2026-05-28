package diagnostics

import (
	"os"
	"strings"
	"testing"

	"easyink/render/host/internal/protocol"
)

func TestWriteSummaryWritesDiagnosticsByID(t *testing.T) {
	path, err := WriteSummary(t.TempDir(), protocol.Diagnostics{
		ID:        "diag-123",
		RequestID: "req-123",
	})
	if err != nil {
		t.Fatalf("write summary: %v", err)
	}
	if !strings.HasSuffix(path, "diagnostics/diag-123/diagnostics.json") {
		t.Fatalf("unexpected diagnostics path: %s", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read summary: %v", err)
	}
	if !strings.Contains(string(data), `"requestId": "req-123"`) {
		t.Fatalf("summary did not include requestId: %s", string(data))
	}
	assertPrivateFile(t, path)
}

func TestWriteAttachmentWritesFileInDiagnosticsDirectory(t *testing.T) {
	path, err := WriteAttachment(t.TempDir(), "diag-123", "snapshot.html", []byte("<html></html>"))
	if err != nil {
		t.Fatalf("write attachment: %v", err)
	}
	if !strings.HasSuffix(path, "diagnostics/diag-123/snapshot.html") {
		t.Fatalf("unexpected attachment path: %s", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read attachment: %v", err)
	}
	if string(data) != "<html></html>" {
		t.Fatalf("attachment = %q", string(data))
	}
	assertPrivateFile(t, path)
}

func TestWriteLogWritesReadableDiagnosticsLog(t *testing.T) {
	path, err := WriteLog(t.TempDir(), protocol.Diagnostics{
		ID:             "diag-123",
		RequestID:      "req-123",
		SourceType:     "html",
		BrowserVersion: "123.0.0",
		DurationMs:     42,
		FinalURL:       "data:text/html;base64,abc",
		PageCount:      2,
		ConsoleErrors:  []string{"boom"},
		FailedRequests: []string{"https://example.test/a.png blocked"},
	})
	if err != nil {
		t.Fatalf("write log: %v", err)
	}
	if !strings.HasSuffix(path, "diagnostics/diag-123/render.log") {
		t.Fatalf("unexpected diagnostics log path: %s", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	text := string(data)
	for _, want := range []string{
		"diagnosticsId=diag-123",
		"requestId=req-123",
		"sourceType=html",
		"browserVersion=123.0.0",
		"durationMs=42",
		"pageCount=2",
		"consoleError=boom",
		"failedRequest=https://example.test/a.png blocked",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("expected log to include %q, got:\n%s", want, text)
		}
	}
	assertPrivateFile(t, path)
}

func TestWriteAttachmentRejectsUnsafeFileName(t *testing.T) {
	path, err := WriteAttachment(t.TempDir(), "diag-123", "../snapshot.html", []byte("x"))
	if err != nil {
		t.Fatalf("write attachment: %v", err)
	}
	if path != "" {
		t.Fatalf("expected unsafe file name to be ignored, got %s", path)
	}
}

func assertPrivateFile(t *testing.T, path string) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat %s: %v", path, err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("file mode = %o", got)
	}
}

func TestWriteSummarySanitizesDiagnosticsID(t *testing.T) {
	path, err := WriteSummary(t.TempDir(), protocol.Diagnostics{ID: "../diag:123"})
	if err != nil {
		t.Fatalf("write summary: %v", err)
	}
	if strings.Contains(path, "..") || strings.Contains(path, ":") {
		t.Fatalf("expected sanitized path, got %s", path)
	}
}

func TestWriteSummaryIncludesAttachmentPathWhenProvided(t *testing.T) {
	path, err := WriteSummary(t.TempDir(), protocol.Diagnostics{
		ID:             "diag-123",
		RequestID:      "req-123",
		AttachmentPath: "/tmp/diagnostics/diag-123/diagnostics.json",
	})
	if err != nil {
		t.Fatalf("write summary: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read summary: %v", err)
	}
	if !strings.Contains(string(data), `"attachmentPath"`) {
		t.Fatalf("summary did not include attachmentPath: %s", string(data))
	}
	if !strings.Contains(string(data), path) {
		t.Fatalf("summary did not reference summary path: %s", string(data))
	}
}
