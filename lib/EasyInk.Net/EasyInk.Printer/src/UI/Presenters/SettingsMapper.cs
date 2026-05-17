using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using EasyInk.Printer.Config;

namespace EasyInk.Printer.UI.Presenters;

internal static class SettingsMapper
{
    public static SettingsFormModel FromConfig(HostConfig config, bool autoStart)
    {
        return new SettingsFormModel
        {
            HttpPort = config.HttpPort,
            AutoStart = autoStart,
            MinimizeToTray = config.MinimizeToTray,
            StartMinimized = config.StartMinimized,
            TrustAllOrigins = config.TrustAllOrigins,
            ApiKey = string.IsNullOrWhiteSpace(config.ApiKey) ? null : config.ApiKey,
            Language = config.Language == "en-US" ? "en-US" : string.Empty,
            LowDpiEnhancementIndex = GetLowDpiEnhancementSelectedIndex(config.LowDpiPrintEnhancement),
            RawPrinterNamesText = string.Join(", ", config.RawPrinterNames),
            SumatraPdfPath = string.IsNullOrWhiteSpace(config.SumatraPdfPath)
                ? HostConfig.DefaultSumatraPdfPath
                : config.SumatraPdfPath!,
            SumatraPrinterNamesText = string.Join(", ", config.SumatraPrinterNames),
            SumatraPrintSettings = string.IsNullOrWhiteSpace(config.SumatraPrintSettings) ? "fit" : config.SumatraPrintSettings,
            SumatraTimeoutSeconds = Math.Max(5, Math.Min(300, config.SumatraTimeoutSeconds)),
            DbPath = string.IsNullOrWhiteSpace(config.DbPath) ? HostConfig.DefaultDbPath : config.DbPath!,
            CrashLogDir = string.IsNullOrWhiteSpace(config.CrashLogDir) ? HostConfig.DefaultCrashLogDir : config.CrashLogDir!,
            SumatraTempDir = string.IsNullOrWhiteSpace(config.SumatraTempDir) ? HostConfig.DefaultSumatraTempDir : config.SumatraTempDir!
        };
    }

    public static SettingsValidationResult Validate(SettingsFormModel model)
    {
        var dbPathValue = (model.DbPath ?? string.Empty).Trim();
        if (!HostConfig.IsValidFilePath(dbPathValue, out var dbError))
            return SettingsValidationResult.Invalid(SettingsField.DbPath, LangManager.Get("Error_DbPathInvalid", dbError!));

        var crashDirValue = (model.CrashLogDir ?? string.Empty).Trim();
        if (!HostConfig.IsValidFilePath(crashDirValue + Path.DirectorySeparatorChar, out var crashError))
            return SettingsValidationResult.Invalid(SettingsField.CrashLogDir, LangManager.Get("Error_CrashLogDirInvalid", crashError!));

        var sumatraTempDirValue = (model.SumatraTempDir ?? string.Empty).Trim();
        if (!HostConfig.IsValidFilePath(sumatraTempDirValue + Path.DirectorySeparatorChar, out var sumatraTempError))
            return SettingsValidationResult.Invalid(SettingsField.SumatraTempDir, LangManager.Get("Error_SumatraTempDirInvalid", sumatraTempError!));

        return SettingsValidationResult.Valid();
    }

    public static void ApplyToConfig(HostConfig config, SettingsFormModel model)
    {
        var dbPathValue = (model.DbPath ?? string.Empty).Trim();
        var crashDirValue = (model.CrashLogDir ?? string.Empty).Trim();
        var sumatraTempDirValue = (model.SumatraTempDir ?? string.Empty).Trim();

        config.LowDpiPrintEnhancement = GetLowDpiEnhancementValue(model.LowDpiEnhancementIndex);
        config.RawPrinterNames = ParseNames(model.RawPrinterNamesText);
        var sumatraPdfPathValue = model.SumatraPdfPath ?? string.Empty;
        config.SumatraPdfPath = string.IsNullOrWhiteSpace(sumatraPdfPathValue)
            ? HostConfig.DefaultSumatraPdfPath
            : sumatraPdfPathValue.Trim();
        config.SumatraPrinterNames = ParseNames(model.SumatraPrinterNamesText);
        config.SumatraPrintSettings = string.IsNullOrWhiteSpace(model.SumatraPrintSettings)
            ? "fit"
            : model.SumatraPrintSettings.Trim();
        config.SumatraTimeoutSeconds = model.SumatraTimeoutSeconds;
        config.HttpPort = model.HttpPort;
        config.AutoStart = model.AutoStart;
        config.MinimizeToTray = model.MinimizeToTray;
        config.StartMinimized = model.StartMinimized;
        config.TrustAllOrigins = model.TrustAllOrigins;
        config.Language = model.Language == "en-US" ? "en-US" : string.Empty;
        var apiKeyValue = model.ApiKey ?? string.Empty;
        config.ApiKey = string.IsNullOrWhiteSpace(apiKeyValue) ? null : apiKeyValue.Trim();
        config.DbPath = string.Equals(dbPathValue, HostConfig.DefaultDbPath, StringComparison.OrdinalIgnoreCase)
            ? null
            : dbPathValue;
        config.CrashLogDir = string.Equals(crashDirValue, HostConfig.DefaultCrashLogDir, StringComparison.OrdinalIgnoreCase)
            ? null
            : crashDirValue;
        config.SumatraTempDir = string.Equals(sumatraTempDirValue, HostConfig.DefaultSumatraTempDir, StringComparison.OrdinalIgnoreCase)
            ? null
            : sumatraTempDirValue;
    }

    public static int GetLowDpiEnhancementSelectedIndex(string? value)
    {
        if (string.Equals(value, "normal", StringComparison.OrdinalIgnoreCase))
            return 0;
        if (string.Equals(value, "monochrome", StringComparison.OrdinalIgnoreCase))
            return 2;
        return 1;
    }

    public static string GetLowDpiEnhancementValue(int selectedIndex)
    {
        switch (selectedIndex)
        {
            case 0:
                return "normal";
            case 2:
                return "monochrome";
            default:
                return "boost";
        }
    }

    private static List<string> ParseNames(string? value)
    {
        return (value ?? string.Empty)
            .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim())
            .Where(s => s.Length > 0)
            .ToList();
    }
}
