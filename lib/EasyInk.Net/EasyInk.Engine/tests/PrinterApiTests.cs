using System;
using System.Collections.Generic;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;
using Moq;
using Newtonsoft.Json;
using Xunit;

namespace EasyInk.Engine.Tests;

public class PrinterApiTests
{
    private static EngineApi CreateApi(
        Mock<IPrinterService>? printerService = null,
        Mock<IPrintService>? printService = null)
    {
        printerService ??= new Mock<IPrinterService>();
        printService ??= new Mock<IPrintService>();

        return new EngineApi(
            printerService.Object,
            printService.Object);
    }

    private static string MakeCommand(string command, string id = "test-1", Dictionary<string, object>? parms = null)
    {
        return JsonConvert.SerializeObject(new PrinterCommand
        {
            Command = command,
            Id = id,
            Params = parms
        }, JsonConfig.CamelCase);
    }

    [Fact]
    public void HandleCommand_InvalidJson_ReturnsError()
    {
        using var api = CreateApi();
        var result = api.HandleCommand("not json");
        Assert.False(result.Success);
        Assert.Equal(ErrorCode.InvalidJson, result.ErrorInfo!.Code);
    }

    [Fact]
    public void HandleCommand_UnknownCommand_ReturnsError()
    {
        using var api = CreateApi();
        var result = api.HandleCommand(MakeCommand("noSuchCommand"));
        Assert.False(result.Success);
        Assert.Equal(ErrorCode.UnknownCommand, result.ErrorInfo!.Code);
    }

    [Fact]
    public void HandleCommand_GetPrinters_ReturnsList()
    {
        var printerService = new Mock<IPrinterService>();
        printerService.Setup(s => s.GetPrinters()).Returns(new List<PrinterInfo>
        {
            new PrinterInfo { Name = "Test Printer", IsDefault = true }
        });

        using var api = CreateApi(printerService: printerService);
        var result = api.HandleCommand(MakeCommand("getPrinters"));
        Assert.True(result.Success);
        var data = (result.Data as List<PrinterInfo>)!;
        Assert.Single(data);
        Assert.Equal("Test Printer", data[0].Name);
    }

    [Fact]
    public void HandleCommand_GetPrinterStatus_MissingParam_ReturnsError()
    {
        using var api = CreateApi();
        var result = api.HandleCommand(MakeCommand("getPrinterStatus"));
        Assert.False(result.Success);
        Assert.Equal(ErrorCode.InvalidParams, result.ErrorInfo!.Code);
    }

    [Fact]
    public void HandleCommand_Print_MissingParams_ReturnsError()
    {
        using var api = CreateApi();
        var result = api.HandleCommand(MakeCommand("print"));
        Assert.False(result.Success);
        Assert.Equal(ErrorCode.InvalidParams, result.ErrorInfo!.Code);
    }

    [Fact]
    public void HandleCommand_PrintAsync_EnqueuesJob()
    {
        var printService = new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<System.Threading.CancellationToken>()))
            .Returns(PrinterResult.Ok("test", PrintResult.Success("job-1")));

        var parms = new Dictionary<string, object>
        {
            ["printerName"] = "Test",
            ["pdfBase64"] = Convert.ToBase64String(new byte[] { 1, 2, 3 })
        };

        using var api = CreateApi(printService: printService);
        var result = api.HandleCommand(MakeCommand("printAsync", parms: parms));
        Assert.True(result.Success);
        // Data is an anonymous object { jobId, status }
    }

    [Fact]
    public void HandleCommand_GetJobStatus_NotFound_ReturnsError()
    {
        using var api = CreateApi();
        var result = api.HandleCommand(MakeCommand("getJobStatus", parms: new Dictionary<string, object> { ["jobId"] = "nonexistent" }));
        Assert.False(result.Success);
        Assert.Equal(ErrorCode.JobNotFound, result.ErrorInfo!.Code);
    }

    [Fact]
    public void HandleCommand_QueryLogs_NotSupported_ReturnsError()
    {
        using var api = CreateApi();
        var result = api.HandleCommand(MakeCommand("queryLogs"));
        Assert.False(result.Success);
        Assert.Equal(ErrorCode.UnknownCommand, result.ErrorInfo!.Code);
    }

    [Theory]
    [InlineData("batchPrint")]
    [InlineData("batchPrintAsync")]
    public void HandleCommand_BatchPrintCommands_ReturnUnknownCommand(string command)
    {
        using var api = CreateApi();
        var result = api.HandleCommand(MakeCommand(command));
        Assert.False(result.Success);
        Assert.Equal(ErrorCode.UnknownCommand, result.ErrorInfo!.Code);
    }

    [Fact]
    public void HandleCommand_Print_WithPdfUrl_Success()
    {
        var printService = new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<System.Threading.CancellationToken>()))
            .Returns(PrinterResult.Ok("test", PrintResult.Success("job-1")));

        using var api = CreateApi(printService: printService);
        var parms = new Dictionary<string, object>
        {
            ["printerName"] = "TestPrinter",
            ["pdfUrl"] = "http://example.com/test.pdf"
        };
        var result = api.HandleCommand(MakeCommand("print", parms: parms));
        Assert.True(result.Success);
    }

    [Fact]
    public void HandleCommand_Print_WithPdfBytes_Success()
    {
        var printService = new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<System.Threading.CancellationToken>()))
            .Returns(PrinterResult.Ok("test", PrintResult.Success("job-1")));

        using var api = CreateApi(printService: printService);
        var parms = new Dictionary<string, object>
        {
            ["printerName"] = "TestPrinter",
            ["pdfBytes"] = new byte[] { 1, 2, 3 }
        };
        var result = api.HandleCommand(MakeCommand("print", parms: parms));
        Assert.True(result.Success);
    }

    [Fact]
    public void Dispose_DisposesJobQueue()
    {
        var printerService = new Mock<IPrinterService>();
        var printService = new Mock<IPrintService>();

        var api = new EngineApi(
            printerService.Object,
            printService.Object);
        api.Dispose();
    }
}
