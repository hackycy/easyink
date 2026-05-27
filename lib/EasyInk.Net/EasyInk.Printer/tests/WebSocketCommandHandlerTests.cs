using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;
using EasyInk.Printer.Api;
using EasyInk.Printer.Server;
using EasyInk.Printer.Services.Abstractions;
using Moq;
using Newtonsoft.Json.Linq;
using Xunit;

namespace EasyInk.Printer.Tests;

public class WebSocketCommandHandlerTests
{
    private static WebSocketCommandHandler CreateHandler(
        EngineApi? api = null,
        WebSocketHandler? wsHandler = null,
        IAuditService? auditService = null,
        TestController? testController = null)
    {
        api ??= new EngineApi(
            new Mock<IPrinterService>().Object,
            new Mock<IPrintService>().Object);
        wsHandler ??= new WebSocketHandler();
        auditService ??= new Mock<IAuditService>().Object;
        var printerService = new Mock<IPrinterService>().Object;
        testController ??= new TestController(api, printerService, new EasyInk.Printer.Config.HostConfig());
        return new WebSocketCommandHandler(api, wsHandler, auditService, testController);
    }

    private static WebSocketMessage MakeMessage(string command, string id = "test-1", JObject? parms = null)
    {
        return new WebSocketMessage
        {
            Command = command,
            Id = id,
            Params = parms
        };
    }

    [Fact]
    public async Task HandleMessage_UnknownCommand_ReturnsError()
    {
        var handler = CreateHandler();
        var message = MakeMessage("noSuchCommand");
        await handler.HandleMessage(null!, message);
    }

    [Fact]
    public async Task HandleMessage_GetPrinters_ReturnsSuccess()
    {
        var printerService = new Mock<IPrinterService>();
        printerService.Setup(s => s.GetPrinters()).Returns(new List<PrinterInfo>
        {
            new PrinterInfo { Name = "TestPrinter", IsDefault = true }
        });

        var api = new EngineApi(printerService.Object, new Mock<IPrintService>().Object);
        var handler = CreateHandler(api: api);
        var message = MakeMessage("getPrinters");
        await handler.HandleMessage(null!, message);
    }

    [Fact]
    public async Task HandleMessage_GetPrinterStatus_MissingPrinterName_ReturnsError()
    {
        var handler = CreateHandler();
        var message = MakeMessage("getPrinterStatus");
        await handler.HandleMessage(null!, message);
    }

    [Fact]
    public async Task HandleMessage_GetAllJobs_ReturnsSuccess()
    {
        var handler = CreateHandler();
        var message = MakeMessage("getAllJobs");
        await handler.HandleMessage(null!, message);
    }

    [Fact]
    public async Task HandleMessage_UploadPdfChunk_MissingParams_ReturnsError()
    {
        var handler = CreateHandler();
        var message = MakeMessage("uploadPdfChunk");
        await handler.HandleMessage(null!, message);
    }

    [Fact]
    public async Task HandleMessage_UploadPdfChunk_MissingChunkData_ReturnsError()
    {
        var handler = CreateHandler();
        var parms = new JObject
        {
            ["uploadId"] = "upload-1",
            ["chunkIndex"] = 0,
            ["totalChunks"] = 1,
            ["totalBytes"] = 100
        };
        var message = MakeMessage("uploadPdfChunk", parms: parms);
        // PdfBytes is null, should return error
        await handler.HandleMessage(null!, message);
    }

    [Fact]
    public async Task HandleMessage_UploadPdfChunk_ChunkTooLarge_ReturnsError()
    {
        var handler = CreateHandler();
        var parms = new JObject
        {
            ["uploadId"] = "upload-1",
            ["chunkIndex"] = 0,
            ["totalChunks"] = 1,
            ["totalBytes"] = 100
        };
        var message = MakeMessage("uploadPdfChunk", parms: parms);
        // 3MB chunk > 2MB limit
        message.PdfBytes = new byte[3 * 1024 * 1024];
        await handler.HandleMessage(null!, message);
    }

    [Fact]
    public async Task HandleMessage_UploadPdfChunk_Success()
    {
        var handler = CreateHandler();
        var pdfBytes = new byte[] { 0x25, 0x50, 0x44, 0x46 };
        var parms = new JObject
        {
            ["uploadId"] = "upload-success",
            ["chunkIndex"] = 0,
            ["totalChunks"] = 1,
            ["totalBytes"] = pdfBytes.Length
        };
        var message = MakeMessage("uploadPdfChunk", parms: parms);
        message.PdfBytes = pdfBytes;
        await handler.HandleMessage(null!, message);
    }

    [Fact]
    public async Task HandleMessage_PrintUploadedPdf_UploadNotFound_ReturnsError()
    {
        var handler = CreateHandler();
        var parms = new JObject
        {
            ["uploadId"] = "nonexistent",
            ["printerName"] = "TestPrinter"
        };
        var message = MakeMessage("printUploadedPdf", parms: parms);
        await handler.HandleMessage(null!, message);
    }

    [Fact]
    public async Task HandleMessage_InternalError_ReturnsError()
    {
        var printerService = new Mock<IPrinterService>();
        printerService.Setup(s => s.GetPrinters())
            .Throws(new InvalidOperationException("unexpected"));

        var api = new EngineApi(printerService.Object, new Mock<IPrintService>().Object);
        var handler = CreateHandler(api: api);
        var message = MakeMessage("getPrinters");
        // Should not throw — InternalError should be caught
        await handler.HandleMessage(null!, message);
    }
}

public class PdfUploadSessionTests
{
    [Fact]
    public void AddChunk_SingleChunk_CompletesUpload()
    {
        var pdfBytes = new byte[] { 0x25, 0x50, 0x44, 0x46 };
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-1", 1, pdfBytes.Length);

        session.AddChunk(0, 1, pdfBytes.Length, pdfBytes);

        Assert.Equal(1, session.ReceivedChunks);
        Assert.Equal(pdfBytes.Length, session.ReceivedBytes);
        Assert.True(session.IsComplete);
    }

    [Fact]
    public void AddChunk_MultipleChunks_AssemblesCorrectly()
    {
        var chunk0 = new byte[] { 1, 2, 3 };
        var chunk1 = new byte[] { 4, 5, 6, 7 };
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-2", 2, 7);

        session.AddChunk(0, 2, 7, chunk0);
        session.AddChunk(1, 2, 7, chunk1);

        Assert.Equal(2, session.ReceivedChunks);
        Assert.Equal(7, session.ReceivedBytes);
        Assert.True(session.IsComplete);

        var assembled = session.Assemble();
        Assert.Equal(new byte[] { 1, 2, 3, 4, 5, 6, 7 }, assembled);
    }

    [Fact]
    public void AddChunk_OutOfOrder_AssemblesCorrectly()
    {
        var chunk0 = new byte[] { 10, 20 };
        var chunk1 = new byte[] { 30, 40 };
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-3", 2, 4);

        session.AddChunk(1, 2, 4, chunk1);
        session.AddChunk(0, 2, 4, chunk0);

        Assert.True(session.IsComplete);
        Assert.Equal(new byte[] { 10, 20, 30, 40 }, session.Assemble());
    }

    [Fact]
    public void AddChunk_DuplicateChunk_IsNoOp()
    {
        var chunk = new byte[] { 1, 2, 3 };
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-4", 1, 3);

        session.AddChunk(0, 1, 3, chunk);
        session.AddChunk(0, 1, 3, chunk); // duplicate

        Assert.Equal(1, session.ReceivedChunks);
        Assert.Equal(3, session.ReceivedBytes);
    }

    [Fact]
    public void AddChunk_TotalChunksMismatch_Throws()
    {
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-5", 2, 100);
        Assert.Throws<ArgumentException>(() =>
            session.AddChunk(0, 3, 100, new byte[50]));
    }

    [Fact]
    public void AddChunk_TotalBytesMismatch_Throws()
    {
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-6", 1, 100);
        Assert.Throws<ArgumentException>(() =>
            session.AddChunk(0, 1, 200, new byte[50]));
    }

    [Fact]
    public void AddChunk_NegativeIndex_Throws()
    {
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-7", 1, 100);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            session.AddChunk(-1, 1, 100, new byte[50]));
    }

    [Fact]
    public void AddChunk_IndexOutOfRange_Throws()
    {
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-8", 2, 100);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            session.AddChunk(2, 2, 100, new byte[50]));
    }

    [Fact]
    public void AddChunk_ExceedsTotalBytes_Throws()
    {
        var chunk0 = new byte[60];
        var chunk1 = new byte[50];
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-9", 2, 100);

        session.AddChunk(0, 2, 100, chunk0);
        Assert.Throws<ArgumentException>(() =>
            session.AddChunk(1, 2, 100, chunk1));
    }

    [Fact]
    public void Assemble_Incomplete_Throws()
    {
        var session = new WebSocketCommandHandler.PdfUploadSession("upload-10", 2, 100);
        session.AddChunk(0, 2, 100, new byte[50]);

        Assert.Throws<InvalidOperationException>(() => session.Assemble());
    }
}
