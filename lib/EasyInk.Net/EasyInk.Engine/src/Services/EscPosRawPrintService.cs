using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;
using PdfiumViewer;

namespace EasyInk.Engine.Services;

/// <summary>
/// 热敏打印机 Raw ESC/POS 打印服务。
/// PDF → Pdfium 渲染为位图 → 二值化 → ESC/POS GS v 0 位图指令 → WritePrinter 直发。
/// 完全绕过 Windows 打印驱动，消除硬边距/缩放/纸张匹配等问题。
/// </summary>
public class EscPosRawPrintService : IPrintService
{
    private const int CUT_FEED_LINES = 6;

    private readonly int _dpi;
    private readonly int _maxDotsWidth;

    private readonly IPrinterService _printerService;
    private readonly ILogger _logger;

    public EscPosRawPrintService(IPrinterService printerService, ILogger? logger = null, int dpi = 203, int maxDotsWidth = 576)
    {
        if (dpi <= 0)
            throw new ArgumentOutOfRangeException(nameof(dpi), "DPI must be greater than 0.");
        if (maxDotsWidth <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxDotsWidth), "Max dots width must be greater than 0.");

        _dpi = dpi;
        _maxDotsWidth = maxDotsWidth;
        _printerService = printerService ?? throw new ArgumentNullException(nameof(printerService));
        _logger = logger ?? new NullLogger();
    }

    public PrinterResult Print(string requestId, PrintRequestParams request, CancellationToken cancellationToken = default)
    {
        if (cancellationToken.IsCancellationRequested)
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印已取消");

        var status = _printerService.GetPrinterStatus(request.PrinterName);
        if (!status.IsReady)
            return PrinterResult.Error(requestId, status.StatusCode, status.Message);

        IPdfProvider provider;
        try { provider = request.CreatePdfProvider(); }
        catch (Exception ex) { return PrinterResult.Error(requestId, ErrorCode.InvalidPdfSource, ex.Message); }

        var pdfBytes = provider.GetPdfBytes();
        if (pdfBytes == null || pdfBytes.Length == 0)
            return PrinterResult.Error(requestId, ErrorCode.InvalidPdfSource, "PDF 内容为空");

        try
        {
            var bands = RenderPdfToEscPosBands(requestId, pdfBytes, cancellationToken);
            var batches = BuildPrintBatches(bands, request.Copies);

            NativePrintApi.SendRawBatched(request.PrinterName, batches,
                $"EasyInk-{requestId.Substring(0, Math.Min(8, requestId.Length))}", delayMs: 80);

            _logger.Log(LogLevel.Info, $"Raw 打印成功: {request.PrinterName}, jobId={requestId}", requestId);
            return PrinterResult.Ok(requestId, PrintResult.Success(requestId));
        }
        catch (OperationCanceledException)
        {
            _logger.Log(LogLevel.Info, $"打印已取消: {request.PrinterName}, jobId={requestId}", requestId);
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印已取消");
        }
        catch (Exception ex)
        {
            _logger.Log(LogLevel.Error, $"Raw 打印失败: {request.PrinterName}, jobId={requestId}, {ex}", requestId);
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印失败，请检查打印机状态后重试");
        }
    }

    internal static byte[][] BuildPrintBatches(IReadOnlyList<byte[]> bands, int copies)
    {
        copies = Math.Max(copies, 1);

        var init = BitmapToEscPos.CmdInit();
        var feedToCutter = BitmapToEscPos.CmdFeedLines(CUT_FEED_LINES);
        var cut = BitmapToEscPos.CmdCut();
        var batches = new List<byte[]>(copies * (bands.Count + 3));

        for (int copy = 0; copy < copies; copy++)
        {
            batches.Add(init);
            for (int i = 0; i < bands.Count; i++)
                batches.Add(bands[i]);
            // Move the final raster lines past the physical cutter before cutting.
            batches.Add(feedToCutter);
            batches.Add(cut);
        }

        return batches.ToArray();
    }

    private List<byte[]> RenderPdfToEscPosBands(string requestId, byte[] pdfBytes, CancellationToken cancellationToken)
    {
        using var pdfStream = new MemoryStream(pdfBytes);
        using var pdfDoc = PdfDocument.Load(pdfStream);

        int pageCount = pdfDoc.PageCount;
        if (pageCount == 0)
            throw new InvalidOperationException("PDF 无页面");

        var bands = new List<byte[]>();

        for (int i = 0; i < pageCount; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var pageSize = pdfDoc.PageSizes[i];
            if (pageSize.Width <= 0 || pageSize.Height <= 0)
                throw new InvalidOperationException($"PDF 第 {i + 1} 页尺寸无效");

            float paperWidthMm = (float)(pageSize.Width / 72.0 * 25.4);
            float paperHeightMm = (float)(pageSize.Height / 72.0 * 25.4);
            float scale = _maxDotsWidth / (paperWidthMm / 25.4f * _dpi);
            int renderWidth = _maxDotsWidth;
            int renderHeight = Math.Max(1, (int)Math.Round(paperHeightMm / 25.4f * _dpi * scale));

            using var pageImg = pdfDoc.Render(i, renderWidth, renderHeight, _dpi, _dpi, PdfRenderFlags.ForPrinting);
            using var pageBitmap = CreateWhite24BppBitmap(pageImg, renderWidth, renderHeight);
            var pageBands = BitmapToEscPos.ConvertToRasterBands(pageBitmap);
            bands.AddRange(pageBands);

            _logger.Log(LogLevel.Info,
                $"[RawPrint] page={i + 1}/{pageCount}" +
                $" paper={paperWidthMm:F1}x{paperHeightMm:F1}mm" +
                $" render={renderWidth}x{renderHeight}px@{_dpi}dpi" +
                $" scale={scale:F3}" +
                $" bands={pageBands.Count}" +
                $" method=GS_v_0",
                requestId);
        }

        _logger.Log(LogLevel.Info,
            $"[RawPrint] pages={pageCount} totalBands={bands.Count} method=GS_v_0",
            requestId);

        return bands;
    }

    private static Bitmap CreateWhite24BppBitmap(Image source, int width, int height)
    {
        var bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb);
        bitmap.SetResolution(source.HorizontalResolution, source.VerticalResolution);

        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.White);
        graphics.DrawImage(source, new Rectangle(0, 0, width, height));

        return bitmap;
    }
}
