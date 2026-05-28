package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"os"

	clix "easyink/render/host/internal/cli"
	"easyink/render/host/internal/config"
	"easyink/render/host/internal/protocol"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	root := newRootCommand(stdout, stderr)
	root.SetArgs(args)
	if err := root.Execute(); err != nil {
		var exitErr exitError
		if errors.As(err, &exitErr) {
			return exitErr.code
		}
		fmt.Fprintln(stderr, err)
		return clix.ExitInvalidArguments
	}
	return clix.ExitSuccess
}

type exitError struct {
	code int
}

func (e exitError) Error() string {
	return fmt.Sprintf("command exited with code %d", e.code)
}

func commandExit(code int) error {
	if code == clix.ExitSuccess {
		return nil
	}
	return exitError{code: code}
}

func newRootCommand(stdout, stderr io.Writer) *cobra.Command {
	version := fmt.Sprintf("easyink-render %s protocol=%s", protocol.HostVersion, protocol.ProtocolVersion)
	showVersion := false
	root := &cobra.Command{
		Use:           "easyink-render",
		Short:         "EasyInk.Render CLI",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if showVersion {
				fmt.Fprintln(stdout, version)
				return nil
			}
			return cmd.Help()
		},
	}
	root.SetOut(stdout)
	root.SetErr(stderr)
	root.Flags().BoolVarP(&showVersion, "version", "v", false, "print version")
	root.AddCommand(
		newRenderCommand(stdout, stderr),
		newDaemonCommand(stdout, stderr),
		newBrowserCommand(stdout, stderr),
		newConfigCommand(stdout, stderr),
		newDiagnosticsCommand(stdout, stderr),
		&cobra.Command{
			Use:   "version",
			Short: "Print version information",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				fmt.Fprintln(stdout, version)
			},
		},
	)
	return root
}

type runtimeOptions struct {
	override      config.Override
	idleTimeoutMs int
	maxQueueSize  int
}

func newRuntimeOptions() *runtimeOptions {
	return &runtimeOptions{
		override:      config.Override{IdleTimeoutMs: -1},
		idleTimeoutMs: -1,
		maxQueueSize:  -1,
	}
}

func (o *runtimeOptions) bind(flags *pflag.FlagSet) {
	flags.StringVar(&o.override.BrowserKind, "browser-kind", "", "browser kind")
	flags.StringVar(&o.override.BrowserPath, "browser-path", "", "browser executable path")
	flags.StringVar(&o.override.HeadlessMode, "headless-mode", "", "browser headless mode: auto, new, old, shell, none")
	flags.BoolVar(&o.override.DisableSandbox, "disable-sandbox", false, "disable the browser sandbox")
	flags.StringVar(&o.override.ProfileRoot, "profile-root", "", "browser profile root")
	flags.StringVar(&o.override.TempDir, "temp-dir", "", "temporary directory")
	flags.StringVar(&o.override.LogDir, "log-dir", "", "diagnostics log directory")
	flags.IntVar(&o.override.MaxConcurrency, "max-concurrency", 0, "maximum concurrent render jobs")
	flags.IntVar(&o.maxQueueSize, "max-queue-size", -1, "maximum queued render jobs")
	flags.IntVar(&o.override.RequestTimeoutMs, "request-timeout-ms", 0, "request timeout in milliseconds")
	flags.IntVar(&o.idleTimeoutMs, "idle-timeout-ms", -1, "daemon idle timeout in milliseconds, 0 disables idle exit")
}

func (o *runtimeOptions) toOverride() config.Override {
	override := o.override
	override.IdleTimeoutMs = o.idleTimeoutMs
	if o.maxQueueSize >= 0 {
		maxQueueSize := o.maxQueueSize
		override.MaxQueueSize = &maxQueueSize
	}
	return override
}

func init() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
}
