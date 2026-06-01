using System;
using System.IO;
using System.Reflection;
using EasyInk.Printer.Config;
using Xunit;

namespace EasyInk.Printer.Tests;

public class HostConfigTests
{
    [Theory]
    [InlineData(@"C:\data\audit.db")]
    [InlineData(@"D:\some\path\file.db")]
    [InlineData(@"E:\")]
    public void IsValidFilePath_ValidPaths_ReturnsTrue(string path)
    {
        Assert.True(HostConfig.IsValidFilePath(path, out _));
    }

    [Theory]
    [InlineData(null, "路径不能为空")]
    [InlineData("", "路径不能为空")]
    [InlineData("  ", "路径不能为空")]
    [InlineData(@"data\audit.db", "路径必须包含盘符")]
    [InlineData(@"\data\audit.db", "路径必须包含盘符")]
    [InlineData(@"1:\invalid.db", "路径必须包含盘符")]
    public void IsValidFilePath_InvalidPaths_ReturnsFalseWithError(string? path, string expectedError)
    {
        Assert.False(HostConfig.IsValidFilePath(path!, out var error));
        Assert.Contains(expectedError, error!);
    }

    [Fact]
    public void DefaultDbPath_HasDriveLetter()
    {
        Assert.True(HostConfig.IsValidFilePath(HostConfig.DefaultDbPath, out _));
    }

    [Fact]
    public void DefaultDbPath_UsesLocalApplicationData()
    {
        var expected = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "EasyInk.Printer",
            "data",
            "audit.db");

        Assert.Equal(expected, HostConfig.DefaultDbPath);
    }

    [Fact]
    public void DefaultCrashLogDir_UsesLocalApplicationData()
    {
        var expected = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "EasyInk.Printer",
            "data",
            "crash");

        Assert.Equal(expected, HostConfig.DefaultCrashLogDir);
    }

    [Fact]
    public void DefaultSumatraTempDir_UsesLocalApplicationData()
    {
        var expected = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "EasyInk.Printer",
            "temp",
            "sumatra");

        Assert.Equal(expected, HostConfig.DefaultSumatraTempDir);
    }

    [Fact]
    public void DefaultRenderDirs_UseLocalApplicationData()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        Assert.Equal(Path.Combine(localAppData, "EasyInk.Printer", "render", "browser"), HostConfig.DefaultRenderBrowserCacheDir);
        Assert.Equal(Path.Combine(localAppData, "EasyInk.Printer", "render", "browser", "versions"), HostConfig.DefaultRenderBrowserVersionsDir);
        Assert.Equal(Path.Combine(localAppData, "EasyInk.Printer", "render", "profile"), HostConfig.DefaultRenderProfileRoot);
        Assert.Equal(Path.Combine(localAppData, "EasyInk.Printer", "render", "temp"), HostConfig.DefaultRenderTempDir);
        Assert.Equal(Path.Combine(localAppData, "EasyInk.Printer", "data", "logs", "render"), HostConfig.DefaultRenderLogDir);
    }

    [Fact]
    public void GetRenderBrowserVersionDir_EmptyVersion_UsesStableVersion()
    {
        Assert.Equal(
            Path.Combine(HostConfig.DefaultRenderBrowserVersionsDir, RenderBrowserVersionCatalog.StableKey),
            HostConfig.GetRenderBrowserVersionDir(string.Empty));
    }

    [Fact]
    public void GetRenderBrowserVersionDir_CustomRoot_UsesRootVersionsDirectory()
    {
        Assert.Equal(
            Path.Combine(@"D:\EasyInk\RenderBrowser", "versions", "126"),
            HostConfig.GetRenderBrowserVersionDir(@"D:\EasyInk\RenderBrowser", "126"));
    }

    [Fact]
    public void DefaultBundledRenderPaths_UseApplicationBaseDirectory()
    {
        var expectedDefault = Environment.Is64BitOperatingSystem
            ? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "render", "host", "win-x64", "easyink-render.exe")
            : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "render", "host", "win-x86", "easyink-render.exe");
        Assert.Equal(expectedDefault, HostConfig.DefaultRenderHostPath);
        Assert.Equal(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "render", "browser"), HostConfig.DefaultRenderBrowserDir);
        Assert.Equal(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "render", "runtime-manifest.json"), HostConfig.DefaultRenderManifestPath);
    }

    [Fact]
    public void ResolveDbPath_Null_ReturnsDefault()
    {
        Assert.Equal(HostConfig.DefaultDbPath, HostConfig.ResolveDbPath(null!));
    }

    [Fact]
    public void ResolveDbPath_Empty_ReturnsDefault()
    {
        Assert.Equal(HostConfig.DefaultDbPath, HostConfig.ResolveDbPath(""));
    }

    [Fact]
    public void ResolveDbPath_Custom_ReturnsCustom()
    {
        Assert.Equal(@"D:\custom\db.sqlite", HostConfig.ResolveDbPath(@"D:\custom\db.sqlite"));
    }

    [Fact]
    public void ResolveCrashLogDir_Null_ReturnsDefault()
    {
        Assert.Equal(HostConfig.DefaultCrashLogDir, HostConfig.ResolveCrashLogDir(null!));
    }

    [Fact]
    public void ResolveSumatraTempDir_Null_ReturnsDefault()
    {
        Assert.Equal(HostConfig.DefaultSumatraTempDir, HostConfig.ResolveSumatraTempDir(null!));
    }

    [Fact]
    public void ResolveSumatraTempDir_Custom_ReturnsCustom()
    {
        Assert.Equal(@"D:\custom\temp", HostConfig.ResolveSumatraTempDir(@"D:\custom\temp"));
    }

    [Fact]
    public void ResolveRenderDirs_Null_ReturnsDefaults()
    {
        Assert.Equal(HostConfig.DefaultRenderHostPath, HostConfig.ResolveRenderHostPath(null!));
        Assert.Equal(HostConfig.DefaultRenderProfileRoot, HostConfig.ResolveRenderProfileRoot(null!));
        Assert.Equal(HostConfig.DefaultRenderTempDir, HostConfig.ResolveRenderTempDir(null!));
        Assert.Equal(HostConfig.DefaultRenderLogDir, HostConfig.ResolveRenderLogDir(null!));
    }

    [Fact]
    public void RenderLimits_ClampToMinimums()
    {
        var config = new HostConfig
        {
            RenderPort = 1,
            RenderRequestTimeoutMs = 1,
            RenderIdleTimeoutMs = -1,
            RenderMaxConcurrency = 0,
            RenderMaxQueueSize = -1
        };

        Assert.Equal(1024, config.RenderPort);
        Assert.Equal(1000, config.RenderRequestTimeoutMs);
        Assert.Equal(0, config.RenderIdleTimeoutMs);
        Assert.Equal(1, config.RenderMaxConcurrency);
        Assert.Equal(0, config.RenderMaxQueueSize);
    }

    [Fact]
    public void BuildAutoStartCommand_AddsAutoStartFlag()
    {
        var command = HostConfig.BuildAutoStartCommand(@"C:\Program Files\EasyInk Printer\EasyInk.Printer.exe");

        Assert.Equal(@"""C:\Program Files\EasyInk Printer\EasyInk.Printer.exe"" --autostart", command);
    }

    [Fact]
    public void Save_ReplacesExistingConfigWithoutLeavingTempFile()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "EasyInk.Printer.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        try
        {
            using var _ = OverrideConfigPath(tempDir);
            var configPath = Path.Combine(tempDir, "config.json");
            File.WriteAllText(configPath, "{\"HttpPort\": 1}");

            var config = new HostConfig
            {
                HttpPort = 19090,
                Language = "en-US"
            };

            config.Save();

            var savedJson = File.ReadAllText(configPath);
            Assert.Contains("\"HttpPort\": 19090", savedJson);
            Assert.Contains("\"Language\": \"en-US\"", savedJson);
            Assert.False(File.Exists(configPath + ".tmp"));
        }
        finally
        {
            if (Directory.Exists(tempDir))
                Directory.Delete(tempDir, recursive: true);
        }
    }

    private static IDisposable OverrideConfigPath(string configDir)
    {
        var configDirField = typeof(HostConfig).GetField("ConfigDir", BindingFlags.Static | BindingFlags.NonPublic)!;
        var configPathField = typeof(HostConfig).GetField("ConfigPath", BindingFlags.Static | BindingFlags.NonPublic)!;
        var originalConfigDir = (string)configDirField.GetValue(null)!;
        var originalConfigPath = (string)configPathField.GetValue(null)!;
        var configPath = Path.Combine(configDir, "config.json");

        configDirField.SetValue(null, configDir);
        configPathField.SetValue(null, configPath);

        return new ConfigPathOverride(configDirField, originalConfigDir, configPathField, originalConfigPath);
    }

    private sealed class ConfigPathOverride(
        FieldInfo configDirField,
        string originalConfigDir,
        FieldInfo configPathField,
        string originalConfigPath) : IDisposable
    {
        public void Dispose()
        {
            configDirField.SetValue(null, originalConfigDir);
            configPathField.SetValue(null, originalConfigPath);
        }
    }
}
