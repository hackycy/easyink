using System;
using EasyInk.Printer.Config;
using EasyInk.Printer.UI.Presenters;
using Xunit;

namespace EasyInk.Printer.Tests;

public class SettingsMapperTests
{
    [Fact]
    public void RenderCatalogs_ExposeOnlyChromiumVersionAndSupportedHeadlessModes()
    {
        Assert.DoesNotContain(RenderBrowserVersionCatalog.Options, option => string.Equals(option.Key, "auto", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(RenderHeadlessModeCatalog.Options, option => string.Equals(option.Key, "sh" + "ell", StringComparison.OrdinalIgnoreCase));
        Assert.All(RenderBrowserVersionCatalog.Options, option => Assert.StartsWith("Chromium", option.DisplayName));
    }

    [Fact]
    public void FromConfig_UsesDefaultsForEmptyOptionalPaths()
    {
        var config = new HostConfig
        {
            SumatraPdfPath = null,
            DbPath = null,
            CrashLogDir = null,
            SumatraTempDir = null,
            LowDpiPrintEnhancement = "monochrome",
            SumatraPrintSettings = "",
            SumatraTimeoutSeconds = 1,
            Language = "en-US"
        };

        var model = SettingsMapper.FromConfig(config, autoStart: true);

        Assert.True(model.AutoStart);
        Assert.Equal(HostConfig.DefaultSumatraPdfPath, model.SumatraPdfPath);
        Assert.Equal(HostConfig.DefaultDbPath, model.DbPath);
        Assert.Equal(HostConfig.DefaultCrashLogDir, model.CrashLogDir);
        Assert.Equal(HostConfig.DefaultSumatraTempDir, model.SumatraTempDir);
        Assert.Equal(2, model.LowDpiEnhancementIndex);
        Assert.Equal("fit", model.SumatraPrintSettings);
        Assert.Equal(5, model.SumatraTimeoutSeconds);
        Assert.Equal("en-US", model.Language);
        Assert.False(model.PrintDebugLoggingEnabled);
        Assert.Equal(90, model.AuditLogRetentionDays);
        Assert.Equal(7, model.FileLogRetentionDays);
        Assert.Equal(10, model.PrintDebugArtifactRetentionCount);
        Assert.Equal(HostConfig.DefaultPrintDebugArtifactsDir, model.PrintDebugArtifactsDir);
        Assert.False(model.RenderEnabled);
        Assert.Equal(HostConfig.DefaultRenderHostPath, model.RenderHostPath);
        Assert.Equal(RenderBrowserVersionCatalog.StableKey, model.RenderBrowserVersion);
        Assert.Equal(HostConfig.DefaultRenderBrowserCacheDir, model.RenderBrowserDir);
        Assert.Equal(RenderHeadlessModeCatalog.AutoKey, model.RenderBrowserHeadlessMode);
        Assert.Equal(30000, model.RenderRequestTimeoutMs);
        Assert.Equal(0, model.RenderIdleTimeoutMs);
        Assert.Equal(2, model.RenderMaxConcurrency);
        Assert.Equal(16, model.RenderMaxQueueSize);
        Assert.Equal(HostConfig.DefaultRenderLogDir, model.RenderLogDir);
    }

    [Fact]
    public void ApplyToConfig_TrimsListsAndStoresDefaultsAsNull()
    {
        var config = new HostConfig();
        var model = new SettingsFormModel
        {
            HttpPort = 18081,
            AutoStart = true,
            MinimizeToTray = false,
            StartMinimized = false,
            TrustAllOrigins = true,
            ApiKey = "  secret  ",
            Language = "en-US",
            LowDpiEnhancementIndex = 0,
            RawPrinterNamesText = " XP-80C, , Gprinter ",
            SumatraPdfPath = " ",
            SumatraPrinterNamesText = " HP, Canon ",
            SumatraPrintSettings = "  fit,duplex  ",
            SumatraTimeoutSeconds = 120,
            DbPath = HostConfig.DefaultDbPath,
            CrashLogDir = HostConfig.DefaultCrashLogDir,
            SumatraTempDir = HostConfig.DefaultSumatraTempDir,
            PrintDebugLoggingEnabled = true,
            AuditLogRetentionDays = 45,
            FileLogRetentionDays = 3,
            PrintDebugArtifactRetentionCount = 8,
            PrintDebugArtifactsDir = HostConfig.DefaultPrintDebugArtifactsDir,
            RenderEnabled = true,
            RenderHostPath = @"D:\EasyInk\Render\easyink-render.exe",
            RenderBrowserVersion = RenderBrowserVersionCatalog.Chromium109Key,
            RenderBrowserDir = @"D:\EasyInk\RenderBrowser",
            RenderBrowserHeadlessMode = "new",
            RenderRequestTimeoutMs = 45000,
            RenderIdleTimeoutMs = 120000,
            RenderMaxConcurrency = 3,
            RenderMaxQueueSize = 20,
            RenderLogDir = HostConfig.DefaultRenderLogDir,
            RenderDiagnosticsEnabled = true
        };

        SettingsMapper.ApplyToConfig(config, model);

        Assert.Equal(18081, config.HttpPort);
        Assert.True(config.AutoStart);
        Assert.False(config.MinimizeToTray);
        Assert.False(config.StartMinimized);
        Assert.True(config.TrustAllOrigins);
        Assert.Equal("secret", config.ApiKey);
        Assert.Equal("en-US", config.Language);
        Assert.Equal("normal", config.LowDpiPrintEnhancement);
        Assert.Equal(new[] { "XP-80C", "Gprinter" }, config.RawPrinterNames);
        Assert.Equal(HostConfig.DefaultSumatraPdfPath, config.SumatraPdfPath);
        Assert.Equal(new[] { "HP", "Canon" }, config.SumatraPrinterNames);
        Assert.Equal("fit,duplex", config.SumatraPrintSettings);
        Assert.Equal(120, config.SumatraTimeoutSeconds);
        Assert.Null(config.DbPath);
        Assert.Null(config.CrashLogDir);
        Assert.Null(config.SumatraTempDir);
        Assert.True(config.PrintDebugLoggingEnabled);
        Assert.Equal(45, config.AuditLogRetentionDays);
        Assert.Equal(3, config.FileLogRetentionDays);
        Assert.Equal(8, config.PrintDebugArtifactRetentionCount);
        Assert.Null(config.PrintDebugArtifactsDir);
        Assert.True(config.RenderEnabled);
        Assert.Equal(@"D:\EasyInk\Render\easyink-render.exe", config.RenderHostPath);
        Assert.Equal(RenderBrowserVersionCatalog.Chromium109Key, config.RenderBrowserVersion);
        Assert.Equal(@"D:\EasyInk\RenderBrowser", config.RenderBrowserDir);
        Assert.Null(config.RenderBrowserExecutablePath);
        Assert.Equal("new", config.RenderBrowserHeadlessMode);
        Assert.Equal(45000, config.RenderRequestTimeoutMs);
        Assert.Equal(120000, config.RenderIdleTimeoutMs);
        Assert.Equal(3, config.RenderMaxConcurrency);
        Assert.Equal(20, config.RenderMaxQueueSize);
        Assert.Null(config.RenderLogDir);
        Assert.True(config.RenderDiagnosticsEnabled);
    }

    [Fact]
    public void Validate_InvalidRenderBrowserDir_ReturnsInvalid()
    {
        var model = SettingsMapper.FromConfig(new HostConfig(), autoStart: false);
        model.RenderBrowserDir = @"relative\browser";

        var validation = SettingsMapper.Validate(model);

        Assert.False(validation.IsValid);
        Assert.Equal(SettingsField.RenderBrowserDir, validation.Field);
    }

    [Fact]
    public void Validate_InvalidRenderBrowserVersion_NormalizesToStable()
    {
        var model = SettingsMapper.FromConfig(new HostConfig(), autoStart: false);
        model.RenderBrowserVersion = "unknown";

        var validation = SettingsMapper.Validate(model);

        Assert.True(validation.IsValid);
        var config = new HostConfig();
        SettingsMapper.ApplyToConfig(config, model);
        Assert.Equal(RenderBrowserVersionCatalog.StableKey, config.RenderBrowserVersion);
    }

    [Theory]
    [InlineData("normal", 0)]
    [InlineData("boost", 1)]
    [InlineData("monochrome", 2)]
    [InlineData("unknown", 1)]
    [InlineData(null, 1)]
    public void GetLowDpiEnhancementSelectedIndex_MapsKnownValues(string? value, int expected)
    {
        Assert.Equal(expected, SettingsMapper.GetLowDpiEnhancementSelectedIndex(value));
    }
}
