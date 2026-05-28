package main

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	clix "easyink/render/host/internal/cli"
	"easyink/render/host/internal/config"

	"github.com/spf13/cobra"
)

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
