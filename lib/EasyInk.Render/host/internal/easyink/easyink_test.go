package easyink

import (
	"encoding/json"
	"strings"
	"testing"

	"easyink/render/host/internal/protocol"
)

func TestRenderHTMLBuildsReadyDocumentAndPDFOptions(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[]}`)
	html, pdf, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{"receipt":{"no":"R-001"}}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	if !strings.Contains(html, "easyink-ready") {
		t.Fatal("expected generated html to include easyink-ready")
	}
	if pdf.PaperWidthMm != 80 || pdf.PaperHeightMm != 120 {
		t.Fatalf("unexpected page size: %#v", pdf)
	}
}
