using System;
using EasyInk.Printer.Config;
using EasyInk.Printer.UI.Presenters;
using Xunit;

namespace EasyInk.Printer.Tests;

public class SettingsMapperTests
{
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
            SumatraTempDir = HostConfig.DefaultSumatraTempDir
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
