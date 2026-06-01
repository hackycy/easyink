package main

import (
	"fmt"
	"io"
	"strconv"

	clix "easyink/render/host/internal/cli"
	"easyink/render/host/internal/config"

	"github.com/spf13/cobra"
)

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

func loadRuntimeConfig(override config.Override) (config.RuntimeConfig, error) {
	cfg, err := config.LoadRuntime()
	if err != nil {
		return config.RuntimeConfig{}, err
	}
	return config.MergeOverride(cfg, override), nil
}

func getConfigValue(cfg config.RuntimeConfig, key string) (any, bool) {
	switch key {
	case "browser.path":
		return cfg.Browser.Path, true
	case "browser.headlessMode":
		return cfg.Browser.HeadlessMode, true
	case "browser.disableSandbox":
		return cfg.Browser.DisableSandbox, true
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
	case "browser.path":
		cfg.Browser.Path = value
	case "browser.headlessMode":
		cfg.Browser.HeadlessMode = value
	case "browser.disableSandbox":
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return err
		}
		cfg.Browser.DisableSandbox = parsed
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
