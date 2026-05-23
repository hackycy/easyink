package protocol

import "encoding/json"

const (
	HostVersion     = "0.1.0"
	ProtocolVersion = "1.0"
)

type PrintPDFRequest struct {
	RequestID string          `json:"requestId"`
	Source    Source          `json:"source"`
	PDF       PDFOptions      `json:"pdf,omitempty"`
	Wait      WaitOptions     `json:"wait,omitempty"`
	Output    OutputOptions   `json:"output,omitempty"`
	Security  SecurityOptions `json:"security,omitempty"`
}

type Source struct {
	Type      string          `json:"type"`
	HTML      string          `json:"html,omitempty"`
	BaseURL   string          `json:"baseUrl,omitempty"`
	PDFBase64 string          `json:"pdfBase64,omitempty"`
	FileName  string          `json:"fileName,omitempty"`
	Schema    json.RawMessage `json:"schema,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
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

type InfoResponse struct {
	HostVersion     string   `json:"hostVersion"`
	ProtocolVersion string   `json:"protocolVersion"`
	BrowserName     string   `json:"browserName"`
	BrowserVersion  string   `json:"browserVersion"`
	Capabilities    []string `json:"capabilities"`
}

type HealthResponse struct {
	Status  string      `json:"status"`
	Browser string      `json:"browser"`
	Queue   QueueHealth `json:"queue"`
}

type QueueHealth struct {
	Running        int `json:"running"`
	Pending        int `json:"pending"`
	MaxConcurrency int `json:"maxConcurrency"`
}

type Base64PDFResponse struct {
	Success     bool        `json:"success"`
	RequestID   string      `json:"requestId"`
	ContentType string      `json:"contentType"`
	Base64      string      `json:"base64"`
	PageCount   int         `json:"pageCount"`
	Diagnostics Diagnostics `json:"diagnostics"`
}

type ErrorResponse struct {
	Success     bool        `json:"success"`
	RequestID   string      `json:"requestId"`
	Error       ErrorBody   `json:"error"`
	Diagnostics Diagnostics `json:"diagnostics"`
}

type ErrorBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Diagnostics struct {
	ID              string   `json:"id,omitempty"`
	RequestID       string   `json:"requestId"`
	HostVersion     string   `json:"hostVersion"`
	BrowserVersion  string   `json:"browserVersion"`
	ProtocolVersion string   `json:"protocolVersion"`
	DurationMs      int64    `json:"durationMs"`
	ConsoleErrors   []string `json:"consoleErrors"`
	FailedRequests  []string `json:"failedRequests"`
	FinalURL        string   `json:"finalUrl,omitempty"`
	SourceType      string   `json:"sourceType"`
	PageCount       int      `json:"pageCount,omitempty"`
}

const (
	ErrUnauthorized      = "UNAUTHORIZED"
	ErrInvalidRequest    = "INVALID_REQUEST"
	ErrUnsupportedSource = "UNSUPPORTED_SOURCE"
	ErrInvalidPDF        = "INVALID_PDF"
	ErrRenderTimeout     = "RENDER_TIMEOUT"
	ErrRenderFailed      = "RENDER_FAILED"
	ErrTooManyRequests   = "TOO_MANY_REQUESTS"
	ErrSecurityBlocked   = "SECURITY_BLOCKED"
)
