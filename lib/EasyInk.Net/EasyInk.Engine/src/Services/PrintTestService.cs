using System;
using System.Diagnostics;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;

namespace EasyInk.Engine.Services;

/// <summary>
/// 打印测试服务实现
/// </summary>
public class PrintTestService : IPrintTestService
{
    private readonly IPrinterService _printerService;
    private readonly IPrintService _printService;
    private readonly ILogger _logger;

    public PrintTestService(IPrinterService printerService, IPrintService printService, ILogger? logger = null)
    {
        _printerService = printerService ?? throw new ArgumentNullException(nameof(printerService));
        _printService = printService ?? throw new ArgumentNullException(nameof(printService));
        _logger = logger ?? new NullLogger();
    }

    public PrinterTestResult TestConnectivity(string printerName)
    {
        if (string.IsNullOrEmpty(printerName))
            return PrinterTestResult.Fail(printerName ?? "", PrinterTestLevel.Connectivity, "缺少打印机名称");

        var printPath = ResolvePrintPath(printerName);
        var status = _printerService.GetPrinterStatus(printerName);

        var result = new PrinterTestResult
        {
            PrinterName = printerName,
            Level = PrinterTestLevel.Connectivity,
            Success = true,
            ResolvedPrintPath = printPath,
            PrinterStatusReady = status.IsReady,
            PrinterStatusDetail = status.Message,
            Timestamp = DateTime.UtcNow
        };

        if (!status.IsReady)
        {
            result.Success = false;
            result.ErrorMessage = $"打印机未就绪: {status.Message}";
        }

        return result;
    }

    public PrinterTestResult TestPrint(string requestId, string printerName, PrinterTestLevel level,
        TestPageMetadata? metadata = null, CancellationToken cancellationToken = default)
    {
        if (level == PrinterTestLevel.Connectivity)
            return TestConnectivity(printerName);

        if (string.IsNullOrEmpty(printerName))
            return PrinterTestResult.Fail(printerName ?? "", level, "缺少打印机名称");

        var printPath = ResolvePrintPath(printerName);
        var status = _printerService.GetPrinterStatus(printerName);
        var paperKind = _printerService.GetPaperKind(printerName, 210);
        var paperSizeText = paperKind.HasValue ? $"PaperKind={paperKind.Value}" : null;

        if (!status.IsReady)
        {
            return new PrinterTestResult
            {
                PrinterName = printerName,
                Level = level,
                Success = false,
                ErrorMessage = $"打印机未就绪: {status.Message}",
                ResolvedPrintPath = printPath,
                PrinterStatusReady = false,
                PrinterStatusDetail = status.Message,
                PaperSizeMatched = paperSizeText,
                Timestamp = DateTime.UtcNow
            };
        }

        byte[] testPdf;
        try
        {
            testPdf = level == PrinterTestLevel.Full
                ? TestPageGenerator.GenerateFull(printerName, printPath, status.IsReady, status.Message, paperSizeText, metadata)
                : TestPageGenerator.GenerateQuick(printerName, printPath, metadata);
        }
        catch (Exception ex)
        {
            _logger.Log(LogLevel.Error, $"测试页生成失败: {printerName}, {ex.Message}", requestId);
            return PrinterTestResult.Fail(printerName, level, $"测试页生成失败: {ex.Message}", printPath);
        }

        var sw = Stopwatch.StartNew();
        PrinterResult printResult;
        try
        {
            var printParams = new PrintRequestParams
            {
                PrinterName = printerName,
                PdfBytes = testPdf,
                Copies = 1
            };
            printResult = _printService.Print(requestId, printParams, cancellationToken);
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.Log(LogLevel.Error, $"测试打印异常: {printerName}, jobId={requestId}, {ex}", requestId);
            return new PrinterTestResult
            {
                PrinterName = printerName,
                Level = level,
                Success = false,
                ErrorMessage = $"打印异常: {ex.Message}",
                ResolvedPrintPath = printPath,
                PrinterStatusReady = status.IsReady,
                PrinterStatusDetail = status.Message,
                PaperSizeMatched = paperSizeText,
                Timestamp = DateTime.UtcNow
            };
        }
        sw.Stop();

        if (printResult.Success)
        {
            _logger.Log(LogLevel.Info, $"测试打印成功: {printerName}, path={printPath}, level={level},耗时={sw.ElapsedMilliseconds}ms, jobId={requestId}", requestId);
            return new PrinterTestResult
            {
                PrinterName = printerName,
                Level = level,
                Success = true,
                ResolvedPrintPath = printPath,
                PrinterStatusReady = status.IsReady,
                PrinterStatusDetail = status.Message,
                PaperSizeMatched = paperSizeText,
                Timestamp = DateTime.UtcNow
            };
        }

        _logger.Log(LogLevel.Error, $"测试打印失败: {printerName}, jobId={requestId}, error={printResult.ErrorInfo?.Message}", requestId);
        return new PrinterTestResult
        {
            PrinterName = printerName,
            Level = level,
            Success = false,
            ErrorMessage = printResult.ErrorInfo?.Message ?? "打印失败",
            ResolvedPrintPath = printPath,
            PrinterStatusReady = status.IsReady,
            PrinterStatusDetail = status.Message,
            PaperSizeMatched = paperSizeText,
            Timestamp = DateTime.UtcNow
        };
    }

    private string ResolvePrintPath(string printerName)
    {
        if (_printService is RoutingPrintService routing)
            return routing.GetPrintPathName(printerName);

        if (_printService is RenderAwarePrintService renderAware)
        {
            var inner = renderAware.GetInnerService();
            if (inner is RoutingPrintService innerRouting)
                return innerRouting.GetPrintPathName(printerName);
        }

        return "GDI (Pdfium)";
    }
}
