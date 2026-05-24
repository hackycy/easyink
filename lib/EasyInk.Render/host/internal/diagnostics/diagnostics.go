package diagnostics

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"easyink/render/host/internal/protocol"
)

type Collector struct {
	mu          sync.Mutex
	diagnostics protocol.Diagnostics
	start       time.Time
}

func New(requestID, sourceType, browserVersion string) *Collector {
	id := fmt.Sprintf("diag-%d", time.Now().UnixNano())
	return &Collector{
		start: time.Now(),
		diagnostics: protocol.Diagnostics{
			ID:              id,
			RequestID:       requestID,
			HostVersion:     protocol.HostVersion,
			BrowserVersion:  browserVersion,
			ProtocolVersion: protocol.ProtocolVersion,
			ConsoleErrors:   []string{},
			FailedRequests:  []string{},
			SourceType:      sourceType,
		},
	}
}

func (c *Collector) AddConsoleError(value string) {
	if value != "" {
		c.mu.Lock()
		defer c.mu.Unlock()
		c.diagnostics.ConsoleErrors = append(c.diagnostics.ConsoleErrors, value)
	}
}

func (c *Collector) AddFailedRequest(value string) {
	if value != "" {
		c.mu.Lock()
		defer c.mu.Unlock()
		c.diagnostics.FailedRequests = append(c.diagnostics.FailedRequests, value)
	}
}

func (c *Collector) SetFinalURL(value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.diagnostics.FinalURL = value
}

func (c *Collector) SetPageCount(value int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.diagnostics.PageCount = value
}

func (c *Collector) SetPDFMetadata(title, author, creator, producer string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.diagnostics.PDFTitle = title
	c.diagnostics.PDFAuthor = author
	c.diagnostics.PDFCreator = creator
	c.diagnostics.PDFProducer = producer
}

func (c *Collector) Snapshot() protocol.Diagnostics {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := c.diagnostics
	out.DurationMs = time.Since(c.start).Milliseconds()
	return out
}

func WriteSummary(logDir string, value protocol.Diagnostics) (string, error) {
	if strings.TrimSpace(logDir) == "" || strings.TrimSpace(value.ID) == "" {
		return "", nil
	}
	dir := Directory(logDir, value.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "diagnostics.json")
	value.AttachmentPath = path
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func WriteLog(logDir string, value protocol.Diagnostics) (string, error) {
	if strings.TrimSpace(logDir) == "" || strings.TrimSpace(value.ID) == "" {
		return "", nil
	}
	dir := Directory(logDir, value.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "render.log")
	var out strings.Builder
	writeLogLine(&out, "diagnosticsId", value.ID)
	writeLogLine(&out, "requestId", value.RequestID)
	writeLogLine(&out, "sourceType", value.SourceType)
	writeLogLine(&out, "hostVersion", value.HostVersion)
	writeLogLine(&out, "protocolVersion", value.ProtocolVersion)
	writeLogLine(&out, "browserVersion", value.BrowserVersion)
	writeLogLine(&out, "durationMs", fmt.Sprint(value.DurationMs))
	writeLogLine(&out, "finalUrl", value.FinalURL)
	if value.PageCount > 0 {
		writeLogLine(&out, "pageCount", fmt.Sprint(value.PageCount))
	}
	writeLogLine(&out, "pdfTitle", value.PDFTitle)
	writeLogLine(&out, "pdfAuthor", value.PDFAuthor)
	writeLogLine(&out, "pdfCreator", value.PDFCreator)
	writeLogLine(&out, "pdfProducer", value.PDFProducer)
	writeLogLine(&out, "diagnosticsPath", value.AttachmentPath)
	writeLogLine(&out, "htmlSnapshotPath", value.HTMLSnapshotPath)
	writeLogLine(&out, "screenshotPath", value.ScreenshotPath)
	for _, item := range value.ConsoleErrors {
		writeLogLine(&out, "consoleError", item)
	}
	for _, item := range value.FailedRequests {
		writeLogLine(&out, "failedRequest", item)
	}
	if err := os.WriteFile(path, []byte(out.String()), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func writeLogLine(out *strings.Builder, key, value string) {
	if strings.TrimSpace(value) == "" {
		return
	}
	out.WriteString(key)
	out.WriteString("=")
	out.WriteString(strings.ReplaceAll(value, "\n", `\n`))
	out.WriteString("\n")
}

func WriteAttachment(logDir, diagnosticsID, fileName string, data []byte) (string, error) {
	if strings.TrimSpace(logDir) == "" || strings.TrimSpace(diagnosticsID) == "" || len(data) == 0 {
		return "", nil
	}
	name := safeFileName(fileName)
	if name == "" {
		return "", nil
	}
	dir := Directory(logDir, diagnosticsID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func Directory(logDir, diagnosticsID string) string {
	return filepath.Join(logDir, "diagnostics", safeName(diagnosticsID))
}

func safeName(value string) string {
	var out strings.Builder
	for _, r := range value {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' {
			out.WriteRune(r)
		}
	}
	if out.Len() == 0 {
		return "diagnostics"
	}
	return out.String()
}

func safeFileName(value string) string {
	trimmed := strings.TrimSpace(value)
	name := filepath.Base(trimmed)
	if name == "." || name == string(filepath.Separator) || name != trimmed {
		return ""
	}
	for _, r := range name {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == '.' {
			continue
		}
		return ""
	}
	return name
}
