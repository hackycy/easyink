using System;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;

namespace EasyInk.Engine.Services;

internal static class PrintPipeline
{
    internal static PrinterResult ExecutePdfPrint(
        string requestId,
        PrintRequestParams request,
        IPrinterService printerService,
        ILogger logger,
        Func<byte[], CancellationToken, PrinterResult> printCore,
        PrintPipelineMessages messages,
        CancellationToken cancellationToken = default)
    {
        if (cancellationToken.IsCancellationRequested)
            return Canceled(requestId);

        var status = printerService.GetPrinterStatus(request.PrinterName);
        if (!status.IsReady)
            return PrinterResult.Error(requestId, status.StatusCode, status.Message);

        byte[] pdfBytes;
        try
        {
            var provider = request.CreatePdfProvider();
            pdfBytes = provider.GetPdfBytes();
        }
        catch (Exception ex)
        {
            return PrinterResult.Error(requestId, ErrorCode.InvalidPdfSource, ex.Message);
        }

        if (pdfBytes == null || pdfBytes.Length == 0)
            return PrinterResult.Error(requestId, ErrorCode.InvalidPdfSource, "PDF 内容为空");

        try
        {
            var result = printCore(pdfBytes, cancellationToken);
            if (result.Success)
                logger.Log(LogLevel.Info, $"{messages.SuccessLogLabel}: {request.PrinterName}, jobId={requestId}", requestId);
            return result;
        }
        catch (OperationCanceledException)
        {
            logger.Log(LogLevel.Info, $"{messages.CanceledLogLabel}: {request.PrinterName}, jobId={requestId}", requestId);
            return Canceled(requestId);
        }
        catch (Exception ex)
        {
            logger.Log(LogLevel.Error, $"{messages.ExceptionLogLabel}: {request.PrinterName}, jobId={requestId}, {ex}", requestId);
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, messages.ExceptionFailureMessage);
        }
    }

    private static PrinterResult Canceled(string requestId)
    {
        return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印已取消");
    }
}

internal sealed class PrintPipelineMessages
{
    public PrintPipelineMessages(string successLogLabel, string canceledLogLabel, string exceptionLogLabel,
        string exceptionFailureMessage)
    {
        SuccessLogLabel = successLogLabel;
        CanceledLogLabel = canceledLogLabel;
        ExceptionLogLabel = exceptionLogLabel;
        ExceptionFailureMessage = exceptionFailureMessage;
    }

    public string SuccessLogLabel { get; }

    public string CanceledLogLabel { get; }

    public string ExceptionLogLabel { get; }

    public string ExceptionFailureMessage { get; }
}