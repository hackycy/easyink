package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"easyink/render/host/internal/browser"
	clix "easyink/render/host/internal/cli"
	"easyink/render/host/internal/config"
	"easyink/render/host/internal/daemon"
	"easyink/render/host/internal/diagnostics"
	"easyink/render/host/internal/ipc"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/render"

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

type renderOptions struct {
	requestPath    string
	outPath        string
	diagnosticsOut string
	jsonOut        bool
	noDaemon       bool
	forceRestart   bool
	runtimeOptions *runtimeOptions
}

func newRenderCommand(stdout, stderr io.Writer) *cobra.Command {
	options := renderOptions{runtimeOptions: newRuntimeOptions()}
	cmd := &cobra.Command{
		Use:   "render",
		Short: "Render a request to PDF",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return commandExit(runRender(options, stdout, stderr))
		},
	}
	flags := cmd.Flags()
	flags.StringVar(&options.requestPath, "request", "", "request JSON path")
	flags.StringVar(&options.outPath, "out", "", "output PDF path")
	flags.BoolVar(&options.jsonOut, "json", false, "write JSON summary")
	flags.StringVar(&options.diagnosticsOut, "diagnostics-out", "", "extra diagnostics JSON output path")
	flags.BoolVar(&options.noDaemon, "no-daemon", false, "render in the current process")
	flags.BoolVar(&options.forceRestart, "force-restart-daemon", false, "restart daemon before render")
	options.runtimeOptions.bind(flags)
	return cmd
}

func runRender(options renderOptions, stdout, stderr io.Writer) int {
	if options.requestPath == "" || options.outPath == "" {
		fmt.Fprintln(stderr, "render requires --request and --out")
		return clix.ExitInvalidArguments
	}
	cfg, err := loadRuntimeConfig(options.runtimeOptions.toOverride())
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	requestData, req, code, err := readRequest(options.requestPath)
	if err != nil {
		fmt.Fprintf(stderr, "request error: %v\n", err)
		return code
	}
	if options.noDaemon {
		return renderOnce(cfg, req, options.outPath, options.diagnosticsOut, options.jsonOut, stdout, stderr)
	}
	if err := cfg.ValidateRuntime(true); err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitBrowserUnavailable
	}
	frame, _, err := daemon.NewManager(cfg).Render(context.Background(), requestData, options.forceRestart)
	if err != nil {
		fmt.Fprintf(stderr, "daemon error: %v\n", err)
		return clix.ExitDaemonUnavailable
	}
	diag := diagnosticsFromHeader(frame.Header.Diagnostics)
	if !frame.Header.OK {
		if options.jsonOut {
			writeFailure(stdout, frame, diag)
		} else if frame.Header.Error != nil {
			fmt.Fprintf(stderr, "%s: %s\n", frame.Header.Error.Code, frame.Header.Error.Message)
		}
		_ = diagnostics.WriteCopy(options.diagnosticsOut, diag)
		return clix.ExitCodeForIPC(frame)
	}
	if err := writeOutput(options.outPath, frame.Payload); err != nil {
		fmt.Fprintf(stderr, "write output failed: %v\n", err)
		return clix.ExitOutputWriteFailed
	}
	_ = diagnostics.WriteCopy(options.diagnosticsOut, diag)
	writeSuccess(stdout, options.jsonOut, clix.RenderSuccess{
		Success:         true,
		RequestID:       req.RequestID,
		Out:             options.outPath,
		PageCount:       diag.PageCount,
		DiagnosticsPath: diag.AttachmentPath,
	})
	return clix.ExitSuccess
}

func renderOnce(cfg config.RuntimeConfig, req protocol.PrintPDFRequest, outPath, diagnosticsOut string, jsonOut bool, stdout, stderr io.Writer) int {
	requireBrowser := req.Source.Type != "pdf"
	if err := cfg.ValidateRuntime(requireBrowser); err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		if requireBrowser {
			return clix.ExitBrowserUnavailable
		}
		return clix.ExitInvalidArguments
	}
	var manager *browser.Manager
	var err error
	ctx := context.Background()
	if requireBrowser {
		manager, err = browser.NewWithConfig(ctx, cfg.Browser, cfg.ProfileRoot)
		if err != nil {
			fmt.Fprintf(stderr, "browser startup error: %v\n", err)
			return clix.ExitBrowserUnavailable
		}
		defer manager.Shutdown()
	}
	renderer := render.NewService(manager)
	timeoutMs := cfg.RequestTimeoutMs
	if req.Wait.TimeoutMs > 0 && req.Wait.TimeoutMs < timeoutMs {
		timeoutMs = req.Wait.TimeoutMs
	}
	renderCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	result, err := renderer.RenderPrintPDF(renderCtx, req)
	result.Diagnostics = diagnostics.Persist(cfg.LogDir, result.Diagnostics, result.Attachments, req.Diagnostics)
	_ = diagnostics.WriteCopy(diagnosticsOut, result.Diagnostics)
	if err != nil {
		if jsonOut {
			coded := codedError(err)
			clix.WriteJSON(stdout, clix.RenderFailure{
				Success:         false,
				Code:            coded.Code,
				Message:         coded.Message,
				RequestID:       req.RequestID,
				DiagnosticsPath: result.Diagnostics.AttachmentPath,
			})
		} else {
			fmt.Fprintf(stderr, "render failed: %v\n", err)
		}
		return clix.ExitCode(err)
	}
	if err := writeOutput(outPath, result.PDF); err != nil {
		fmt.Fprintf(stderr, "write output failed: %v\n", err)
		return clix.ExitOutputWriteFailed
	}
	writeSuccess(stdout, jsonOut, clix.RenderSuccess{
		Success:         true,
		RequestID:       req.RequestID,
		Out:             outPath,
		PageCount:       result.PageCount,
		DiagnosticsPath: result.Diagnostics.AttachmentPath,
	})
	return clix.ExitSuccess
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

type daemonRunOptions struct {
	ipcPath        string
	statePath      string
	nonce          string
	runtimeOptions *runtimeOptions
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
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	rt, err := daemon.NewRuntime(ctx, cfg, options.statePath, options.ipcPath, options.nonce)
	if err != nil {
		fmt.Fprintf(stderr, "daemon startup failed: %v\n", err)
		return clix.ExitBrowserUnavailable
	}
	if err := rt.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		fmt.Fprintf(stderr, "daemon runtime failed: %v\n", err)
		return clix.ExitGeneralFailure
	}
	return clix.ExitSuccess
}

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

func newConfigCommand(stdout, stderr io.Writer) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Read or update runtime configuration",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintln(stderr, "config requires get or set")
			return commandExit(clix.ExitInvalidArguments)
		},
	}
	cmd.AddCommand(
		&cobra.Command{
			Use:   "get [key]",
			Short: "Read runtime configuration",
			Args:  cobra.MaximumNArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				key := ""
				if len(args) == 1 {
					key = args[0]
				}
				return commandExit(runConfigGet(key, stdout, stderr))
			},
		},
		&cobra.Command{
			Use:   "set <key> <value>",
			Short: "Update runtime configuration",
			Args:  cobra.ExactArgs(2),
			RunE: func(cmd *cobra.Command, args []string) error {
				return commandExit(runConfigSet(args[0], args[1], stdout, stderr))
			},
		},
	)
	return cmd
}

func runConfigGet(key string, stdout, stderr io.Writer) int {
	cfg, err := config.LoadRuntime()
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	if key == "" {
		clix.WriteJSON(stdout, cfg)
		return clix.ExitSuccess
	}
	value, ok := getConfigValue(cfg, key)
	if !ok {
		fmt.Fprintf(stderr, "unknown config key: %s\n", key)
		return clix.ExitInvalidArguments
	}
	fmt.Fprintf(stdout, "%v\n", value)
	return clix.ExitSuccess
}

func runConfigSet(key, value string, stdout, stderr io.Writer) int {
	cfg, err := config.LoadRuntime()
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	if err := setConfigValue(&cfg, key, value); err != nil {
		fmt.Fprintf(stderr, "config set failed: %v\n", err)
		return clix.ExitInvalidArguments
	}
	if err := config.SaveRuntime(cfg); err != nil {
		fmt.Fprintf(stderr, "config save failed: %v\n", err)
		return clix.ExitInvalidArguments
	}
	fmt.Fprintf(stdout, "updated %s\n", key)
	return clix.ExitSuccess
}

func newDiagnosticsCommand(stdout, stderr io.Writer) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "diagnostics",
		Short: "Read diagnostics files",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintln(stderr, "diagnostics supports: diagnostics show <path-or-id>")
			return commandExit(clix.ExitInvalidArguments)
		},
	}
	cmd.AddCommand(&cobra.Command{
		Use:   "show <path-or-id>",
		Short: "Print diagnostics JSON",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return commandExit(runDiagnosticsShow(args[0], stdout, stderr))
		},
	})
	return cmd
}

func runDiagnosticsShow(path string, stdout, stderr io.Writer) int {
	if !strings.Contains(path, string(filepath.Separator)) && filepath.Ext(path) == "" {
		path = filepath.Join(config.Defaults().LogDir, "diagnostics", path, "diagnostics.json")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(stderr, "read diagnostics failed: %v\n", err)
		return clix.ExitInvalidArguments
	}
	fmt.Fprintln(stdout, string(bytes.TrimSpace(data)))
	return clix.ExitSuccess
}

func loadRuntimeConfig(override config.Override) (config.RuntimeConfig, error) {
	cfg, err := config.LoadRuntime()
	if err != nil {
		return config.RuntimeConfig{}, err
	}
	return config.MergeOverride(cfg, override), nil
}

func readRequest(path string) ([]byte, protocol.PrintPDFRequest, int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, protocol.PrintPDFRequest{}, clix.ExitInvalidArguments, err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var req protocol.PrintPDFRequest
	if err := decoder.Decode(&req); err != nil {
		return nil, protocol.PrintPDFRequest{}, clix.ExitInvalidRequestJSON, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return nil, protocol.PrintPDFRequest{}, clix.ExitInvalidRequestJSON, errors.New("request JSON must contain a single object")
	}
	return data, req, clix.ExitSuccess, nil
}

func writeOutput(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func writeSuccess(stdout io.Writer, jsonOut bool, value clix.RenderSuccess) {
	if jsonOut {
		clix.WriteJSON(stdout, value)
		return
	}
	fmt.Fprintf(stdout, "Rendered %s pages=%d diagnostics=%s\n", value.Out, value.PageCount, value.DiagnosticsPath)
}

func writeFailure(stdout io.Writer, frame ipc.Frame, diag protocol.Diagnostics) {
	code := protocol.ErrRenderFailed
	message := "render failed"
	if frame.Header.Error != nil {
		code = frame.Header.Error.Code
		message = frame.Header.Error.Message
	}
	clix.WriteJSON(stdout, clix.RenderFailure{
		Success:         false,
		Code:            code,
		Message:         message,
		RequestID:       diag.RequestID,
		DiagnosticsPath: diag.AttachmentPath,
	})
}

func diagnosticsFromHeader(value any) protocol.Diagnostics {
	var diag protocol.Diagnostics
	if value == nil {
		return diag
	}
	data, err := json.Marshal(value)
	if err == nil {
		_ = json.Unmarshal(data, &diag)
	}
	return diag
}

func codedError(err error) struct {
	Code    string
	Message string
} {
	var coded *render.CodedError
	if errors.As(err, &coded) {
		return struct {
			Code    string
			Message string
		}{Code: coded.Code, Message: coded.Message}
	}
	return struct {
		Code    string
		Message string
	}{Code: protocol.ErrRenderFailed, Message: err.Error()}
}

func getConfigValue(cfg config.RuntimeConfig, key string) (any, bool) {
	switch key {
	case "browser.kind":
		return cfg.Browser.Kind, true
	case "browser.path":
		return cfg.Browser.Path, true
	case "browser.headlessMode":
		return cfg.Browser.HeadlessMode, true
	case "profileRoot":
		return cfg.ProfileRoot, true
	case "tempDir":
		return cfg.TempDir, true
	case "logDir":
		return cfg.LogDir, true
	case "maxConcurrency":
		return cfg.MaxConcurrency, true
	case "maxQueueSize":
		return cfg.MaxQueueSize, true
	case "requestTimeoutMs":
		return cfg.RequestTimeoutMs, true
	case "idleTimeoutMs":
		return cfg.IdleTimeoutMs, true
	default:
		return nil, false
	}
}

func setConfigValue(cfg *config.RuntimeConfig, key, value string) error {
	switch key {
	case "browser.kind":
		cfg.Browser.Kind = value
	case "browser.path":
		cfg.Browser.Path = value
	case "browser.headlessMode":
		cfg.Browser.HeadlessMode = value
	case "profileRoot":
		cfg.ProfileRoot = value
	case "tempDir":
		cfg.TempDir = value
	case "logDir":
		cfg.LogDir = value
	case "maxConcurrency":
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return err
		}
		cfg.MaxConcurrency = parsed
	case "maxQueueSize":
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return err
		}
		cfg.MaxQueueSize = parsed
	case "requestTimeoutMs":
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return err
		}
		cfg.RequestTimeoutMs = parsed
	case "idleTimeoutMs":
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return err
		}
		cfg.IdleTimeoutMs = parsed
	default:
		return fmt.Errorf("unknown config key: %s", key)
	}
	return nil
}

func init() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
}
