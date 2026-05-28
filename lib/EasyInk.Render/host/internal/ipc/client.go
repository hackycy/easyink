package ipc

import (
	"context"
	"net"
	"sync"
	"time"
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

func (c *Client) Call(ctx context.Context, frame Frame) (Frame, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return Frame{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if deadline, ok := ctx.Deadline(); ok {
		if err := c.conn.SetDeadline(deadline); err != nil {
			return Frame{}, err
		}
		defer c.conn.SetDeadline(time.Time{})
	}
	if err := WriteFrame(c.conn, frame); err != nil {
		return Frame{}, err
	}
	return ReadFrame(c.conn)
}
