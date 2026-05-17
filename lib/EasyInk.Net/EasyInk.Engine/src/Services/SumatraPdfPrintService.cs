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
        if (cancellationToken.IsCancellationRequested)
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印已取消");

        if (!File.Exists(_sumatraExePath))
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, $"SumatraPDF 不存在: {_sumatraExePath}");

        var status = _printerService.GetPrinterStatus(request.PrinterName);
        if (!status.IsReady)
            return PrinterResult.Error(requestId, status.StatusCode, status.Message);

        IPdfProvider provider;
        try
        {
            provider = request.CreatePdfProvider();
        }
        catch (Exception ex)
        {
            return PrinterResult.Error(requestId, ErrorCode.InvalidPdfSource, ex.Message);
        }

        var pdfBytes = provider.GetPdfBytes();
        if (pdfBytes == null || pdfBytes.Length == 0)
            return PrinterResult.Error(requestId, ErrorCode.InvalidPdfSource, "PDF 内容为空");

        var tempFile = "";
        try
        {
            Directory.CreateDirectory(_tempDirectory);
            CleanupStaleTempFiles(_tempDirectory, _logger);

            tempFile = Path.Combine(_tempDirectory, $"easyink-{Guid.NewGuid():N}.pdf");
            File.WriteAllBytes(tempFile, pdfBytes);
            var args = BuildArguments(request.PrinterName, tempFile);

            _logger.Log(LogLevel.Info,
                $"SumatraPDF 打印开始: printer={request.PrinterName}, jobId={requestId}, settings={_printSettings}");

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
                    $"SumatraPDF 打印失败: printer={request.PrinterName}, jobId={requestId}, exitCode={process.ExitCode}");
                return PrinterResult.Error(requestId, ErrorCode.PrintFailed, $"SumatraPDF 打印失败，退出码 {process.ExitCode}");
            }

            _logger.Log(LogLevel.Info, $"SumatraPDF 打印成功: {request.PrinterName}, jobId={requestId}");
            return PrinterResult.Ok(requestId, PrintResult.Success(requestId));
        }
        catch (OperationCanceledException)
        {
            _logger.Log(LogLevel.Info, $"SumatraPDF 打印已取消: {request.PrinterName}, jobId={requestId}");
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印已取消");
        }
        catch (Exception ex)
        {
            _logger.Log(LogLevel.Error, $"SumatraPDF 打印异常: {request.PrinterName}, jobId={requestId}, {ex}");
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "SumatraPDF 打印失败，请检查配置后重试");
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
        return "\"" + value.Replace("\"", "\\\"") + "\"";
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
