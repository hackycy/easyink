package ipc

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"strings"
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

func TestReadFrameRejectsOversizedPayload(t *testing.T) {
	header, err := json.Marshal(Header{ID: "req-1", Type: "request", PayloadLength: MaxPayloadBytes + 1})
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	var buf bytes.Buffer
	var prefix [4]byte
	binary.BigEndian.PutUint32(prefix[:], uint32(len(header)))
	buf.Write(prefix[:])
	buf.Write(header)

	_, err = ReadFrame(&buf)
	if err == nil || !strings.Contains(err.Error(), "payload exceeds") {
		t.Fatalf("expected oversized payload error, got %v", err)
	}
}
