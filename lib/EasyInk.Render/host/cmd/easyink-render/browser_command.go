package main

import (
	"context"
	"fmt"
	"io"

	"easyink/render/host/internal/browser"
	clix "easyink/render/host/internal/cli"

	"github.com/spf13/cobra"
)

func newBrowserCommand(stdout, stderr io.Writer) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "browser",
		Short: "Browser utilities",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintln(stderr, "browser requires inspect")
			return commandExit(clix.ExitInvalidArguments)
		},
	}
	inspectOptions := newRuntimeOptions()
	inspectCmd := &cobra.Command{
		Use:   "inspect",
		Short: "Inspect configured browser",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return commandExit(runBrowserInspect(inspectOptions, stdout, stderr))
		},
	}
	inspectOptions.bind(inspectCmd.Flags())
	cmd.AddCommand(inspectCmd)
	return cmd
}

func runBrowserInspect(options *runtimeOptions, stdout, stderr io.Writer) int {
	cfg, err := loadRuntimeConfig(options.toOverride())
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	if err := cfg.ValidateRuntime(true); err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitBrowserUnavailable
	}
	result, err := browser.Inspect(context.Background(), cfg.Browser, cfg.ProfileRoot)
	if err != nil {
		fmt.Fprintf(stderr, "browser inspect failed: %v\n", err)
		return clix.ExitBrowserUnavailable
	}
	clix.WriteJSON(stdout, result)
	return clix.ExitSuccess
}
