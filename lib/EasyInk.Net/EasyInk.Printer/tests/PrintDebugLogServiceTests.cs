using System;
using System.IO;
using System.Linq;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Printer.Config;
using EasyInk.Printer.Services;
using Xunit;

namespace EasyInk.Printer.Tests;

public class PrintDebugLogServiceTests : IDisposable
{
    private readonly string _directory;

    public PrintDebugLogServiceTests()
    {
        _directory = Path.Combine(Path.GetTempPath(), $"easyink_debug_{Guid.NewGuid():N}");
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
            Directory.Delete(_directory, recursive: true);
    }

    [Fact]
    public void BeginPrintRequest_SavesArtifactsAndRedactsApiKey()
    {
        var config = new HostConfig
        {
            PrintDebugLoggingEnabled = true,
            PrintDebugArtifactsDir = _directory,
            PrintDebugArtifactRetentionCount = 10
        };
        var pdfBytes = new byte[] { 1, 2, 3, 4 };
        var body = "{\"printerName\":\"Test\",\"apiKey\":\"secret\",\"pdfBase64\":\"" + Convert.ToBase64String(pdfBytes) + "\"}";

        using var service = new PrintDebugLogService(config);
        service.BeginPrintRequest("job-1", "print", body, pdfBytes);
        service.WriteSubmitResult("job-1", PrinterResult.Ok("job-1", new { status = "submitted" }));
        service.AppendEngineLog("job-1", LogLevel.Info, "engine detail");

        var artifactDir = Path.GetDirectoryName(Directory.GetFiles(_directory, "manifest.json", SearchOption.AllDirectories).Single())!;
        Assert.True(File.Exists(Path.Combine(artifactDir, "input.pdf")));
        Assert.True(File.Exists(Path.Combine(artifactDir, "submit-result.json")));
        Assert.Contains("engine detail", File.ReadAllText(Path.Combine(artifactDir, "engine.log")));

        var requestJson = File.ReadAllText(Path.Combine(artifactDir, "request.json"));
        Assert.Contains("***", requestJson);
        Assert.DoesNotContain("secret", requestJson);
        Assert.Contains("sha256", requestJson);
    }

    [Fact]
    public void BeginPrintRequest_KeepsInProgressArtifactsDuringCleanup()
    {
        var config = new HostConfig
        {
            PrintDebugLoggingEnabled = true,
            PrintDebugArtifactsDir = _directory,
            PrintDebugArtifactRetentionCount = 1
        };

        using var service = new PrintDebugLogService(config);
        service.BeginPrintRequest("job-1", "print", "{\"printerName\":\"A\"}", null);
        service.BeginPrintRequest("job-2", "print", "{\"printerName\":\"B\"}", null);

        Assert.Equal(2, Directory.GetFiles(_directory, "manifest.json", SearchOption.AllDirectories).Length);
    }

    [Fact]
    public void BeginPrintRequest_RemovesCompletedArtifactsBeyondRetention()
    {
        var config = new HostConfig
        {
            PrintDebugLoggingEnabled = true,
            PrintDebugArtifactsDir = _directory,
            PrintDebugArtifactRetentionCount = 1
        };

        using var service = new PrintDebugLogService(config);
        service.BeginPrintRequest("job-1", "print", "{\"printerName\":\"A\"}", null);
        service.WriteCompletionResult("job-1", new PrintRequestParams { PrinterName = "A" }, PrinterResult.Ok("job-1", PrintResult.Success("job-1")));
        service.BeginPrintRequest("job-2", "print", "{\"printerName\":\"B\"}", null);

        var manifests = Directory.GetFiles(_directory, "manifest.json", SearchOption.AllDirectories);
        Assert.Single(manifests);
        Assert.Contains("job-2", File.ReadAllText(manifests[0]));
    }
}