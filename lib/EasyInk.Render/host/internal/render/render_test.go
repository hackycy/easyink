package render

import (
	"encoding/base64"
	"strings"
	"testing"

	"easyink/render/host/internal/protocol"
)

func TestNormalizePDFValidatesAndReturnsBytes(t *testing.T) {
	service := &Service{}
	input := []byte("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF")
	result, err := service.normalizePDF(protocol.PrintPDFRequest{
		RequestID: "req-pdf",
		Source: protocol.Source{
			Type:      "pdf",
			PDFBase64: base64.StdEncoding.EncodeToString(input),
		},
	})
	if err != nil {
		t.Fatalf("normalize pdf: %v", err)
	}
	if string(result) != string(input) {
		t.Fatal("expected PDF bytes to be returned unchanged")
	}
}

func TestNormalizePDFRejectsInvalidHeader(t *testing.T) {
	service := &Service{}
	_, err := service.normalizePDF(protocol.PrintPDFRequest{
		RequestID: "req-pdf",
		Source: protocol.Source{
			Type:      "pdf",
			PDFBase64: base64.StdEncoding.EncodeToString([]byte("hello")),
		},
	})
	if err == nil || !strings.Contains(err.Error(), "header") {
		t.Fatalf("expected header error, got %v", err)
	}
}

func TestCountPDFPagesHasMinimumForValidPDFBytes(t *testing.T) {
	if got := countPDFPages([]byte("%PDF-1.4\n%%EOF")); got != 1 {
		t.Fatalf("page count = %d", got)
	}
}
