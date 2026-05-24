using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;

namespace EasyInk.Engine.Services;

/// <summary>
/// Uses SumatraPDF command-line printing as a compatibility fallback for drivers
/// that behave better with an external PDF print pipeline than with GDI bitmaps.
/// </summary>
public class SumatraPdfPrintService : IPrintService
{
    private const int DefaultTimeoutMs = 60_000;
    private static readonly TimeSpan StaleTempFileAge = TimeSpan.FromDays(1);
    private static readonly PrintPipelineMessages PipelineMessages = new(
        "SumatraPDF 打印成功",
        "SumatraPDF 打印已取消",
        "SumatraPDF 打印异常",
        "SumatraPDF 打印失败，请检查配置后重试");

    private readonly IPrinterService _printerService;
    private readonly string _sumatraExePath;
    private readonly string _printSettings;
    private readonly int _timeoutMs;
    private readonly ILogger _logger;
    private readonly string _tempDirectory;

    public SumatraPdfPrintService(
        IPrinterService printerService,
        string sumatraExePath,
        string? printSettings = null,
        int timeoutMs = DefaultTimeoutMs,
        ILogger? logger = null,
        string? tempDirectory = null)
    {
        _printerService = printerService ?? throw new ArgumentNullException(nameof(printerService));
        _sumatraExePath = string.IsNullOrWhiteSpace(sumatraExePath)
            ? throw new ArgumentException("SumatraPDF 路径不能为空", nameof(sumatraExePath))
            : sumatraExePath.Trim();
        _printSettings = string.IsNullOrWhiteSpace(printSettings) ? "fit" : printSettings.Trim();
        _timeoutMs = timeoutMs > 0 ? timeoutMs : DefaultTimeoutMs;
        _logger = logger ?? new NullLogger();
        _tempDirectory = string.IsNullOrWhiteSpace(tempDirectory)
            ? Path.GetTempPath()
            : tempDirectory.Trim();
    }

    public PrinterResult Print(string requestId, PrintRequestParams request, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_sumatraExePath))
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, $"SumatraPDF 不存在: {_sumatraExePath}");

        return PrintPipeline.ExecutePdfPrint(
            requestId,
            request,
            _printerService,
            _logger,
            (pdfBytes, token) => PrintWithSumatra(requestId, request, pdfBytes, token),
            PipelineMessages,
            cancellationToken);
    }

    private PrinterResult PrintWithSumatra(string requestId, PrintRequestParams request, byte[] pdfBytes,
        CancellationToken cancellationToken)
    {
        var tempFile = "";
        try
        {
            Directory.CreateDirectory(_tempDirectory);
            CleanupStaleTempFiles(_tempDirectory, _logger);

            tempFile = Path.Combine(_tempDirectory, $"easyink-{Guid.NewGuid():N}.pdf");
            File.WriteAllBytes(tempFile, pdfBytes);
            var args = BuildArguments(request.PrinterName, tempFile);

            _logger.Log(LogLevel.Info,
                $"SumatraPDF 打印开始: printer={request.PrinterName}, jobId={requestId}, settings={_printSettings}",
                requestId);

            using var process = new Process();
            process.StartInfo = new ProcessStartInfo
            {
                FileName = _sumatraExePath,
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            process.Start();
            if (!WaitForExit(process, _timeoutMs, cancellationToken))
            {
                TryKill(process);
                return cancellationToken.IsCancellationRequested
                    ? PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印已取消")
                    : PrinterResult.Error(requestId, ErrorCode.PrintTimeout, "SumatraPDF 打印超时");
            }

            if (process.ExitCode != 0)
            {
                _logger.Log(LogLevel.Error,
                    $"SumatraPDF 打印失败: printer={request.PrinterName}, jobId={requestId}, exitCode={process.ExitCode}",
                    requestId);
                return PrinterResult.Error(requestId, ErrorCode.PrintFailed, $"SumatraPDF 打印失败，退出码 {process.ExitCode}");
            }

            return PrinterResult.Ok(requestId, PrintResult.Success(requestId));
        }
        finally
        {
            TryDelete(tempFile);
        }
    }

    private string BuildArguments(string printerName, string pdfPath)
    {
        var args = new StringBuilder();
        args.Append("-silent -exit-on-print ");
        args.Append("-print-to ").Append(Quote(printerName)).Append(' ');
        args.Append("-print-settings ").Append(Quote(_printSettings)).Append(' ');
        args.Append(Quote(pdfPath));
        return args.ToString();
    }

    private static bool WaitForExit(Process process, int timeoutMs, CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (!process.HasExited)
        {
            if (cancellationToken.IsCancellationRequested || DateTime.UtcNow >= deadline)
                return false;
            process.WaitForExit(250);
        }

        return true;
    }

    private static string Quote(string value)
    {
        var escaped = new StringBuilder(value.Length + 2);
        escaped.Append('"');

        var backslashCount = 0;
        foreach (var ch in value)
        {
            if (ch == '\\')
            {
                backslashCount++;
                continue;
            }

            if (ch == '"')
            {
                escaped.Append('\\', backslashCount * 2 + 1);
                escaped.Append(ch);
                backslashCount = 0;
                continue;
            }

            if (backslashCount > 0)
            {
                escaped.Append('\\', backslashCount);
                backslashCount = 0;
            }

            escaped.Append(ch);
        }

        if (backslashCount > 0)
            escaped.Append('\\', backslashCount * 2);

        escaped.Append('"');
        return escaped.ToString();
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
                process.Kill();
        }
        catch
        {
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
        }
    }

    private static void CleanupStaleTempFiles(string directory, ILogger logger)
    {
        try
        {
            if (!Directory.Exists(directory))
                return;

            var cutoff = DateTime.UtcNow.Subtract(StaleTempFileAge);
            foreach (var path in Directory.GetFiles(directory, "easyink-*.pdf"))
            {
                try
                {
                    if (File.GetLastWriteTimeUtc(path) < cutoff)
                        File.Delete(path);
                }
                catch (Exception ex)
                {
                    logger.Log(LogLevel.Error, $"SumatraPDF 临时文件清理失败: {path}, {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            logger.Log(LogLevel.Error, $"SumatraPDF 临时目录清理失败: {directory}, {ex.Message}");
        }
    }
}
