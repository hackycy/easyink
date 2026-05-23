package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"

	"easyink/render/host/internal/browser"
	"easyink/render/host/internal/config"
	"easyink/render/host/internal/server"
)

func main() {
	cfg, err := config.Parse(os.Args[1:])
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	browserManager, err := browser.New(ctx, cfg.BrowserPath, cfg.ProfileRoot)
	if err != nil {
		log.Fatalf("browser startup error: %v", err)
	}
	defer browserManager.Shutdown()

	srv := server.New(cfg, browserManager)
	if err := srv.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		log.Fatalf("server error: %v", err)
	}
}
