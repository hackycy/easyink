package diagnostics

import (
	"fmt"
	"time"

	"easyink/render/host/internal/protocol"
)

type Collector struct {
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
		c.diagnostics.ConsoleErrors = append(c.diagnostics.ConsoleErrors, value)
	}
}

func (c *Collector) AddFailedRequest(value string) {
	if value != "" {
		c.diagnostics.FailedRequests = append(c.diagnostics.FailedRequests, value)
	}
}

func (c *Collector) SetFinalURL(value string) {
	c.diagnostics.FinalURL = value
}

func (c *Collector) SetPageCount(value int) {
	c.diagnostics.PageCount = value
}

func (c *Collector) Snapshot() protocol.Diagnostics {
	out := c.diagnostics
	out.DurationMs = time.Since(c.start).Milliseconds()
	return out
}
