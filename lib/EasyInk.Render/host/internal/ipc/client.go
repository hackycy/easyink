package ipc

import (
	"context"
	"net"
	"sync"
)

type Client struct {
	conn net.Conn
	mu   sync.Mutex
}

func DialClient(ctx context.Context, endpoint string) (*Client, error) {
	conn, err := Dial(ctx, endpoint)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn}, nil
}

func (c *Client) Close() error {
	if c == nil || c.conn == nil {
		return nil
	}
	return c.conn.Close()
}

func (c *Client) Call(frame Frame) (Frame, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := WriteFrame(c.conn, frame); err != nil {
		return Frame{}, err
	}
	return ReadFrame(c.conn)
}
