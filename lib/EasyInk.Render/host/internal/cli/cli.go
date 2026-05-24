package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"easyink/render/host/internal/ipc"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/render"
)

const (
	ExitSuccess            = 0
	ExitGeneralFailure     = 1
	ExitInvalidArguments   = 2
	ExitInvalidRequestJSON = 3
	ExitDaemonUnavailable  = 4
	ExitDaemonProtocol     = 5
	ExitRenderFailed       = 6
	ExitOutputWriteFailed  = 7
	ExitTimeout            = 8
	ExitBrowserUnavailable = 9
)

type RenderSuccess struct {
	Success         bool   `json:"success"`
	RequestID       string `json:"requestId"`
	Out             string `json:"out"`
	PageCount       int    `json:"pageCount"`
	DiagnosticsPath string `json:"diagnosticsPath,omitempty"`
}

type RenderFailure struct {
	Success         bool   `json:"success"`
	Code            string `json:"code"`
	Message         string `json:"message"`
	RequestID       string `json:"requestId,omitempty"`
	DiagnosticsPath string `json:"diagnosticsPath,omitempty"`
}

func WriteJSON(w io.Writer, value any) {
	data, _ := json.MarshalIndent(value, "", "  ")
	_, _ = fmt.Fprintln(w, string(data))
}

func ExitCode(err error) int {
	if err == nil {
		return ExitSuccess
	}
	var coded *render.CodedError
	if errors.As(err, &coded) {
		switch coded.Code {
		case protocol.ErrInvalidRequest, protocol.ErrInvalidPDF, protocol.ErrSecurityBlocked:
			return ExitInvalidRequestJSON
		case protocol.ErrRenderTimeout:
			return ExitTimeout
		default:
			return ExitRenderFailed
		}
	}
	return ExitGeneralFailure
}

func ExitCodeForIPC(frame ipc.Frame) int {
	if frame.Header.OK {
		return ExitSuccess
	}
	if frame.Header.Error == nil {
		return ExitDaemonProtocol
	}
	switch frame.Header.Error.Code {
	case protocol.ErrInvalidRequest, protocol.ErrInvalidPDF, protocol.ErrSecurityBlocked:
		return ExitInvalidRequestJSON
	case protocol.ErrRenderTimeout:
		return ExitTimeout
	case protocol.ErrTooManyRequests, protocol.ErrRenderFailed:
		return ExitRenderFailed
	default:
		return ExitDaemonProtocol
	}
}
