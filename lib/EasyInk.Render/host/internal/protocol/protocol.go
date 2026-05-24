package protocol

import "encoding/json"

const (
	HostVersion     = "0.1.0"
	ProtocolVersion = "1.0"
)

type PrintPDFRequest struct {
	RequestID   string             `json:"requestId"`
	Source      Source             `json:"source"`
	PDF         PDFOptions         `json:"pdf,omitempty"`
	Wait        WaitOptions        `json:"wait,omitempty"`
	Output      OutputOptions      `json:"output,omitempty"`
	Security    SecurityOptions    `json:"security,omitempty"`
	Diagnostics DiagnosticsOptions `json:"diagnostics,omitempty"`
}

type Source struct {
	Type      string          `json:"type"`
	HTML      string          `json:"html,omitempty"`
	BaseURL   string          `json:"baseUrl,omitempty"`
	PDFBase64 string          `json:"pdfBase64,omitempty"`
	FileName  string          `json:"fileName,omitempty"`
	Schema    json.RawMessage `json:"schema,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
	Resources []Resource      `json:"resources,omitempty"`
	Fonts     []FontResource  `json:"fonts,omitempty"`
}

type Resource struct {
	URL         string `json:"url"`
	ContentType string `json:"contentType"`
	Base64      string `json:"base64"`
}

type FontResource struct {
	Family      string `json:"family"`
	URL         string `json:"url"`
	ContentType string `json:"contentType"`
	Base64      string `json:"base64"`
	Weight      string `json:"weight,omitempty"`
	Style       string `json:"style,omitempty"`
}

type PDFOptions struct {
	PaperWidthMm    float64   `json:"paperWidthMm,omitempty"`
	PaperHeightMm   float64   `json:"paperHeightMm,omitempty"`
	PrintBackground *bool     `json:"printBackground,omitempty"`
	Landscape       bool      `json:"landscape,omitempty"`
	MarginMm        *MarginMm `json:"marginMm,omitempty"`
}

type MarginMm struct {
	Top    float64 `json:"top"`
	Right  float64 `json:"right"`
	Bottom float64 `json:"bottom"`
	Left   float64 `json:"left"`
}

type WaitOptions struct {
	Until     string `json:"until,omitempty"`
	Selector  string `json:"selector,omitempty"`
	TimeoutMs int    `json:"timeoutMs,omitempty"`
}

type OutputOptions struct {
	Type string `json:"type,omitempty"`
}

type SecurityOptions struct {
	AllowFileAccess bool     `json:"allowFileAccess,omitempty"`
	AllowedOrigins  []string `json:"allowedOrigins,omitempty"`
	MaxInputBytes   int64    `json:"maxInputBytes,omitempty"`
}

type DiagnosticsOptions struct {
	IncludeHTMLSnapshot   bool `json:"includeHtmlSnapshot,omitempty"`
	IncludeScreenshot     bool `json:"includeScreenshot,omitempty"`
	IncludeRequestHeaders bool `json:"includeRequestHeaders,omitempty"`
}

type Diagnostics struct {
	ID               string            `json:"id,omitempty"`
	RequestID        string            `json:"requestId"`
	HostVersion      string            `json:"hostVersion"`
	BrowserKind      string            `json:"browserKind,omitempty"`
	BrowserName      string            `json:"browserName,omitempty"`
	BrowserVersion   string            `json:"browserVersion"`
	ProtocolVersion  string            `json:"protocolVersion"`
	DurationMs       int64             `json:"durationMs"`
	ConsoleErrors    []string          `json:"consoleErrors"`
	FailedRequests   []string          `json:"failedRequests"`
	FinalURL         string            `json:"finalUrl,omitempty"`
	SourceType       string            `json:"sourceType"`
	PageCount        int               `json:"pageCount,omitempty"`
	PDFTitle         string            `json:"pdfTitle,omitempty"`
	PDFAuthor        string            `json:"pdfAuthor,omitempty"`
	PDFCreator       string            `json:"pdfCreator,omitempty"`
	PDFProducer      string            `json:"pdfProducer,omitempty"`
	RequestHeaders   map[string]string `json:"requestHeaders,omitempty"`
	AttachmentPath   string            `json:"attachmentPath,omitempty"`
	LogPath          string            `json:"logPath,omitempty"`
	ScreenshotPath   string            `json:"screenshotPath,omitempty"`
	HTMLSnapshotPath string            `json:"htmlSnapshotPath,omitempty"`
}

const (
	ErrInvalidRequest    = "INVALID_REQUEST"
	ErrUnsupportedSource = "UNSUPPORTED_SOURCE"
	ErrInvalidPDF        = "INVALID_PDF"
	ErrRenderTimeout     = "RENDER_TIMEOUT"
	ErrRenderFailed      = "RENDER_FAILED"
	ErrTooManyRequests   = "TOO_MANY_REQUESTS"
	ErrSecurityBlocked   = "SECURITY_BLOCKED"
)
