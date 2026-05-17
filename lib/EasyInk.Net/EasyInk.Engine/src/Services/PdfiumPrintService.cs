using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;
using PdfiumViewer;

namespace EasyInk.Engine.Services;

/// <summary>
/// 基于 Pdfium + Windows Print Spooler 的打印服务。
/// Pdfium 将 PDF 每页渲染为位图，PrintDocument 通过标准 Windows 打印管线输出。
/// DEVMODE、可打印区域、硬边距全部由 Spooler + 驱动正确协商。
/// </summary>
public class PdfiumPrintService : IPrintService
{
    private const int DefaultRenderDpi = 600;
    private const int MaxRenderDpi = 1200;
    private const int LowDpiNativeRenderThreshold = 360;
    private const int MinKnownPrinterDpi = 150;
    private const float LowDpiTextBoostContrast = 1.28f;
    private const float LowDpiTextBoostBrightness = -0.08f;
    private const byte LowDpiMonochromeThreshold = 220;

    private readonly IPrinterService _printerService;
    private readonly ILogger _logger;
    private readonly LowDpiPrintEnhancementMode _lowDpiPrintEnhancementMode;

    /// <summary>
    /// 初始化 Pdfium 打印服务
    /// </summary>
    public PdfiumPrintService(IPrinterService printerService, ILogger? logger = null,
        LowDpiPrintEnhancementMode lowDpiPrintEnhancementMode = LowDpiPrintEnhancementMode.Boost)
    {
        _printerService = printerService ?? throw new ArgumentNullException(nameof(printerService));
        _logger = logger ?? new NullLogger();
        _lowDpiPrintEnhancementMode = lowDpiPrintEnhancementMode;
    }

    /// <summary>
    /// 执行打印任务
    /// </summary>
    public PrinterResult Print(string requestId, PrintRequestParams request, CancellationToken cancellationToken = default)
    {
        if (cancellationToken.IsCancellationRequested)
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印已取消");

        // IsReady 仅在确知打印机不可用时为 false（离线、卡纸、缺纸、已停止）。
        // WMI 查询失败/超时/不可用时 IsReady 必须为 true —— 状态未知不等于不可用，
        // 误拦截会导致实际可用的打印机无法打印。
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

        try
        {
            PrintWithSpooler(requestId, request, pdfBytes, cancellationToken);
            _logger.Log(LogLevel.Info, $"打印成功: {request.PrinterName}, jobId={requestId}", requestId);
            return PrinterResult.Ok(requestId, PrintResult.Success(requestId));
        }
        catch (OperationCanceledException)
        {
            _logger.Log(LogLevel.Info, $"打印已取消: {request.PrinterName}, jobId={requestId}", requestId);
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印已取消");
        }
        catch (Exception ex)
        {
            _logger.Log(LogLevel.Error, $"打印失败: {request.PrinterName}, jobId={requestId}, {ex}", requestId);
            return PrinterResult.Error(requestId, ErrorCode.PrintFailed, "打印失败，请检查打印机状态后重试");
        }
    }

    private void PrintWithSpooler(string requestId, PrintRequestParams request, byte[] pdfBytes, CancellationToken cancellationToken)
    {
        using var pdfStream = new MemoryStream(pdfBytes);
        using var pdfDoc = PdfDocument.Load(pdfStream);

        int pageCount = pdfDoc.PageCount;
        if (pageCount == 0)
            throw new InvalidOperationException("PDF 无页面");

        var pdfPageSize = pdfDoc.PageSizes[0];
        float contentWidthMm = (float)(pdfPageSize.Width / 72.0 * 25.4);
        float contentHeightMm = (float)(pdfPageSize.Height / 72.0 * 25.4);

        if (request.ForcePaperSize && request.PaperSize != null)
        {
            contentWidthMm = ToMm(request.PaperSize.Width, request.PaperSize.Unit);
            contentHeightMm = ToMm(request.PaperSize.Height, request.PaperSize.Unit);
        }

        float offsetXUnits = 0, offsetYUnits = 0;
        if (request.Offset != null)
        {
            offsetXUnits = (float)(ToMm(request.Offset.X, request.Offset.Unit) / 25.4 * 100.0);
            offsetYUnits = (float)(ToMm(request.Offset.Y, request.Offset.Unit) / 25.4 * 100.0);
        }

        using var printDoc = new PrintDocument();
        printDoc.PrinterSettings.PrinterName = request.PrinterName;

        if (request.ForcePaperSize && request.PaperSize != null)
        {
            var paperWidthHundredths = (int)Math.Round(contentWidthMm / 25.4 * 100.0);
            var paperHeightHundredths = (int)Math.Round(contentHeightMm / 25.4 * 100.0);
            printDoc.DefaultPageSettings.PaperSize = new PaperSize("EasyInk Custom",
                paperWidthHundredths, paperHeightHundredths);
        }

        printDoc.DefaultPageSettings.Landscape = request.Landscape;
        printDoc.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
        printDoc.OriginAtMargins = false;

        short copies = (short)Math.Max(request.Copies, 1);
        int logicalPageCount = pageCount * copies;
        int pageIndex = 0;

        // Render each page on-demand in PrintPage to bound memory to a single bitmap at a time.
        printDoc.PrintPage += (_, e) =>
        {
            if (cancellationToken.IsCancellationRequested || pageIndex >= logicalPageCount)
            {
                e.HasMorePages = false;
                return;
            }

            int pdfPageIndex = pageIndex % pageCount;
            var ps = e.PageSettings;
            var pb = e.PageBounds;
            var printable = GetEffectiveDrawingArea(ps, pb);

            float contentWUnits = contentWidthMm / 25.4f * 100f;
            float contentHUnits = contentHeightMm / 25.4f * 100f;
            float targetScale = Math.Min(printable.Width / contentWUnits, printable.Height / contentHUnits);
            float drawW = contentWUnits * targetScale;
            float drawH = contentHUnits * targetScale;
            float drawX = printable.X + (printable.Width - drawW) / 2f + offsetXUnits;
            float drawY = printable.Y + (printable.Height - drawH) / 2f + offsetYUnits;

            var renderResolution = GetRenderResolution(request, ps, e.Graphics, _lowDpiPrintEnhancementMode);
            var drawRect = new RectangleF(drawX, drawY, drawW, drawH);
            if (renderResolution.MapsToDevicePixels)
                drawRect = SnapToDevicePixels(drawRect, renderResolution.X, renderResolution.Y);

            int renderWidth = Math.Max(1, (int)Math.Round(drawRect.Width / 100f * renderResolution.X));
            int renderHeight = Math.Max(1, (int)Math.Round(drawRect.Height / 100f * renderResolution.Y));

            using (var img = pdfDoc.Render(pdfPageIndex, renderWidth, renderHeight, renderResolution.X, renderResolution.Y,
                PdfRenderFlags.ForPrinting))
            {
                var bitmap = img as Bitmap;
                bitmap?.SetResolution(renderResolution.X, renderResolution.Y);
                using var enhancedImg = CreateEnhancedLowDpiBitmap(
                    img,
                    renderResolution.X,
                    renderResolution.Y,
                    renderResolution.EnhancementMode);
                var printImg = enhancedImg ?? img;

                if (pageIndex < pageCount)
                {
                    _logger.Log(LogLevel.Info,
                        $"[PrintDiag] page={pdfPageIndex}" +
                        $" content=({contentWidthMm:F1}x{contentHeightMm:F1}mm)" +
                        $" driverPaper=({ps.PaperSize.Width}x{ps.PaperSize.Height})" +
                        $" pageBounds=({pb.Width},{pb.Height})" +
                        $" printableArea=({ps.PrintableArea.X},{ps.PrintableArea.Y} {ps.PrintableArea.Width}x{ps.PrintableArea.Height})" +
                        $" hardMargin=({ps.HardMarginX},{ps.HardMarginY})" +
                        $" effectiveDrawing=({printable.X:F1},{printable.Y:F1} {printable.Width:F1}x{printable.Height:F1})" +
                        $" render=({renderWidth}x{renderHeight}@{renderResolution.X}x{renderResolution.Y}dpi/{renderResolution.Source})" +
                        $" requestedDpi={renderResolution.RequestedDpi}" +
                        $" printerDpi=({ps.PrinterResolution.X},{ps.PrinterResolution.Y})" +
                        $" graphicsDpi=({e.Graphics.DpiX:F0},{e.Graphics.DpiY:F0})" +
                        $" targetScale={targetScale:F3}" +
                        $" draw=({drawRect.X:F1},{drawRect.Y:F1} {drawRect.Width:F1}x{drawRect.Height:F1})" +
                        $" deviceSnap={renderResolution.MapsToDevicePixels}" +
                        $" lowDpiEnhancement={renderResolution.EnhancementMode}",
                        requestId);
                }

                ConfigureGraphicsQuality(e.Graphics, renderResolution.MapsToDevicePixels);

                e.Graphics.DrawImage(printImg, drawRect.X, drawRect.Y, drawRect.Width, drawRect.Height);
            }

            pageIndex++;
            e.HasMorePages = !cancellationToken.IsCancellationRequested && pageIndex < logicalPageCount;
        };

        printDoc.Print();
    }

    private static RenderResolution GetRenderResolution(PrintRequestParams request, PageSettings pageSettings,
        Graphics graphics, LowDpiPrintEnhancementMode lowDpiPrintEnhancementMode)
    {
        int requestedDpi = request.Dpi > 0 ? request.Dpi : DefaultRenderDpi;
        int deviceDpiX = GetKnownDeviceDpi(pageSettings.PrinterResolution.X, graphics.DpiX);
        int deviceDpiY = GetKnownDeviceDpi(pageSettings.PrinterResolution.Y, graphics.DpiY);
        int maxDeviceDpi = Math.Max(deviceDpiX, deviceDpiY);

        // Thermal/receipt printers usually expose their real dot density (203/300 dpi).
        // Rendering at 600 dpi and letting GDI downsample softens text, so use native dots by default.
        if (maxDeviceDpi > 0 && maxDeviceDpi <= LowDpiNativeRenderThreshold && requestedDpi <= DefaultRenderDpi)
        {
            return new RenderResolution(
                ClampDpi(deviceDpiX > 0 ? deviceDpiX : maxDeviceDpi),
                ClampDpi(deviceDpiY > 0 ? deviceDpiY : maxDeviceDpi),
                true,
                "native-low-dpi",
                requestedDpi,
                lowDpiPrintEnhancementMode);
        }

        int renderDpiX = Math.Max(requestedDpi, deviceDpiX > 0 ? deviceDpiX : DefaultRenderDpi);
        int renderDpiY = Math.Max(requestedDpi, deviceDpiY > 0 ? deviceDpiY : DefaultRenderDpi);
        renderDpiX = ClampDpi(renderDpiX);
        renderDpiY = ClampDpi(renderDpiY);

        bool mapsToDevicePixels = deviceDpiX > 0 && deviceDpiY > 0 &&
                                  renderDpiX == deviceDpiX && renderDpiY == deviceDpiY;
        return new RenderResolution(renderDpiX, renderDpiY, mapsToDevicePixels, "requested", requestedDpi,
            LowDpiPrintEnhancementMode.Normal);
    }

    private static int GetKnownDeviceDpi(int settingsDpi, float graphicsDpi)
    {
        if (settingsDpi >= MinKnownPrinterDpi)
            return ClampDpi(settingsDpi);

        int roundedGraphicsDpi = (int)Math.Round(graphicsDpi);
        return roundedGraphicsDpi >= MinKnownPrinterDpi ? ClampDpi(roundedGraphicsDpi) : 0;
    }

    private static int ClampDpi(int dpi)
    {
        return Math.Max(72, Math.Min(dpi, MaxRenderDpi));
    }

    private static RectangleF SnapToDevicePixels(RectangleF rect, int dpiX, int dpiY)
    {
        float x = SnapUnitToPixel(rect.X, dpiX);
        float y = SnapUnitToPixel(rect.Y, dpiY);
        float right = SnapUnitToPixel(rect.Right, dpiX);
        float bottom = SnapUnitToPixel(rect.Bottom, dpiY);

        float minWidth = 100f / dpiX;
        float minHeight = 100f / dpiY;

        return new RectangleF(
            x,
            y,
            Math.Max(minWidth, right - x),
            Math.Max(minHeight, bottom - y));
    }

    private static float SnapUnitToPixel(float value, int dpi)
    {
        return (float)(Math.Round(value / 100f * dpi) * 100.0 / dpi);
    }

    private static void ConfigureGraphicsQuality(Graphics graphics, bool mapsToDevicePixels)
    {
        if (mapsToDevicePixels)
        {
            graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
            graphics.PixelOffsetMode = PixelOffsetMode.Half;
            graphics.SmoothingMode = SmoothingMode.None;
            graphics.CompositingQuality = CompositingQuality.HighSpeed;
            return;
        }

        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        graphics.SmoothingMode = SmoothingMode.HighQuality;
        graphics.CompositingQuality = CompositingQuality.HighQuality;
    }

    private static Bitmap? CreateEnhancedLowDpiBitmap(Image source, int dpiX, int dpiY,
        LowDpiPrintEnhancementMode enhancementMode)
    {
        switch (enhancementMode)
        {
            case LowDpiPrintEnhancementMode.Boost:
                return CreateLowDpiTextBoostBitmap(source, dpiX, dpiY);
            case LowDpiPrintEnhancementMode.Monochrome:
                return CreateLowDpiMonochromeBitmap(source, dpiX, dpiY);
            default:
                return null;
        }
    }

    private static Bitmap CreateLowDpiTextBoostBitmap(Image source, int dpiX, int dpiY)
    {
        var boosted = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb);
        boosted.SetResolution(dpiX, dpiY);

        using var graphics = Graphics.FromImage(boosted);
        graphics.Clear(Color.White);
        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
        graphics.PixelOffsetMode = PixelOffsetMode.Half;
        graphics.SmoothingMode = SmoothingMode.None;
        graphics.CompositingQuality = CompositingQuality.HighSpeed;

        using var attributes = new ImageAttributes();
        float colorOffset = 0.5f - LowDpiTextBoostContrast * 0.5f + LowDpiTextBoostBrightness;
        attributes.SetColorMatrix(new ColorMatrix(new[]
        {
            new[] { LowDpiTextBoostContrast, 0, 0, 0, 0 },
            new[] { 0, LowDpiTextBoostContrast, 0, 0, 0 },
            new[] { 0, 0, LowDpiTextBoostContrast, 0, 0 },
            new[] { 0, 0, 0, 1f, 0 },
            new[] { colorOffset, colorOffset, colorOffset, 0, 1f }
        }));

        graphics.DrawImage(
            source,
            new Rectangle(0, 0, source.Width, source.Height),
            0,
            0,
            source.Width,
            source.Height,
            GraphicsUnit.Pixel,
            attributes);

        return boosted;
    }

    private static Bitmap CreateLowDpiMonochromeBitmap(Image source, int dpiX, int dpiY)
    {
        using var boosted = CreateLowDpiTextBoostBitmap(source, dpiX, dpiY);
        var monochrome = new Bitmap(boosted.Width, boosted.Height, PixelFormat.Format24bppRgb);
        monochrome.SetResolution(dpiX, dpiY);

        var rect = new Rectangle(0, 0, boosted.Width, boosted.Height);
        var srcData = boosted.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        var dstData = monochrome.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);

        try
        {
            int srcBytes = Math.Abs(srcData.Stride) * boosted.Height;
            int dstBytes = Math.Abs(dstData.Stride) * monochrome.Height;
            var src = new byte[srcBytes];
            var dst = new byte[dstBytes];
            Marshal.Copy(srcData.Scan0, src, 0, srcBytes);

            for (int y = 0; y < boosted.Height; y++)
            {
                int srcRow = GetBitmapRowOffset(y, boosted.Height, srcData.Stride);
                int dstRow = GetBitmapRowOffset(y, monochrome.Height, dstData.Stride);
                for (int x = 0; x < boosted.Width; x++)
                {
                    int srcOffset = srcRow + x * 3;
                    int dstOffset = dstRow + x * 3;
                    byte b = src[srcOffset];
                    byte g = src[srcOffset + 1];
                    byte r = src[srcOffset + 2];
                    int luminance = (r * 299 + g * 587 + b * 114) / 1000;
                    byte value = luminance < LowDpiMonochromeThreshold ? (byte)0 : (byte)255;
                    dst[dstOffset] = value;
                    dst[dstOffset + 1] = value;
                    dst[dstOffset + 2] = value;
                }
            }

            Marshal.Copy(dst, 0, dstData.Scan0, dstBytes);
        }
        finally
        {
            boosted.UnlockBits(srcData);
            monochrome.UnlockBits(dstData);
        }

        return monochrome;
    }

    private static int GetBitmapRowOffset(int y, int height, int stride)
    {
        return stride >= 0 ? y * stride : (height - 1 - y) * -stride;
    }

    private static RectangleF GetEffectiveDrawingArea(PageSettings pageSettings, Rectangle pageBounds)
    {
        var printable = pageSettings.PrintableArea;
        float width;
        float height;

        if (printable.Width > 0 && printable.Height > 0)
        {
            // With OriginAtMargins=false the Graphics origin is normally already
            // translated to the printable area's top-left. Use printable size,
            // not printable X/Y, to avoid applying the hard margin twice.
            width = pageSettings.Landscape ? printable.Height : printable.Width;
            height = pageSettings.Landscape ? printable.Width : printable.Height;
        }
        else
        {
            float marginLeft = pageSettings.HardMarginX;
            float marginTop = pageSettings.HardMarginY;
            float marginRight = marginLeft;
            float marginBottom = marginTop;

            width = pageBounds.Width - marginLeft - marginRight;
            height = pageBounds.Height - marginTop - marginBottom;
        }

        width = Math.Max(1f, Math.Min(width, pageBounds.Width));
        height = Math.Max(1f, Math.Min(height, pageBounds.Height));

        return new RectangleF(0, 0, width, height);
    }

    private static float ToMm(double value, string unit)
    {
        return string.Equals(unit, "inch", StringComparison.OrdinalIgnoreCase)
            ? (float)(value * 25.4)
            : (float)value;
    }

    private readonly struct RenderResolution
    {
        public RenderResolution(int x, int y, bool mapsToDevicePixels, string source, int requestedDpi,
            LowDpiPrintEnhancementMode enhancementMode)
        {
            X = x;
            Y = y;
            MapsToDevicePixels = mapsToDevicePixels;
            Source = source;
            RequestedDpi = requestedDpi;
            EnhancementMode = enhancementMode;
        }

        public int X { get; }
        public int Y { get; }
        public bool MapsToDevicePixels { get; }
        public string Source { get; }
        public int RequestedDpi { get; }
        public LowDpiPrintEnhancementMode EnhancementMode { get; }
    }
}
