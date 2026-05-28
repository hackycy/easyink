package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	clix "easyink/render/host/internal/cli"
	"easyink/render/host/internal/config"
	"easyink/render/host/internal/daemon"

	"github.com/spf13/cobra"
)

type daemonRunOptions struct {
	ipcPath        string
	statePath      string
	nonce          string
	runtimeOptions *runtimeOptions
}

func newDaemonCommand(stdout, stderr io.Writer) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "daemon",
		Short: "Manage the render daemon",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintln(stderr, "daemon requires start, run, status, stop, or restart")
			return commandExit(clix.ExitInvalidArguments)
		},
	}

	startOptions := newRuntimeOptions()
	startCmd := &cobra.Command{
		Use:   "start",
		Short: "Start the daemon",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return commandExit(runDaemonStart(startOptions, stdout, stderr))
		},
	}
	startOptions.bind(startCmd.Flags())

	restartOptions := newRuntimeOptions()
	restartCmd := &cobra.Command{
		Use:   "restart",
		Short: "Restart the daemon",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return commandExit(runDaemonRestart(restartOptions, stdout, stderr))
		},
	}
	restartOptions.bind(restartCmd.Flags())

	runOptions := daemonRunOptions{runtimeOptions: newRuntimeOptions(), statePath: config.StatePath()}
	runCmd := &cobra.Command{
		Use:    "run",
		Short:  "Run the daemon foreground process",
		Hidden: true,
		Args:   cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return commandExit(runDaemonRun(runOptions, stderr))
		},
	}
	runCmd.Flags().StringVar(&runOptions.ipcPath, "ipc", "", "IPC endpoint")
	runCmd.Flags().StringVar(&runOptions.statePath, "state", config.StatePath(), "daemon state path")
	runCmd.Flags().StringVar(&runOptions.nonce, "nonce", "", "daemon nonce")
	runOptions.runtimeOptions.bind(runCmd.Flags())

	cmd.AddCommand(
		startCmd,
		runCmd,
		&cobra.Command{
			Use:   "status",
			Short: "Show daemon status",
			Args:  cobra.NoArgs,
			RunE: func(cmd *cobra.Command, args []string) error {
				return commandExit(runDaemonStatus(stdout, stderr))
			},
		},
		&cobra.Command{
			Use:   "stop",
			Short: "Stop the daemon",
			Args:  cobra.NoArgs,
			RunE: func(cmd *cobra.Command, args []string) error {
				return commandExit(runDaemonStop(stdout, stderr))
			},
		},
		restartCmd,
	)
	return cmd
}

func runDaemonStart(options *runtimeOptions, stdout, stderr io.Writer) int {
	cfg, err := loadRuntimeConfig(options.toOverride())
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	state, err := daemon.NewManager(cfg).Ensure(context.Background(), false)
	if err != nil {
		fmt.Fprintf(stderr, "daemon start failed: %v\n", err)
		return clix.ExitDaemonUnavailable
	}
	fmt.Fprintf(stdout, "daemon started pid=%d ipc=%s\n", state.PID, state.IPC)
	return clix.ExitSuccess
}

func runDaemonStatus(stdout, stderr io.Writer) int {
	cfg, err := loadRuntimeConfig(config.Override{IdleTimeoutMs: -1})
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	status, err := daemon.NewManager(cfg).Status(context.Background())
	if err != nil {
		fmt.Fprintf(stderr, "daemon unavailable: %v\n", err)
		return clix.ExitDaemonUnavailable
	}
	clix.WriteJSON(stdout, status)
	return clix.ExitSuccess
}

func runDaemonStop(stdout, stderr io.Writer) int {
	cfg, err := loadRuntimeConfig(config.Override{IdleTimeoutMs: -1})
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	if err := daemon.NewManager(cfg).Stop(context.Background()); err != nil {
		fmt.Fprintf(stderr, "daemon stop failed: %v\n", err)
		return clix.ExitDaemonUnavailable
	}
	fmt.Fprintln(stdout, "daemon stopped")
	return clix.ExitSuccess
}

func runDaemonRestart(options *runtimeOptions, stdout, stderr io.Writer) int {
	cfg, err := loadRuntimeConfig(options.toOverride())
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	if err := daemon.NewManager(cfg).Restart(context.Background()); err != nil {
		fmt.Fprintf(stderr, "daemon restart failed: %v\n", err)
		return clix.ExitDaemonUnavailable
	}
	fmt.Fprintln(stdout, "daemon restarted")
	return clix.ExitSuccess
}

func runDaemonRun(options daemonRunOptions, stderr io.Writer) int {
	cfg, err := loadRuntimeConfig(options.runtimeOptions.toOverride())
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	if err := cfg.ValidateRuntime(true); err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitBrowserUnavailable
	}
	if options.ipcPath == "" {
		fmt.Fprintln(stderr, "daemon run requires --ipc")
		return clix.ExitInvalidArguments
	}
	if options.nonce == "" {
		fmt.Fprintln(stderr, "daemon run requires --nonce")
		return clix.ExitInvalidArguments
	}
	lock, err := daemon.AcquireLock(daemon.ProcessLockPath(options.statePath), 10*time.Second)
	if err != nil {
		fmt.Fprintf(stderr, "daemon already running: %v\n", err)
		return clix.ExitDaemonUnavailable
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	rt, err := daemon.NewRuntime(ctx, cfg, options.statePath, options.ipcPath, options.nonce)
	if err != nil {
		lock.Release()
		fmt.Fprintf(stderr, "daemon startup failed: %v\n", err)
		return clix.ExitBrowserUnavailable
	}
	rt.SetProcessLock(lock)
	if err := rt.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		fmt.Fprintf(stderr, "daemon runtime failed: %v\n", err)
		return clix.ExitGeneralFailure
	}
	return clix.ExitSuccess
}
