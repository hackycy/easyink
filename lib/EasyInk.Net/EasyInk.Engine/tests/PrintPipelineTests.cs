using System;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services;
using EasyInk.Engine.Services.Abstractions;
using Moq;
using Xunit;

namespace EasyInk.Engine.Tests;

public class PrintPipelineTests
{
    private static readonly PrintPipelineMessages Messages = new(
        "success",
        "canceled",
        "failure",
        "print failed");

    [Fact]
    public void ExecutePdfPrint_WhenAlreadyCanceled_ReturnsCanceledWithoutCheckingPrinter()
    {
        var printerService = new Mock<IPrinterService>(MockBehavior.Strict);
        var logger = new Mock<ILogger>(MockBehavior.Strict);
        using var cancellationSource = new CancellationTokenSource();
        cancellationSource.Cancel();

        var result = PrintPipeline.ExecutePdfPrint(
            "req-1",
            CreateRequest(),
            printerService.Object,
            logger.Object,
            (_, _) => throw new InvalidOperationException("should not execute"),
            Messages,
            cancellationSource.Token);

        Assert.False(result.Success);
        Assert.Equal(ErrorCode.PrintFailed, result.ErrorInfo!.Code);
        Assert.Equal("打印已取消", result.ErrorInfo.Message);
    }

    [Fact]
    public void ExecutePdfPrint_WhenPrinterNotReady_ReturnsPrinterStatusError()
    {
        var printerService = new Mock<IPrinterService>();
        var logger = new Mock<ILogger>(MockBehavior.Strict);
        printerService.Setup(service => service.GetPrinterStatus("TestPrinter"))
            .Returns(new PrinterStatus
            {
                IsReady = false,
                StatusCode = PrinterStatusCode.PrinterOffline,
                Message = "offline"
            });

        var result = PrintPipeline.ExecutePdfPrint(
            "req-1",
            CreateRequest(),
            printerService.Object,
            logger.Object,
            (_, _) => throw new InvalidOperationException("should not execute"),
            Messages);

        Assert.False(result.Success);
        Assert.Equal(PrinterStatusCode.PrinterOffline, result.ErrorInfo!.Code);
        Assert.Equal("offline", result.ErrorInfo.Message);
    }

    [Fact]
    public void ExecutePdfPrint_WhenPdfSourceInvalid_ReturnsInvalidPdfSource()
    {
        var printerService = new Mock<IPrinterService>();
        var logger = new Mock<ILogger>(MockBehavior.Strict);
        printerService.Setup(service => service.GetPrinterStatus("TestPrinter"))
            .Returns(ReadyStatus());

        var result = PrintPipeline.ExecutePdfPrint(
            "req-1",
            new PrintRequestParams { PrinterName = "TestPrinter" },
            printerService.Object,
            logger.Object,
            (_, _) => throw new InvalidOperationException("should not execute"),
            Messages);

        Assert.False(result.Success);
        Assert.Equal(ErrorCode.InvalidPdfSource, result.ErrorInfo!.Code);
    }

    [Fact]
    public void ExecutePdfPrint_WhenProviderThrows_ReturnsInvalidPdfSource()
    {
        var printerService = new Mock<IPrinterService>();
        var logger = new Mock<ILogger>(MockBehavior.Strict);
        printerService.Setup(service => service.GetPrinterStatus("TestPrinter"))
            .Returns(ReadyStatus());

        var result = PrintPipeline.ExecutePdfPrint(
            "req-1",
            new PrintRequestParams
            {
                PrinterName = "TestPrinter",
                PdfBase64 = "not-valid-base64"
            },
            printerService.Object,
            logger.Object,
            (_, _) => throw new InvalidOperationException("should not execute"),
            Messages);

        Assert.False(result.Success);
        Assert.Equal(ErrorCode.InvalidPdfSource, result.ErrorInfo!.Code);
    }

    [Fact]
    public void ExecutePdfPrint_WhenCoreSucceeds_ReturnsSuccessAndLogsSuccess()
    {
        var printerService = new Mock<IPrinterService>();
        var logger = new Mock<ILogger>();
        printerService.Setup(service => service.GetPrinterStatus("TestPrinter"))
            .Returns(ReadyStatus());

        var result = PrintPipeline.ExecutePdfPrint(
            "req-1",
            CreateRequest(),
            printerService.Object,
            logger.Object,
            (pdfBytes, cancellationToken) =>
            {
                Assert.Equal(new byte[] { 1, 2, 3 }, pdfBytes);
                Assert.False(cancellationToken.IsCancellationRequested);
                return PrinterResult.Ok("req-1", PrintResult.Success("req-1"));
            },
            Messages);

        Assert.True(result.Success);
        logger.Verify(log => log.Log(LogLevel.Info, "success: TestPrinter, jobId=req-1", "req-1"), Times.Once);
    }

    [Fact]
    public void ExecutePdfPrint_WhenCoreThrowsOperationCanceled_ReturnsCanceledAndLogsInfo()
    {
        var printerService = new Mock<IPrinterService>();
        var logger = new Mock<ILogger>();
        printerService.Setup(service => service.GetPrinterStatus("TestPrinter"))
            .Returns(ReadyStatus());

        var result = PrintPipeline.ExecutePdfPrint(
            "req-1",
            CreateRequest(),
            printerService.Object,
            logger.Object,
            (_, _) => throw new OperationCanceledException(),
            Messages);

        Assert.False(result.Success);
        Assert.Equal(ErrorCode.PrintFailed, result.ErrorInfo!.Code);
        Assert.Equal("打印已取消", result.ErrorInfo.Message);
        logger.Verify(log => log.Log(LogLevel.Info, "canceled: TestPrinter, jobId=req-1", "req-1"), Times.Once);
    }

    [Fact]
    public void ExecutePdfPrint_WhenCoreThrowsException_ReturnsPrintFailedAndLogsError()
    {
        var printerService = new Mock<IPrinterService>();
        var logger = new Mock<ILogger>();
        printerService.Setup(service => service.GetPrinterStatus("TestPrinter"))
            .Returns(ReadyStatus());

        var result = PrintPipeline.ExecutePdfPrint(
            "req-1",
            CreateRequest(),
            printerService.Object,
            logger.Object,
            (_, _) => throw new InvalidOperationException("boom"),
            Messages);

        Assert.False(result.Success);
        Assert.Equal(ErrorCode.PrintFailed, result.ErrorInfo!.Code);
        Assert.Equal("print failed", result.ErrorInfo.Message);
        logger.Verify(log => log.Log(
            LogLevel.Error,
            It.Is<string>(message => message.StartsWith("failure: TestPrinter, jobId=req-1, System.InvalidOperationException: boom")),
            "req-1"), Times.Once);
    }

    private static PrintRequestParams CreateRequest()
    {
        return new PrintRequestParams
        {
            PrinterName = "TestPrinter",
            PdfBytes = new byte[] { 1, 2, 3 }
        };
    }

    private static PrinterStatus ReadyStatus()
    {
        return new PrinterStatus
        {
            IsReady = true,
            StatusCode = PrinterStatusCode.Ready,
            Message = "ready"
        };
    }
}