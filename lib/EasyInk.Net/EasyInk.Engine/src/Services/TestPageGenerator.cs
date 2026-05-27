using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using EasyInk.Engine.Models;

namespace EasyInk.Engine.Services;

/// <summary>
/// 在内存中生成测试页 PDF（无外部依赖）。
/// 使用 PDF 内置 Helvetica/Courier 字体，生成单页测试文档。
/// </summary>
internal static class TestPageGenerator
{
    private const float A4WidthPt = 595.28f;   // 210mm
    private const float A4HeightPt = 841.89f;  // 297mm
    private const float MarginPt = 30f;
    private const float LineGap = 1.5f;
    private static readonly Encoding WinAnsi = Encoding.GetEncoding(1252);

    /// <summary>
    /// 生成快速测试页 PDF
    /// </summary>
    internal static byte[] GenerateQuick(string printerName, string printPath, TestPageMetadata? meta = null)
    {
        var sb = new StringBuilder();
        float y = A4HeightPt - MarginPt;

        AppendLine(sb, ref y, 16f, "EasyInk Print Test");
        y -= 4f;
        AppendHLine(sb, ref y);
        y -= 4f;
        AppendLine(sb, ref y, 9f, $"Printer: {printerName}");
        AppendLine(sb, ref y, 9f, $"Path: {printPath}");
        if (meta != null)
        {
            if (!string.IsNullOrEmpty(meta.AppVersion))
                AppendLine(sb, ref y, 9f, $"App: {meta.AppVersion}");
            if (!string.IsNullOrEmpty(meta.LanAddresses))
                AppendLine(sb, ref y, 9f, $"Address: {meta.LanAddresses}:{meta.HttpPort}");
        }
        AppendLine(sb, ref y, 9f, $"Time: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        y -= 8f;
        AppendLine(sb, ref y, 12f, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        AppendLine(sb, ref y, 12f, "abcdefghijklmnopqrstuvwxyz");
        AppendLine(sb, ref y, 12f, "0123456789 !@#$%^&*()");

        return BuildPdf(sb);
    }

    /// <summary>
    /// 生成完整诊断测试页 PDF
    /// </summary>
    internal static byte[] GenerateFull(string printerName, string printPath,
        bool statusReady, string? statusDetail, string? paperSize,
        TestPageMetadata? meta = null)
    {
        var sb = new StringBuilder();
        float y = A4HeightPt - MarginPt;

        // ===== Header =====
        AppendLine(sb, ref y, 18f, "EasyInk Print Test Page");
        y -= 2f;
        AppendHLine(sb, ref y);
        y -= 4f;

        // ===== System Info =====
        AppendLine(sb, ref y, 10f, "System Information");
        y -= 1f;
        AppendThinHLine(sb, ref y);
        y -= 2f;
        if (meta != null)
        {
            if (!string.IsNullOrEmpty(meta.OsVersion))
                AppendLine(sb, ref y, 8f, $"  OS: {meta.OsVersion}");
            if (!string.IsNullOrEmpty(meta.DotNetVersion))
                AppendLine(sb, ref y, 8f, $"  .NET: {meta.DotNetVersion}");
            if (!string.IsNullOrEmpty(meta.AppVersion))
                AppendLine(sb, ref y, 8f, $"  App Version: {meta.AppVersion}");
            if (!string.IsNullOrEmpty(meta.MachineName))
                AppendLine(sb, ref y, 8f, $"  Machine: {meta.MachineName}");
            if (!string.IsNullOrEmpty(meta.UserName))
                AppendLine(sb, ref y, 8f, $"  User: {meta.UserName}");
            if (!string.IsNullOrEmpty(meta.DeviceNumber))
                AppendLine(sb, ref y, 8f, $"  Device No: {meta.DeviceNumber}");
        }
        AppendLine(sb, ref y, 8f, $"  Test Time: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}");
        y -= 4f;

        // ===== Network Info =====
        AppendLine(sb, ref y, 10f, "Network & Service");
        y -= 1f;
        AppendThinHLine(sb, ref y);
        y -= 2f;
        if (meta != null)
        {
            AppendLine(sb, ref y, 8f, $"  HTTP Port: {meta.HttpPort}");
            if (!string.IsNullOrEmpty(meta.LanAddresses))
            {
                var addrs = meta.LanAddresses.Split(new[] { '|' }, StringSplitOptions.RemoveEmptyEntries);
                AppendLine(sb, ref y, 8f, $"  LAN IPv4: {addrs[0]}");
                for (int i = 1; i < addrs.Length; i++)
                    AppendLine(sb, ref y, 8f, $"            {addrs[i]}");
                AppendLine(sb, ref y, 8f, $"  Service URLs: {string.Join("  ", Array.ConvertAll(addrs, a => $"http://{a}:{meta.HttpPort}"))}");
            }
            AppendLine(sb, ref y, 8f, $"  MAC Address: {meta.MacAddresses ?? "--"}");
            if (!string.IsNullOrEmpty(meta.DefaultGateway))
                AppendLine(sb, ref y, 8f, $"  Gateway: {meta.DefaultGateway}");
            if (!string.IsNullOrEmpty(meta.DnsServers))
                AppendLine(sb, ref y, 8f, $"  DNS: {meta.DnsServers}");
            AppendLine(sb, ref y, 8f, $"  API Key: {(meta.ApiKeyEnabled ? "Enabled" : "Disabled")}");
            AppendLine(sb, ref y, 8f, $"  Trust All Origins: {(meta.TrustAllOrigins ? "Yes" : "No")}");
        }
        y -= 4f;

        // ===== Printer Info =====
        AppendLine(sb, ref y, 10f, "Printer Information");
        y -= 1f;
        AppendThinHLine(sb, ref y);
        y -= 2f;
        AppendLine(sb, ref y, 8f, $"  Name: {printerName}");
        AppendLine(sb, ref y, 8f, $"  Print Path: {printPath}");
        AppendLine(sb, ref y, 8f, $"  Status Ready: {(statusReady ? "Yes" : "No")}");
        if (!string.IsNullOrEmpty(statusDetail))
            AppendLine(sb, ref y, 8f, $"  Status Detail: {statusDetail}");
        if (!string.IsNullOrEmpty(paperSize))
            AppendLine(sb, ref y, 8f, $"  Paper Match: {paperSize}");
        if (meta != null)
        {
            if (!string.IsNullOrEmpty(meta.DriverName))
                AppendLine(sb, ref y, 8f, $"  Driver: {meta.DriverName}");
            if (!string.IsNullOrEmpty(meta.DefaultPaperSize))
                AppendLine(sb, ref y, 8f, $"  Default Paper: {meta.DefaultPaperSize}");
        }
        y -= 4f;

        // ===== Print Config =====
        AppendLine(sb, ref y, 10f, "Print Configuration");
        y -= 1f;
        AppendThinHLine(sb, ref y);
        y -= 2f;
        if (meta != null)
        {
            if (meta.ConfigDpi.HasValue)
                AppendLine(sb, ref y, 8f, $"  Requested DPI: {meta.ConfigDpi.Value}");
            if (!string.IsNullOrEmpty(meta.LowDpiEnhancement))
                AppendLine(sb, ref y, 8f, $"  Low DPI Enhancement: {meta.LowDpiEnhancement}");
            if (!string.IsNullOrEmpty(meta.RawPrinterNames))
                AppendLine(sb, ref y, 8f, $"  Raw Printers: {meta.RawPrinterNames}");
            if (meta.RawPrintDpi.HasValue)
                AppendLine(sb, ref y, 8f, $"  Raw DPI: {meta.RawPrintDpi.Value}");
            if (meta.RawPrintMaxDotsWidth.HasValue)
                AppendLine(sb, ref y, 8f, $"  Raw Max Width: {meta.RawPrintMaxDotsWidth.Value} dots");
            if (!string.IsNullOrEmpty(meta.SumatraPrinterNames))
                AppendLine(sb, ref y, 8f, $"  SumatraPDF Printers: {meta.SumatraPrinterNames}");
            if (meta.SumatraTimeoutSeconds.HasValue)
                AppendLine(sb, ref y, 8f, $"  SumatraPDF Timeout: {meta.SumatraTimeoutSeconds.Value}s");
            AppendLine(sb, ref y, 8f, $"  Render: {(meta.RenderEnabled ? "Enabled" : "Disabled")}");
            if (meta.MaxQueueSize.HasValue)
                AppendLine(sb, ref y, 8f, $"  Max Queue: {meta.MaxQueueSize.Value}");
            if (meta.MaxConcurrentRequests.HasValue)
                AppendLine(sb, ref y, 8f, $"  Max Concurrent: {meta.MaxConcurrentRequests.Value}");
        }
        y -= 4f;

        // ===== Printer Capabilities =====
        if (meta?.SupportedPaperSizes != null && meta.SupportedPaperSizes.Count > 0)
        {
            AppendLine(sb, ref y, 10f, "Printer Capabilities");
            y -= 1f;
            AppendThinHLine(sb, ref y);
            y -= 2f;
            var sizes = meta.SupportedPaperSizes.Count > 6
                ? meta.SupportedPaperSizes.GetRange(0, 6)
                : meta.SupportedPaperSizes;
            AppendLine(sb, ref y, 8f, $"  Supported Papers ({meta.SupportedPaperSizes.Count} total): {string.Join(", ", sizes)}");
            if (meta.SupportedPaperSizes.Count > 6)
                AppendLine(sb, ref y, 8f, $"    ... and {meta.SupportedPaperSizes.Count - 6} more");
            y -= 4f;
        }

        // ===== Text Quality =====
        AppendLine(sb, ref y, 10f, "Text Quality");
        y -= 1f;
        AppendThinHLine(sb, ref y);
        y -= 3f;
        AppendLine(sb, ref y, 14f, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        AppendLine(sb, ref y, 14f, "abcdefghijklmnopqrstuvwxyz");
        AppendLine(sb, ref y, 14f, "0123456789 !@#$%^&*()");
        AppendLine(sb, ref y, 14f, "The quick brown fox jumps over the lazy dog");
        y -= 2f;
        AppendLine(sb, ref y, 10f, "Medium: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789");
        AppendLine(sb, ref y, 8f, "Small:  ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789");
        AppendLine(sb, ref y, 7f, "Tiny:   ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789");
        y -= 2f;
        AppendLine(sb, ref y, 9f, "CJK: 中文测试 日本語テスト 한국어테스트");
        y -= 6f;

        // ===== Alignment & Lines =====
        AppendLine(sb, ref y, 10f, "Line & Alignment");
        y -= 1f;
        AppendThinHLine(sb, ref y);
        y -= 3f;
        float left = MarginPt;
        float right = A4WidthPt - MarginPt;
        float markLen = 18f;
        // Top-left corner mark
        AppendLineSeg(sb, left, y, left + markLen, y);
        AppendLineSeg(sb, left, y, left, y - markLen);
        // Top-right corner mark
        AppendLineSeg(sb, right, y, right - markLen, y);
        AppendLineSeg(sb, right, y, right, y - markLen);
        y -= 28f;
        AppendLine(sb, ref y, 8f, "  Corner alignment marks (top-left & top-right shown above)");
        y -= 2f;
        // Bottom corner marks
        float botY = MarginPt + markLen + 6f;
        AppendLineSeg(sb, left, botY, left + markLen, botY);
        AppendLineSeg(sb, left, botY + markLen, left, botY);
        AppendLineSeg(sb, right, botY, right - markLen, botY);
        AppendLineSeg(sb, right, botY + markLen, right, botY);
        y -= 4f;
        // Horizontal rules at different thicknesses
        AppendLine(sb, ref y, 8f, "  Horizontal rules (0.5pt / 1pt / 2pt):");
        AppendThickLine(sb, ref y, 0.5f);
        y -= 1f;
        AppendThickLine(sb, ref y, 1.0f);
        y -= 1f;
        AppendThickLine(sb, ref y, 2.0f);
        y -= 6f;

        // ===== Diagnostic Elements =====
        AppendLine(sb, ref y, 10f, "Diagnostic Elements");
        y -= 1f;
        AppendThinHLine(sb, ref y);
        y -= 3f;

        // Grayscale blocks
        AppendLine(sb, ref y, 8f, "  Grayscale: 100%   75%   50%   25%   10%");
        AppendGrayBlocks(sb, ref y);
        y -= 6f;

        // Code 128 barcode (test identifier)
        var barcodeData = $"EASYINK-{DateTime.Now:yyyyMMdd}";
        AppendLine(sb, ref y, 8f, $"  Barcode (Code 128): {barcodeData}");
        AppendCode128Barcode(sb, ref y, barcodeData);
        y -= 6f;

        // Footer
        AppendHLine(sb, ref y);
        y -= 3f;
        AppendLine(sb, ref y, 7f, "Generated by EasyInk Printer | https://github.com/nicepkg/easyink");

        return BuildPdf(sb);
    }

    // ===== PDF text helpers =====

    private static void AppendLine(StringBuilder sb, ref float y, float fontSize, string text)
    {
        var escaped = EscapePdfString(text);
        sb.AppendLine($"BT /F1 {F(fontSize)} Tf {F(MarginPt)} {F(y)} Td ({escaped}) Tj ET");
        y -= fontSize + LineGap;
    }

    private static void AppendHLine(StringBuilder sb, ref float y)
    {
        sb.AppendLine($"0.8 w {F(MarginPt)} {F(y)} m {F(A4WidthPt - MarginPt)} {F(y)} l S");
        y -= 3f;
    }

    private static void AppendThinHLine(StringBuilder sb, ref float y)
    {
        sb.AppendLine($"0.3 w {F(MarginPt)} {F(y)} m {F(A4WidthPt - MarginPt)} {F(y)} l S");
        y -= 2f;
    }

    private static void AppendThickLine(StringBuilder sb, ref float y, float lineWidth)
    {
        sb.AppendLine($"{F(lineWidth)} w {F(MarginPt)} {F(y)} m {F(A4WidthPt - MarginPt)} {F(y)} l S");
        y -= lineWidth + 1.5f;
    }

    private static void AppendLineSeg(StringBuilder sb, float x1, float y1, float x2, float y2)
    {
        sb.AppendLine($"0.8 w {F(x1)} {F(y1)} m {F(x2)} {F(y2)} l S");
    }

    private static void AppendGrayBlocks(StringBuilder sb, ref float y)
    {
        float x = MarginPt + 10f;
        float blockW = 50f;
        float blockH = 20f;
        float gap = 8f;

        var grays = new[] { 0f, 0.25f, 0.5f, 0.75f, 0.9f };
        foreach (var gray in grays)
        {
            sb.AppendLine($"{F(gray)} g {F(x)} {F(y)} {F(blockW)} {F(blockH)} f 0 g");
            x += blockW + gap;
        }
        y -= blockH + 3f;
    }

    private static void AppendCode128Barcode(StringBuilder sb, ref float y, string data)
    {
        // Code 128B encoding for ASCII printable characters
        // Start code B = 104, then character values - 32 = code, checksum mod 103
        var codes = new List<int> { 104 }; // Start B
        int checksum = 104;
        for (int i = 0; i < data.Length; i++)
        {
            int code = data[i] - 32;
            codes.Add(code);
            checksum += code * (i + 1);
        }
        codes.Add(checksum % 103); // Checksum
        codes.Add(106); // Stop

        // Code 128 bar widths (6 patterns per code, each 1-4 units)
        // Simplified: render each code as a group of bars
        float x = MarginPt + 10f;
        float barUnit = 0.7f;  // width of one module
        float barHeight = 25f;

        foreach (var code in codes)
        {
            var pattern = GetCode128Pattern(code);
            foreach (char bit in pattern)
            {
                if (bit == '1')
                {
                    sb.AppendLine($"0 g {F(x)} {F(y)} {F(barUnit)} {F(barHeight)} f");
                }
                x += barUnit;
            }
        }

        // Human-readable text below barcode
        y -= barHeight + 2f;
        sb.AppendLine($"BT /Courier 7 Tf {F(MarginPt + 10f)} {F(y)} Td ({EscapePdfString(data)}) Tj ET");
        y -= 8f;
    }

    private static string GetCode128Pattern(int code)
    {
        // Code 128 bar/space patterns (1=bar, 0=space), 6 elements per code
        // Simplified lookup for common codes
        string[] patterns =
        {
            "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
            "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
            "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
            "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
            "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
            "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
            "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
            "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
            "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
            "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
            "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
            "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
            "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
            "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
            "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
            "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
            "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
            "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
            "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
            "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
            "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
            "11010011100", "11000111010"
        };

        if (code >= 0 && code < patterns.Length)
            return patterns[code];
        return "11011001100"; // fallback
    }

    private static string EscapePdfString(string text)
    {
        // WinAnsi encoding for PDF strings - replace chars outside WinAnsi with '?'
        var result = new StringBuilder(text.Length);
        foreach (var ch in text)
        {
            if (ch > 255)
            {
                result.Append('?');
                continue;
            }
            switch (ch)
            {
                case '\\': result.Append("\\\\"); break;
                case '(': result.Append("\\("); break;
                case ')': result.Append("\\)"); break;
                default: result.Append(ch); break;
            }
        }
        return result.ToString();
    }

    private static string F(float value) => value.ToString("F2", CultureInfo.InvariantCulture);

    private static byte[] BuildPdf(StringBuilder content)
    {
        var contentBytes = WinAnsi.GetBytes(content.ToString());

        var sb = new StringBuilder();
        var offsets = new List<int>();

        sb.Append("%PDF-1.4\n");

        // 1: Catalog
        offsets.Add(sb.Length);
        sb.Append("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

        // 2: Pages
        offsets.Add(sb.Length);
        sb.Append("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

        // 3: Page
        offsets.Add(sb.Length);
        sb.Append($"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {F(A4WidthPt)} {F(A4HeightPt)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n");

        // 4: Content stream
        offsets.Add(sb.Length);
        sb.Append($"4 0 obj\n<< /Length {contentBytes.Length} >>\nstream\n");
        var headerBytes = WinAnsi.GetBytes(sb.ToString());
        sb.Clear();

        var footer = WinAnsi.GetBytes("\nendstream\nendobj\n");
        sb.Append(footer);

        // 5: Helvetica
        offsets.Add(sb.Length);
        sb.Append("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

        // 6: Courier (for barcode text)
        offsets.Add(sb.Length);
        sb.Append("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n");

        // xref
        var xrefOffset = headerBytes.Length + contentBytes.Length + footer.Length + WinAnsi.GetBytes(sb.ToString()).Length;
        var xref = new StringBuilder();
        xref.Append("xref\n0 7\n");
        xref.Append("0000000000 65535 f \n");
        foreach (var offset in offsets)
            xref.Append($"{offset:D10} 00000 n \n");
        xref.Append($"trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n{xrefOffset}\n%%EOF");

        var xrefBytes = WinAnsi.GetBytes(xref.ToString());
        var middleBytes = WinAnsi.GetBytes(sb.ToString());

        var result = new byte[headerBytes.Length + contentBytes.Length + footer.Length + middleBytes.Length + xrefBytes.Length];
        var pos = 0;
        Buffer.BlockCopy(headerBytes, 0, result, pos, headerBytes.Length); pos += headerBytes.Length;
        Buffer.BlockCopy(contentBytes, 0, result, pos, contentBytes.Length); pos += contentBytes.Length;
        Buffer.BlockCopy(footer, 0, result, pos, footer.Length); pos += footer.Length;
        Buffer.BlockCopy(middleBytes, 0, result, pos, middleBytes.Length); pos += middleBytes.Length;
        Buffer.BlockCopy(xrefBytes, 0, result, pos, xrefBytes.Length);
        return result;
    }
}
