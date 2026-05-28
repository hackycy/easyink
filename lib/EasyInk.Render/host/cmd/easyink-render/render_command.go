package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
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
)

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
	renderCtx, cancel := context.WithTimeout(context.Background(), time.Duration(resolveRequestTimeoutMs(cfg, req))*time.Millisecond)
	defer cancel()
	frame, _, err := daemon.NewManager(cfg).Render(renderCtx, requestData, options.forceRestart)
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

func readRequest(path string) ([]byte, protocol.PrintPDFRequest, int, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, protocol.PrintPDFRequest{}, clix.ExitInvalidArguments, err
	}
	defer file.Close()
	if info, err := file.Stat(); err == nil && info.Size() > ipc.MaxPayloadBytes {
		return nil, protocol.PrintPDFRequest{}, clix.ExitInvalidRequestJSON, fmt.Errorf("request JSON exceeds %d bytes", ipc.MaxPayloadBytes)
	}
	reader := io.LimitReader(file, ipc.MaxPayloadBytes+1)
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, protocol.PrintPDFRequest{}, clix.ExitInvalidArguments, err
	}
	if len(data) > ipc.MaxPayloadBytes {
		return nil, protocol.PrintPDFRequest{}, clix.ExitInvalidRequestJSON, fmt.Errorf("request JSON exceeds %d bytes", ipc.MaxPayloadBytes)
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

func resolveRequestTimeoutMs(cfg config.RuntimeConfig, req protocol.PrintPDFRequest) int {
	timeoutMs := cfg.RequestTimeoutMs
	if req.Wait.TimeoutMs > 0 && req.Wait.TimeoutMs < timeoutMs {
		timeoutMs = req.Wait.TimeoutMs
	}
	return timeoutMs
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
