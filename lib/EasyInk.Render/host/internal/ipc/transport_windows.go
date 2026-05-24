//go:build windows

package ipc

import (
	"context"
	"net"

	"github.com/Microsoft/go-winio"
)

func DefaultEndpoint() string {
	return `\\.\pipe\easyink-render-default`
}

func Listen(endpoint string) (net.Listener, error) {
	return winio.ListenPipe(endpoint, &winio.PipeConfig{
		SecurityDescriptor: "D:P(A;;GA;;;OW)",
		InputBufferSize:    65536,
		OutputBufferSize:   65536,
	})
}

func Dial(ctx context.Context, endpoint string) (net.Conn, error) {
	return winio.DialPipeContext(ctx, endpoint)
}

func Remove(endpoint string) {}
