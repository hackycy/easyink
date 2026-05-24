using System;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services;
using EasyInk.Engine.Services.Abstractions;
using Moq;
using Xunit;

namespace EasyInk.Engine.Tests;

public class RenderAwarePrintServiceTests
{
    [Fact]
    public void Print_WithoutRenderInput_DelegatesDirectly()
    {
        var inner = new Mock<IPrintService>();
        var render = new Mock<IRenderPdfService>();
        inner.Setup(s => s.Print("req-1", It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(PrinterResult.Ok("req-1"));
        var service = new RenderAwarePrintService(inner.Object, render.Object);

        var request = new PrintRequestParams
        {
            PrinterName = "Printer",
            PdfBase64 = Convert.ToBase64String(new byte[] { 1, 2, 3 })
        };

        var result = service.Print("req-1", request);

        Assert.True(result.Success);
        render.Verify(s => s.RenderPrintPdf(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()), Times.Never);
        inner.Verify(s => s.Print("req-1", request, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void Print_WithRenderInput_RendersPdfBeforeDelegating()
    {
        var pdf = new byte[] { 37, 80, 68, 70 };
        var inner = new Mock<IPrintService>();
        var render = new Mock<IRenderPdfService>();
        render.Setup(s => s.RenderPrintPdf("req-2", It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(RenderPdfResult.Ok(pdf, "diag-1", 1));
        inner.Setup(s => s.Print("req-2", It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(PrinterResult.Ok("req-2"));
        var service = new RenderAwarePrintService(inner.Object, render.Object);

        var request = new PrintRequestParams
        {
            PrinterName = "Printer",
            RenderSource = new RenderSourceParams { Type = "html", Html = "<main class=\"easyink-ready\">ok</main>" }
        };

        var result = service.Print("req-2", request);

        Assert.True(result.Success);
        Assert.Same(pdf, request.PdfBytes);
        inner.Verify(s => s.Print("req-2", It.Is<PrintRequestParams>(p => p.PdfBytes == pdf), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void Print_WithPdfAndRenderInput_ReturnsInvalidParams()
    {
        var service = new RenderAwarePrintService(Mock.Of<IPrintService>(), Mock.Of<IRenderPdfService>());
        var request = new PrintRequestParams
        {
            PrinterName = "Printer",
            PdfBase64 = Convert.ToBase64String(new byte[] { 1 }),
            RenderSource = new RenderSourceParams { Type = "html", Html = "<html></html>" }
        };

        var result = service.Print("req-3", request);

        Assert.False(result.Success);
        Assert.Equal(ErrorCode.InvalidParams, result.ErrorInfo!.Code);
    }

    [Fact]
    public void Print_WhenRenderFails_ReturnsMappedError()
    {
        var render = new Mock<IRenderPdfService>();
        render.Setup(s => s.RenderPrintPdf("req-4", It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(RenderPdfResult.Error(ErrorCode.PrintTimeout, "timeout"));
        var service = new RenderAwarePrintService(Mock.Of<IPrintService>(), render.Object);

        var result = service.Print("req-4", new PrintRequestParams
        {
            PrinterName = "Printer",
            RenderSource = new RenderSourceParams { Type = "html", Html = "<html></html>" }
        });

        Assert.False(result.Success);
        Assert.Equal(ErrorCode.PrintTimeout, result.ErrorInfo!.Code);
    }
}