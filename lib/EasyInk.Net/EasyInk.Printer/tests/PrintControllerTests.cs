using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;
using EasyInk.Printer.Api;
using Moq;
using Xunit;

namespace EasyInk.Printer.Tests;

public class PrintControllerTests
{
    private static PrintController CreateController(
        Mock<IPrinterService>? printerService = null,
        Mock<IPrintService>? printService = null)
    {
        printerService ??= new Mock<IPrinterService>();
        printService ??= new Mock<IPrintService>();

        var api = new EngineApi(printerService.Object, printService.Object);
        return new PrintController(api);
    }

    [Fact]
    public void Print_WithJsonBody_CallsEngineApi()
    {
        var printService = new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<System.Threading.CancellationToken>()))
            .Returns(PrinterResult.Ok("test", PrintResult.Success("job-1")));

        var controller = CreateController(printService: printService);
        var body = @"{""printerName"":""TestPrinter"",""pdfBase64"":""AQID""}";
        var result = controller.Print(body);

        Assert.True(result.Success);
    }

    [Fact]
    public void Print_WithPdfBytes_CallsEngineApi()
    {
        var printService = new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<System.Threading.CancellationToken>()))
            .Returns(PrinterResult.Ok("test", PrintResult.Success("job-1")));

        var controller = CreateController(printService: printService);
        var body = @"{""printerName"":""TestPrinter""}";
        var pdfBytes = new byte[] { 0x25, 0x50, 0x44, 0x46 }; // %PDF
        var result = controller.Print(body, pdfBytes);

        Assert.True(result.Success);
    }

    [Fact]
    public void Print_MissingParams_ReturnsError()
    {
        var controller = CreateController();
        var result = controller.Print("{}");

        Assert.False(result.Success);
    }

    [Fact]
    public void EnqueuePrint_EnqueuesJob()
    {
        var printService = new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<System.Threading.CancellationToken>()))
            .Returns(PrinterResult.Ok("test", PrintResult.Success("job-1")));

        var controller = CreateController(printService: printService);
        var body = @"{""printerName"":""TestPrinter"",""pdfBase64"":""AQID""}";
        var result = controller.EnqueuePrint(body);

        Assert.True(result.Success);
    }

}
