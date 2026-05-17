using System;
using System.IO;
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
    public void BuildAutoStartCommand_AddsAutoStartFlag()
    {
        var command = HostConfig.BuildAutoStartCommand(@"C:\Program Files\EasyInk Printer\EasyInk.Printer.exe");

        Assert.Equal(@"""C:\Program Files\EasyInk Printer\EasyInk.Printer.exe"" --autostart", command);
    }
}
