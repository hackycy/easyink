package diagnostics

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"easyink/render/host/internal/protocol"
)

type Attachments struct {
	HTMLSnapshot []byte
	Screenshot   []byte
}

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

func (c *Collector) SetBrowser(name, version string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.diagnostics.BrowserName = name
	c.diagnostics.BrowserVersion = version
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
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "diagnostics.json")
	value.AttachmentPath = path
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o600); err != nil {
		return "", err
	}
	return path, nil
}

func WriteLog(logDir string, value protocol.Diagnostics) (string, error) {
	if strings.TrimSpace(logDir) == "" || strings.TrimSpace(value.ID) == "" {
		return "", nil
	}
	dir := Directory(logDir, value.ID)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "render.log")
	var out strings.Builder
	writeLogLine(&out, "diagnosticsId", value.ID)
	writeLogLine(&out, "requestId", value.RequestID)
	writeLogLine(&out, "sourceType", value.SourceType)
	writeLogLine(&out, "hostVersion", value.HostVersion)
	writeLogLine(&out, "protocolVersion", value.ProtocolVersion)
	writeLogLine(&out, "browserName", value.BrowserName)
	writeLogLine(&out, "browserVersion", value.BrowserVersion)
	writeLogLine(&out, "durationMs", fmt.Sprint(value.DurationMs))
	writeLogLine(&out, "finalUrl", value.FinalURL)
	if value.PageCount > 0 {
		writeLogLine(&out, "pageCount", fmt.Sprint(value.PageCount))
	}
	writeLogLine(&out, "diagnosticsPath", value.AttachmentPath)
	writeLogLine(&out, "htmlSnapshotPath", value.HTMLSnapshotPath)
	writeLogLine(&out, "screenshotPath", value.ScreenshotPath)
	for _, item := range value.ConsoleErrors {
		writeLogLine(&out, "consoleError", item)
	}
	for _, item := range value.FailedRequests {
		writeLogLine(&out, "failedRequest", item)
	}
	if err := os.WriteFile(path, []byte(out.String()), 0o600); err != nil {
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
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", err
	}
	return path, nil
}

func Persist(logDir string, diag protocol.Diagnostics, attachments Attachments, options protocol.DiagnosticsOptions) protocol.Diagnostics {
	if options.IncludeHTMLSnapshot {
		if path, err := WriteAttachment(logDir, diag.ID, "snapshot.html", attachments.HTMLSnapshot); err != nil {
			log.Printf("write html snapshot failed for %s: %v", diag.ID, err)
		} else {
			diag.HTMLSnapshotPath = path
		}
	}
	if options.IncludeScreenshot {
		if path, err := WriteAttachment(logDir, diag.ID, "screenshot.png", attachments.Screenshot); err != nil {
			log.Printf("write screenshot failed for %s: %v", diag.ID, err)
		} else {
			diag.ScreenshotPath = path
		}
	}
	path, err := WriteSummary(logDir, diag)
	if err != nil {
		log.Printf("write diagnostics summary failed for %s: %v", diag.ID, err)
		return diag
	}
	diag.AttachmentPath = path
	path, err = WriteLog(logDir, diag)
	if err != nil {
		log.Printf("write diagnostics log failed for %s: %v", diag.ID, err)
		return diag
	}
	diag.LogPath = path
	if path, err = WriteSummary(logDir, diag); err != nil {
		log.Printf("write diagnostics summary failed for %s: %v", diag.ID, err)
		return diag
	}
	diag.AttachmentPath = path
	return diag
}

func WriteCopy(path string, diag protocol.Diagnostics) error {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(diag, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o600)
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
