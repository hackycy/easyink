using System;
using System.Collections.Generic;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services;
using EasyInk.Engine.Services.Abstractions;
using Moq;
using Newtonsoft.Json;
using Xunit;

namespace EasyInk.Engine.Tests;

public class PrintTestServiceTests
{
    private static (PrintTestService service, Mock<IPrinterService> printerMock, Mock<IPrintService> printMock) CreateService()
    {
        var printerMock = new Mock<IPrinterService>();
        printerMock.Setup(s => s.GetPrinters()).Returns(new List<PrinterInfo>
        {
            new PrinterInfo { Name = "PrinterA" },
            new PrinterInfo { Name = "PrinterB" }
        });
        printerMock.Setup(s => s.GetPrinterStatus(It.IsAny<string>()))
            .Returns(new PrinterStatus { IsReady = true, Message = "Ready", StatusCode = "OK" });
        printerMock.Setup(s => s.GetPaperKind(It.IsAny<string>(), It.IsAny<double>()))
            .Returns((int?)null);

        var printMock = new Mock<IPrintService>();
        printMock.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(PrinterResult.Ok("test", PrintResult.Success("test")));

        var service = new PrintTestService(printerMock.Object, printMock.Object);
        return (service, printerMock, printMock);
    }

    [Fact]
    public void TestConnectivity_PrinterReady_ReturnsSuccess()
    {
        var (service, _, _) = CreateService();
        var result = service.TestConnectivity("PrinterA");
        Assert.True(result.Success);
        Assert.Equal("PrinterA", result.PrinterName);
        Assert.True(result.PrinterStatusReady);
        Assert.Equal(PrinterTestLevel.Connectivity, result.Level);
    }

    [Fact]
    public void TestConnectivity_PrinterNotReady_ReturnsFail()
    {
        var (service, printerMock, _) = CreateService();
        printerMock.Setup(s => s.GetPrinterStatus("PrinterA"))
            .Returns(new PrinterStatus { IsReady = false, Message = "Offline", StatusCode = "OFFLINE" });

        var result = service.TestConnectivity("PrinterA");
        Assert.False(result.Success);
        Assert.Contains("Offline", result.ErrorMessage);
    }

    [Fact]
    public void TestConnectivity_EmptyName_ReturnsFail()
    {
        var (service, _, _) = CreateService();
        var result = service.TestConnectivity("");
        Assert.False(result.Success);
    }

    [Fact]
    public void TestPrint_Quick_PrintsSuccessfully()
    {
        var (service, _, printMock) = CreateService();
        var result = service.TestPrint("req-1", "PrinterA", PrinterTestLevel.Quick);
        Assert.True(result.Success);
        Assert.Equal(PrinterTestLevel.Quick, result.Level);
        printMock.Verify(s => s.Print(
            "req-1",
            It.Is<PrintRequestParams>(p => p.PrinterName == "PrinterA" && p.PdfBytes != null && p.PdfBytes.Length > 0),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void TestPrint_Full_PrintsSuccessfully()
    {
        var (service, _, printMock) = CreateService();
        var result = service.TestPrint("req-2", "PrinterA", PrinterTestLevel.Full);
        Assert.True(result.Success);
        Assert.Equal(PrinterTestLevel.Full, result.Level);
        printMock.Verify(s => s.Print(
            "req-2",
            It.Is<PrintRequestParams>(p => p.PdfBytes != null && p.PdfBytes.Length > 0),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void TestPrint_PrinterNotReady_ReturnsFail()
    {
        var (service, printerMock, printMock) = CreateService();
        printerMock.Setup(s => s.GetPrinterStatus("PrinterA"))
            .Returns(new PrinterStatus { IsReady = false, Message = "Paper Jam", StatusCode = "PAPER_JAM" });

        var result = service.TestPrint("req-3", "PrinterA", PrinterTestLevel.Quick);
        Assert.False(result.Success);
        Assert.Contains("Paper Jam", result.ErrorMessage);
        printMock.Verify(s => s.Print(
            It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public void TestPrint_PrintFails_ReturnsFailWithError()
    {
        var (service, _, printMock) = CreateService();
        printMock.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(PrinterResult.Error("test", ErrorCode.PrintFailed, "Spooler error"));

        var result = service.TestPrint("req-4", "PrinterA", PrinterTestLevel.Quick);
        Assert.False(result.Success);
        Assert.Contains("Spooler error", result.ErrorMessage);
    }

    [Fact]
    public void TestPrint_Connectivity_DelegatesToTestConnectivity()
    {
        var (service, _, printMock) = CreateService();
        var result = service.TestPrint("req-5", "PrinterA", PrinterTestLevel.Connectivity);
        Assert.True(result.Success);
        Assert.Equal(PrinterTestLevel.Connectivity, result.Level);
        printMock.Verify(s => s.Print(
            It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()), Times.Never);
    }

}

public class EngineApiPrintTestTests
{
    private static EngineApi CreateApi(Mock<IPrinterService>? printerService = null, Mock<IPrintService>? printService = null)
    {
        printerService ??= new Mock<IPrinterService>();
        printerService.Setup(s => s.GetPrinterStatus(It.IsAny<string>()))
            .Returns(new PrinterStatus { IsReady = true, Message = "Ready", StatusCode = "OK" });
        printerService.Setup(s => s.GetPaperKind(It.IsAny<string>(), It.IsAny<double>()))
            .Returns((int?)null);

        printService ??= new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(PrinterResult.Ok("test", PrintResult.Success("test")));

        return new EngineApi(printerService.Object, printService.Object);
    }

    [Fact]
    public void TestPrinter_MissingPrinterName_ReturnsError()
    {
        using var api = CreateApi();
        var result = api.TestPrinter("req-1", "", PrinterTestLevel.Quick);
        Assert.False(result.Success);
        Assert.Equal(ErrorCode.InvalidParams, result.ErrorInfo!.Code);
    }

    [Fact]
    public void TestPrinter_ValidPrinter_ReturnsSuccess()
    {
        using var api = CreateApi();
        var result = api.TestPrinter("req-1", "TestPrinter", PrinterTestLevel.Quick);
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
    }

    [Fact]
    public void HandleCommand_TestPrinter_MissingPrinterName_ReturnsError()
    {
        using var api = CreateApi();
        var cmd = JsonConvert.SerializeObject(new PrinterCommand
        {
            Command = "testPrinter",
            Id = "test-1",
            Params = new Dictionary<string, object> { ["level"] = "quick" }
        }, JsonConfig.CamelCase);
        var result = api.HandleCommand(cmd);
        Assert.False(result.Success);
        Assert.Equal(ErrorCode.InvalidParams, result.ErrorInfo!.Code);
    }

    [Fact]
    public void HandleCommand_TestPrinter_ValidParams_ReturnsSuccess()
    {
        using var api = CreateApi();
        var cmd = JsonConvert.SerializeObject(new PrinterCommand
        {
            Command = "testPrinter",
            Id = "test-1",
            Params = new Dictionary<string, object>
            {
                ["printerName"] = "TestPrinter",
                ["level"] = "full"
            }
        }, JsonConfig.CamelCase);
        var result = api.HandleCommand(cmd);
        Assert.True(result.Success);
    }
}
