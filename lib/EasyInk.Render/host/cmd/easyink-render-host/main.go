package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
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
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		usage(stdout)
		return clix.ExitSuccess
	}
	switch args[0] {
	case "render":
		return runRender(args[1:], stdout, stderr)
	case "daemon":
		return runDaemon(args[1:], stdout, stderr)
	case "browser":
		return runBrowser(args[1:], stdout, stderr)
	case "config":
		return runConfig(args[1:], stdout, stderr)
	case "diagnostics":
		return runDiagnostics(args[1:], stdout, stderr)
	case "version", "--version", "-v":
		fmt.Fprintf(stdout, "easyink-render %s protocol=%s\n", protocol.HostVersion, protocol.ProtocolVersion)
		return clix.ExitSuccess
	case "help", "--help", "-h":
		usage(stdout)
		return clix.ExitSuccess
	default:
		fmt.Fprintf(stderr, "unknown command: %s\n", args[0])
		usage(stderr)
		return clix.ExitInvalidArguments
	}
}

func runRender(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("easyink-render render", flag.ContinueOnError)
	fs.SetOutput(stderr)
	requestPath := fs.String("request", "", "request JSON path")
	outPath := fs.String("out", "", "output PDF path")
	jsonOut := fs.Bool("json", false, "write JSON summary")
	diagnosticsOut := fs.String("diagnostics-out", "", "extra diagnostics JSON output path")
	noDaemon := fs.Bool("no-daemon", false, "render in the current process")
	forceRestart := fs.Bool("force-restart-daemon", false, "restart daemon before render")
	override := config.Override{IdleTimeoutMs: -1}
	idleTimeout, maxQueueSize := bindRuntimeFlags(fs, &override)
	if err := fs.Parse(args); err != nil {
		return clix.ExitInvalidArguments
	}
	override.IdleTimeoutMs = *idleTimeout
	if *maxQueueSize >= 0 {
		override.MaxQueueSize = maxQueueSize
	}
	if *requestPath == "" || *outPath == "" {
		fmt.Fprintln(stderr, "render requires --request and --out")
		return clix.ExitInvalidArguments
	}
	cfg, err := loadRuntimeConfig(override)
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	requestData, req, code, err := readRequest(*requestPath)
	if err != nil {
		fmt.Fprintf(stderr, "request error: %v\n", err)
		return code
	}
	if *noDaemon {
		return renderOnce(cfg, req, *outPath, *diagnosticsOut, *jsonOut, stdout, stderr)
	}
	if err := cfg.ValidateRuntime(true); err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitBrowserUnavailable
	}
	frame, _, err := daemon.NewManager(cfg).Render(context.Background(), requestData, *forceRestart)
	if err != nil {
		fmt.Fprintf(stderr, "daemon error: %v\n", err)
		return clix.ExitDaemonUnavailable
	}
	diag := diagnosticsFromHeader(frame.Header.Diagnostics)
	if !frame.Header.OK {
		if *jsonOut {
			writeFailure(stdout, frame, diag)
		} else if frame.Header.Error != nil {
			fmt.Fprintf(stderr, "%s: %s\n", frame.Header.Error.Code, frame.Header.Error.Message)
		}
		_ = diagnostics.WriteCopy(*diagnosticsOut, diag)
		return clix.ExitCodeForIPC(frame)
	}
	if err := writeOutput(*outPath, frame.Payload); err != nil {
		fmt.Fprintf(stderr, "write output failed: %v\n", err)
		return clix.ExitOutputWriteFailed
	}
	_ = diagnostics.WriteCopy(*diagnosticsOut, diag)
	writeSuccess(stdout, *jsonOut, clix.RenderSuccess{
		Success:         true,
		RequestID:       req.RequestID,
		Out:             *outPath,
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

func runDaemon(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "daemon requires start, run, status, stop, or restart")
		return clix.ExitInvalidArguments
	}
	switch args[0] {
	case "run":
		return runDaemonRun(args[1:], stderr)
	case "start":
		cfg, err := parseRuntimeConfigFromArgs("easyink-render daemon start", args[1:], stderr)
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
	case "status":
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
	case "stop":
		cfg, _ := loadRuntimeConfig(config.Override{IdleTimeoutMs: -1})
		if err := daemon.NewManager(cfg).Stop(context.Background()); err != nil {
			fmt.Fprintf(stderr, "daemon stop failed: %v\n", err)
			return clix.ExitDaemonUnavailable
		}
		fmt.Fprintln(stdout, "daemon stopped")
		return clix.ExitSuccess
	case "restart":
		cfg, err := parseRuntimeConfigFromArgs("easyink-render daemon restart", args[1:], stderr)
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
	default:
		fmt.Fprintf(stderr, "unknown daemon command: %s\n", args[0])
		return clix.ExitInvalidArguments
	}
}

func runDaemonRun(args []string, stderr io.Writer) int {
	fs := flag.NewFlagSet("easyink-render daemon run", flag.ContinueOnError)
	fs.SetOutput(stderr)
	ipcPath := fs.String("ipc", "", "IPC endpoint")
	statePath := fs.String("state", config.StatePath(), "daemon state path")
	nonce := fs.String("nonce", "", "daemon nonce")
	override := config.Override{IdleTimeoutMs: -1}
	idleTimeout, maxQueueSize := bindRuntimeFlags(fs, &override)
	if err := fs.Parse(args); err != nil {
		return clix.ExitInvalidArguments
	}
	override.IdleTimeoutMs = *idleTimeout
	if *maxQueueSize >= 0 {
		override.MaxQueueSize = maxQueueSize
	}
	cfg, err := loadRuntimeConfig(override)
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	if err := cfg.ValidateRuntime(true); err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitBrowserUnavailable
	}
	if *ipcPath == "" {
		fmt.Fprintln(stderr, "daemon run requires --ipc")
		return clix.ExitInvalidArguments
	}
	if *nonce == "" {
		fmt.Fprintln(stderr, "daemon run requires --nonce")
		return clix.ExitInvalidArguments
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	rt, err := daemon.NewRuntime(ctx, cfg, *statePath, *ipcPath, *nonce)
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

func parseRuntimeConfigFromArgs(name string, args []string, stderr io.Writer) (config.RuntimeConfig, error) {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(stderr)
	override := config.Override{IdleTimeoutMs: -1}
	idleTimeout, maxQueueSize := bindRuntimeFlags(fs, &override)
	if err := fs.Parse(args); err != nil {
		return config.RuntimeConfig{}, err
	}
	override.IdleTimeoutMs = *idleTimeout
	if *maxQueueSize >= 0 {
		override.MaxQueueSize = maxQueueSize
	}
	return loadRuntimeConfig(override)
}

func runBrowser(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] != "inspect" {
		fmt.Fprintln(stderr, "browser requires inspect")
		return clix.ExitInvalidArguments
	}
	fs := flag.NewFlagSet("easyink-render browser inspect", flag.ContinueOnError)
	fs.SetOutput(stderr)
	override := config.Override{IdleTimeoutMs: -1}
	_, maxQueueSize := bindRuntimeFlags(fs, &override)
	if err := fs.Parse(args[1:]); err != nil {
		return clix.ExitInvalidArguments
	}
	if *maxQueueSize >= 0 {
		override.MaxQueueSize = maxQueueSize
	}
	cfg, err := loadRuntimeConfig(override)
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

func runConfig(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "config requires get or set")
		return clix.ExitInvalidArguments
	}
	cfg, err := config.LoadRuntime()
	if err != nil {
		fmt.Fprintf(stderr, "configuration error: %v\n", err)
		return clix.ExitInvalidArguments
	}
	switch args[0] {
	case "get":
		if len(args) == 1 {
			clix.WriteJSON(stdout, cfg)
			return clix.ExitSuccess
		}
		value, ok := getConfigValue(cfg, args[1])
		if !ok {
			fmt.Fprintf(stderr, "unknown config key: %s\n", args[1])
			return clix.ExitInvalidArguments
		}
		fmt.Fprintf(stdout, "%v\n", value)
		return clix.ExitSuccess
	case "set":
		if len(args) != 3 {
			fmt.Fprintln(stderr, "config set requires <key> <value>")
			return clix.ExitInvalidArguments
		}
		if err := setConfigValue(&cfg, args[1], args[2]); err != nil {
			fmt.Fprintf(stderr, "config set failed: %v\n", err)
			return clix.ExitInvalidArguments
		}
		if err := config.SaveRuntime(cfg); err != nil {
			fmt.Fprintf(stderr, "config save failed: %v\n", err)
			return clix.ExitInvalidArguments
		}
		fmt.Fprintf(stdout, "updated %s\n", args[1])
		return clix.ExitSuccess
	default:
		fmt.Fprintf(stderr, "unknown config command: %s\n", args[0])
		return clix.ExitInvalidArguments
	}
}

func runDiagnostics(args []string, stdout, stderr io.Writer) int {
	if len(args) < 2 || args[0] != "show" {
		fmt.Fprintln(stderr, "diagnostics supports: diagnostics show <path-or-id>")
		return clix.ExitInvalidArguments
	}
	path := args[1]
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

func bindRuntimeFlags(fs *flag.FlagSet, override *config.Override) (*int, *int) {
	fs.StringVar(&override.BrowserKind, "browser-kind", "", "browser kind")
	fs.StringVar(&override.BrowserPath, "browser-path", "", "browser executable path")
	fs.StringVar(&override.HeadlessMode, "headless-mode", "", "browser headless mode: auto, new, old, shell, none")
	fs.StringVar(&override.ProfileRoot, "profile-root", "", "browser profile root")
	fs.StringVar(&override.TempDir, "temp-dir", "", "temporary directory")
	fs.StringVar(&override.LogDir, "log-dir", "", "diagnostics log directory")
	fs.IntVar(&override.MaxConcurrency, "max-concurrency", 0, "maximum concurrent render jobs")
	maxQueueSize := fs.Int("max-queue-size", -1, "maximum queued render jobs")
	fs.IntVar(&override.RequestTimeoutMs, "request-timeout-ms", 0, "request timeout in milliseconds")
	idleTimeout := fs.Int("idle-timeout-ms", -1, "daemon idle timeout in milliseconds")
	return idleTimeout, maxQueueSize
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

func usage(w io.Writer) {
	fmt.Fprintln(w, `EasyInk.Render CLI

Usage:
  easyink-render render --request request.json --out out.pdf [--no-daemon]
  easyink-render daemon start|status|stop|restart
  easyink-render browser inspect --browser-path /path/to/chrome
  easyink-render config get [key]
  easyink-render config set <key> <value>
  easyink-render diagnostics show <path-or-id>
  easyink-render version`)
}

func init() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
}
