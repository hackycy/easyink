package protocol

import (
	"encoding/json"
	"testing"
)

func TestPrintPDFRequestUnmarshalHTML(t *testing.T) {
	raw := []byte(`{"requestId":"req-001","source":{"type":"html","html":"<html></html>"},"output":{"type":"binary"}}`)
	var req PrintPDFRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	if req.RequestID != "req-001" {
		t.Fatalf("requestId = %q", req.RequestID)
	}
	if req.Source.Type != "html" {
		t.Fatalf("source.type = %q", req.Source.Type)
	}
}
