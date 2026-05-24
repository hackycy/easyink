package ipc

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const MaxHeaderBytes = 1024 * 1024

type Header struct {
	ID                string         `json:"id"`
	Type              string         `json:"type"`
	Method            string         `json:"method,omitempty"`
	OK                bool           `json:"ok,omitempty"`
	ContentType       string         `json:"contentType,omitempty"`
	PayloadLength     int64          `json:"payloadLength,omitempty"`
	Meta              map[string]any `json:"meta,omitempty"`
	Diagnostics       any            `json:"diagnostics,omitempty"`
	Error             *Error         `json:"error,omitempty"`
	ConfigFingerprint string         `json:"configFingerprint,omitempty"`
}

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Frame struct {
	Header  Header
	Payload []byte
}

func WriteFrame(w io.Writer, frame Frame) error {
	if frame.Header.PayloadLength == 0 && len(frame.Payload) > 0 {
		frame.Header.PayloadLength = int64(len(frame.Payload))
	}
	header, err := json.Marshal(frame.Header)
	if err != nil {
		return err
	}
	if len(header) > MaxHeaderBytes {
		return fmt.Errorf("ipc header exceeds %d bytes", MaxHeaderBytes)
	}
	var prefix [4]byte
	binary.BigEndian.PutUint32(prefix[:], uint32(len(header)))
	if _, err := w.Write(prefix[:]); err != nil {
		return err
	}
	if _, err := w.Write(header); err != nil {
		return err
	}
	if len(frame.Payload) > 0 {
		if int64(len(frame.Payload)) != frame.Header.PayloadLength {
			return errors.New("ipc payload length mismatch")
		}
		_, err = w.Write(frame.Payload)
		return err
	}
	return nil
}

func ReadFrame(r io.Reader) (Frame, error) {
	var prefix [4]byte
	if _, err := io.ReadFull(r, prefix[:]); err != nil {
		return Frame{}, err
	}
	headerLen := binary.BigEndian.Uint32(prefix[:])
	if headerLen == 0 || headerLen > MaxHeaderBytes {
		return Frame{}, fmt.Errorf("invalid ipc header length: %d", headerLen)
	}
	headerBytes := make([]byte, headerLen)
	if _, err := io.ReadFull(r, headerBytes); err != nil {
		return Frame{}, err
	}
	var header Header
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return Frame{}, err
	}
	if header.PayloadLength < 0 {
		return Frame{}, errors.New("invalid negative ipc payload length")
	}
	payload := make([]byte, header.PayloadLength)
	if header.PayloadLength > 0 {
		if _, err := io.ReadFull(r, payload); err != nil {
			return Frame{}, err
		}
	}
	return Frame{Header: header, Payload: payload}, nil
}
