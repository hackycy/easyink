package ipc

import (
	"bytes"
	"testing"
)

func TestFrameRoundTripWithBinaryPayload(t *testing.T) {
	var buf bytes.Buffer
	wantPayload := bytes.Repeat([]byte{0x00, 0xff, 0x42}, 1024)
	err := WriteFrame(&buf, Frame{
		Header: Header{
			ID:     "req-1",
			Type:   "request",
			Method: "render.printPdf",
		},
		Payload: wantPayload,
	})
	if err != nil {
		t.Fatalf("write frame: %v", err)
	}
	got, err := ReadFrame(&buf)
	if err != nil {
		t.Fatalf("read frame: %v", err)
	}
	if got.Header.ID != "req-1" || got.Header.Method != "render.printPdf" {
		t.Fatalf("unexpected header: %#v", got.Header)
	}
	if !bytes.Equal(got.Payload, wantPayload) {
		t.Fatal("payload mismatch")
	}
}

func TestReadFrameRejectsOversizedHeader(t *testing.T) {
	var buf bytes.Buffer
	buf.Write([]byte{0x00, 0x10, 0x00, 0x01})
	if _, err := ReadFrame(&buf); err == nil {
		t.Fatal("expected oversized header to fail")
	}
}
