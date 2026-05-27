using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using EasyInk.Engine.Models;

namespace EasyInk.Engine.Services;

/// <summary>
/// 在内存中生成测试页 PDF（无外部依赖）。
/// 使用 PDF 内置 Helvetica/Courier 字体，生成单页测试文档。
///
/// Y 坐标管理原则：
///   - y 表示当前光标位置，从页面顶部 (PageH - Margin) 向下递减
///   - 文本以基线 (baseline) 定位在 y
///   - 图形元素（线段、矩形）以顶部定位在 y
///   - 所有 y 递减由调用方显式控制，辅助方法不修改 y
/// </summary>
internal static class TestPageGenerator
{
    private const float PageW = 595.28f;
    private const float PageH = 841.89f;
    private const float Margin = 30f;

    // 文本行间距（基线到基线的额外间距）
    private const float LineGap = 1.2f;

    // 线段下方间距（从线段中心到下一条文本基线的距离，需容纳上行字母高度）
    // 8pt 字体上行高度约 5.76pt，7pt 余量确保不重叠
    private const float RuleGap = 7f;

    // 各 section 之间的额外间距
    private const float SectionGap = 2f;

    // 文本标签与下方图形块之间的间距
    private const float BlockGap = 2f;

    private static readonly Encoding WinAnsi = Encoding.GetEncoding(1252);

    // ===== Quick Test Page =====

    internal static byte[] GenerateQuick(string printerName, string printPath, TestPageMetadata? meta = null)
    {
        var sb = new StringBuilder();
        float y = PageH - Margin;
        float left = Margin;
        float right = PageW - Margin;

        EmitText(sb, left, y, 16f, "EasyInk Print Test");
        y -= 16f + LineGap + 4f;
        EmitHLine(sb, left, right, y, 0.8f);
        y -= 0.8f + RuleGap;

        EmitText(sb, left, y, 9f, $"Printer: {printerName}");
        y -= 9f + LineGap;
        EmitText(sb, left, y, 9f, $"Path: {printPath}");
        y -= 9f + LineGap;
        if (!string.IsNullOrEmpty(meta?.AppVersion))
        {
            EmitText(sb, left, y, 9f, $"App: {meta.AppVersion}");
            y -= 9f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.LanAddresses))
        {
            EmitText(sb, left, y, 9f, $"Address: {meta.LanAddresses}:{meta.HttpPort}");
            y -= 9f + LineGap;
        }
        EmitText(sb, left, y, 9f, $"Time: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        y -= 9f + LineGap + 6f;

        EmitText(sb, left, y, 12f, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        y -= 12f + LineGap;
        EmitText(sb, left, y, 12f, "abcdefghijklmnopqrstuvwxyz");
        y -= 12f + LineGap;
        EmitText(sb, left, y, 12f, "0123456789 !@#$%^&*()");

        return BuildPdf(sb);
    }

    // ===== Full Diagnostic Test Page =====

    internal static byte[] GenerateFull(string printerName, string printPath,
        bool statusReady, string? statusDetail, string? paperSize,
        TestPageMetadata? meta = null)
    {
        var sb = new StringBuilder();
        float y = PageH - Margin;
        float left = Margin;
        float right = PageW - Margin;
        float indent = Margin + 10f;

        // ===== Header =====
        EmitText(sb, left, y, 18f, "EasyInk Print Test Page");
        y -= 18f + LineGap + 2f;
        EmitHLine(sb, left, right, y, 0.8f);
        y -= 0.8f + RuleGap + SectionGap;

        // ===== System Information =====
        AppendSectionHeader(sb, ref y, left, right, "System Information");
        if (!string.IsNullOrEmpty(meta?.OsVersion))
        {
            EmitText(sb, indent, y, 8f, $"OS: {meta.OsVersion}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.DotNetVersion))
        {
            EmitText(sb, indent, y, 8f, $".NET: {meta.DotNetVersion}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.AppVersion))
        {
            EmitText(sb, indent, y, 8f, $"App Version: {meta.AppVersion}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.MachineName))
        {
            EmitText(sb, indent, y, 8f, $"Machine: {meta.MachineName}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.UserName))
        {
            EmitText(sb, indent, y, 8f, $"User: {meta.UserName}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.DeviceNumber))
        {
            EmitText(sb, indent, y, 8f, $"Device No: {meta.DeviceNumber}");
            y -= 8f + LineGap;
        }
        EmitText(sb, indent, y, 8f, $"Test Time: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}");
        y -= 8f + LineGap + SectionGap;

        // ===== Network & Service =====
        AppendSectionHeader(sb, ref y, left, right, "Network & Service");
        EmitText(sb, indent, y, 8f, $"HTTP Port: {meta?.HttpPort ?? 0}");
        y -= 8f + LineGap;
        if (!string.IsNullOrEmpty(meta?.LanAddresses))
        {
            var addrs = meta.LanAddresses.Split(new[] { '|' }, StringSplitOptions.RemoveEmptyEntries);
            if (addrs.Length > 0)
            {
                EmitText(sb, indent, y, 8f, $"LAN IPv4: {addrs[0]}");
                y -= 8f + LineGap;
                for (int i = 1; i < addrs.Length; i++)
                {
                    EmitText(sb, indent, y, 8f, $"          {addrs[i]}");
                    y -= 8f + LineGap;
                }
                EmitText(sb, indent, y, 8f, $"Service URLs: {string.Join("  ", Array.ConvertAll(addrs, a => $"http://{a}:{meta.HttpPort}"))}");
                y -= 8f + LineGap;
            }
        }
        EmitText(sb, indent, y, 8f, $"MAC Address: {meta?.MacAddresses ?? "--"}");
        y -= 8f + LineGap;
        if (!string.IsNullOrEmpty(meta?.DefaultGateway))
        {
            EmitText(sb, indent, y, 8f, $"Gateway: {meta.DefaultGateway}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.DnsServers))
        {
            EmitText(sb, indent, y, 8f, $"DNS: {meta.DnsServers}");
            y -= 8f + LineGap;
        }
        EmitText(sb, indent, y, 8f, $"API Key: {(meta?.ApiKeyEnabled ?? false ? "Enabled" : "Disabled")}");
        y -= 8f + LineGap;
        EmitText(sb, indent, y, 8f, $"Trust All Origins: {(meta?.TrustAllOrigins ?? false ? "Yes" : "No")}");
        y -= 8f + LineGap + SectionGap;

        // ===== Printer Information =====
        AppendSectionHeader(sb, ref y, left, right, "Printer Information");
        EmitText(sb, indent, y, 8f, $"Name: {printerName}");
        y -= 8f + LineGap;
        EmitText(sb, indent, y, 8f, $"Print Path: {printPath}");
        y -= 8f + LineGap;
        EmitText(sb, indent, y, 8f, $"Status Ready: {(statusReady ? "Yes" : "No")}");
        y -= 8f + LineGap;
        if (!string.IsNullOrEmpty(statusDetail))
        {
            EmitText(sb, indent, y, 8f, $"Status Detail: {statusDetail}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(paperSize))
        {
            EmitText(sb, indent, y, 8f, $"Paper Match: {paperSize}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.DriverName))
        {
            EmitText(sb, indent, y, 8f, $"Driver: {meta.DriverName}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.DefaultPaperSize))
        {
            EmitText(sb, indent, y, 8f, $"Default Paper: {meta.DefaultPaperSize}");
            y -= 8f + LineGap;
        }
        y -= SectionGap;

        // ===== Print Configuration =====
        AppendSectionHeader(sb, ref y, left, right, "Print Configuration");
        if (meta?.ConfigDpi.HasValue == true)
        {
            EmitText(sb, indent, y, 8f, $"Requested DPI: {meta.ConfigDpi.Value}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.LowDpiEnhancement))
        {
            EmitText(sb, indent, y, 8f, $"Low DPI Enhancement: {meta.LowDpiEnhancement}");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.RawPrinterNames))
        {
            EmitText(sb, indent, y, 8f, $"Raw Printers: {meta.RawPrinterNames}");
            y -= 8f + LineGap;
        }
        if (meta?.RawPrintDpi.HasValue == true)
        {
            EmitText(sb, indent, y, 8f, $"Raw DPI: {meta.RawPrintDpi.Value}");
            y -= 8f + LineGap;
        }
        if (meta?.RawPrintMaxDotsWidth.HasValue == true)
        {
            EmitText(sb, indent, y, 8f, $"Raw Max Width: {meta.RawPrintMaxDotsWidth.Value} dots");
            y -= 8f + LineGap;
        }
        if (!string.IsNullOrEmpty(meta?.SumatraPrinterNames))
        {
            EmitText(sb, indent, y, 8f, $"SumatraPDF Printers: {meta.SumatraPrinterNames}");
            y -= 8f + LineGap;
        }
        if (meta?.SumatraTimeoutSeconds.HasValue == true)
        {
            EmitText(sb, indent, y, 8f, $"SumatraPDF Timeout: {meta.SumatraTimeoutSeconds.Value}s");
            y -= 8f + LineGap;
        }
        EmitText(sb, indent, y, 8f, $"Render: {(meta?.RenderEnabled ?? false ? "Enabled" : "Disabled")}");
        y -= 8f + LineGap;
        if (meta?.MaxQueueSize.HasValue == true)
        {
            EmitText(sb, indent, y, 8f, $"Max Queue: {meta.MaxQueueSize.Value}");
            y -= 8f + LineGap;
        }
        if (meta?.MaxConcurrentRequests.HasValue == true)
        {
            EmitText(sb, indent, y, 8f, $"Max Concurrent: {meta.MaxConcurrentRequests.Value}");
            y -= 8f + LineGap;
        }
        y -= SectionGap;

        // ===== Printer Capabilities (optional) =====
        if (meta?.SupportedPaperSizes != null && meta.SupportedPaperSizes.Count > 0)
        {
            AppendSectionHeader(sb, ref y, left, right, "Printer Capabilities");
            var sizes = meta.SupportedPaperSizes.Count > 6
                ? meta.SupportedPaperSizes.GetRange(0, 6)
                : meta.SupportedPaperSizes;
            EmitText(sb, indent, y, 8f, $"Supported Papers ({meta.SupportedPaperSizes.Count} total): {string.Join(", ", sizes)}");
            y -= 8f + LineGap;
            if (meta.SupportedPaperSizes.Count > 6)
            {
                EmitText(sb, indent, y, 8f, $"  ... and {meta.SupportedPaperSizes.Count - 6} more");
                y -= 8f + LineGap;
            }
            y -= SectionGap;
        }

        // ===== Text Quality =====
        AppendSectionHeader(sb, ref y, left, right, "Text Quality");
        // Use explicit y management for varied font sizes
        EmitText(sb, indent, y, 14f, "ABCDEFGHIJKLMNOPQRSTUVWXYZ"); y -= 14f + LineGap;
        EmitText(sb, indent, y, 14f, "abcdefghijklmnopqrstuvwxyz"); y -= 14f + LineGap;
        EmitText(sb, indent, y, 14f, "0123456789 !@#$%^&*()");      y -= 14f + LineGap;
        EmitText(sb, indent, y, 14f, "The quick brown fox jumps over the lazy dog");
        y -= 14f + LineGap + 2f;
        EmitText(sb, indent, y, 10f, "Medium: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789"); y -= 10f + LineGap;
        EmitText(sb, indent, y, 8f,  "Small:  ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789"); y -= 8f + LineGap;
        EmitText(sb, indent, y, 7f,  "Tiny:   ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789"); y -= 7f + LineGap;
        y -= 2f;
        EmitText(sb, indent, y, 9f, "CJK: 中文测试 日本語テスト 한국어테스트");
        y -= 9f + LineGap + SectionGap;

        // ===== Line & Alignment =====
        AppendSectionHeader(sb, ref y, left, right, "Line & Alignment");
        float markLen = 18f;

        // Top-left corner mark (L shape at current y)
        EmitLineSeg(sb, left, y, left + markLen, y, 0.8f);
        EmitLineSeg(sb, left, y, left, y - markLen, 0.8f);
        // Top-right corner mark
        EmitLineSeg(sb, right, y, right - markLen, y, 0.8f);
        EmitLineSeg(sb, right, y, right, y - markLen, 0.8f);
        y -= markLen + 6f;

        EmitText(sb, indent, y, 8f, "Corner alignment marks (top-left & top-right shown above)");
        y -= 8f + LineGap;

        // Horizontal rules at different thicknesses
        EmitText(sb, indent, y, 8f, "Horizontal rules (0.5pt / 1pt / 2pt):");
        y -= 8f + LineGap + 2f;
        EmitHLine(sb, left, right, y, 0.5f);
        y -= 0.5f + 2f;
        EmitHLine(sb, left, right, y, 1.0f);
        y -= 1.0f + 2f;
        EmitHLine(sb, left, right, y, 2.0f);
        y -= 2.0f + RuleGap + SectionGap;

        // ===== Diagnostic Elements =====
        AppendSectionHeader(sb, ref y, left, right, "Diagnostic Elements");

        // Grayscale blocks
        EmitText(sb, indent, y, 8f, "Grayscale: 100%   75%   50%   25%   10%");
        y -= 8f + LineGap + BlockGap;
        EmitGrayBlocks(sb, indent, y, 50f, 20f, 8f, new[] { 0f, 0.25f, 0.5f, 0.75f, 0.9f });
        // Rectangles extend upward from y. Bottom at y-20, top at y.
        y -= 20f + BlockGap + SectionGap;

        // Code 128 barcode
        var barcodeData = $"EASYINK-{DateTime.Now:yyyyMMdd}";
        EmitText(sb, indent, y, 8f, $"Barcode (Code 128): {barcodeData}");
        y -= 8f + LineGap + BlockGap;
        float barUnit = 0.7f;
        float barHeight = 25f;
        // Bars extend upward from y. Bottom at y-barHeight, top at y.
        EmitCode128Bars(sb, indent, y, barUnit, barHeight, barcodeData);
        y -= barHeight + 2f; // 2pt gap below bars to human-readable text
        EmitText(sb, indent, y, 7f, barcodeData, font: "Courier");
        y -= 7f + LineGap + SectionGap;

        // ===== Bottom corner marks & Footer =====
        float botY = Margin + markLen + 4f; // bottom corner position (above footer)
        // Bottom-left corner mark (L shape opening upward-rightward)
        EmitLineSeg(sb, left, botY + markLen, left + markLen, botY + markLen, 0.8f);
        EmitLineSeg(sb, left, botY + markLen, left, botY, 0.8f);
        // Bottom-right corner mark
        EmitLineSeg(sb, right, botY + markLen, right - markLen, botY + markLen, 0.8f);
        EmitLineSeg(sb, right, botY + markLen, right, botY, 0.8f);

        y -= SectionGap;
        EmitHLine(sb, left, right, y, 0.8f);
        y -= 0.8f + 4f;
        EmitText(sb, indent, y, 7f, "Generated by EasyInk Printer | https://github.com/nicepkg/easyink");

        return BuildPdf(sb);
    }

    // ===== Layout helpers (manage y internally for common patterns) =====

    /// <summary>
    /// 输出 section 标题文字 + 细分割线，并更新 y 到下一条内容基线的位置。
    /// </summary>
    private static void AppendSectionHeader(StringBuilder sb, ref float y, float left, float right, string title)
    {
        EmitText(sb, left, y, 10f, title);
        y -= 10f + LineGap + 1f;
        EmitHLine(sb, left, right, y, 0.3f);
        y -= 0.3f + RuleGap;
    }

    // ===== PDF drawing primitives (do NOT modify y) =====

    /// <summary>
    /// 在指定基线位置渲染文本（Helvetica, WinAnsi 编码）。
    /// y 不会被修改。
    /// </summary>
    private static void EmitText(StringBuilder sb, float x, float y, float size, string text, string font = "/F1")
    {
        var escaped = EscapePdfString(text);
        sb.AppendLine($"BT {font} {F(size)} Tf {F(x)} {F(y)} Td ({escaped}) Tj ET");
    }

    /// <summary>
    /// 渲染水平线段，线宽 width，中心在 y。
    /// </summary>
    private static void EmitHLine(StringBuilder sb, float x1, float x2, float y, float width)
    {
        sb.AppendLine($"{F(width)} w {F(x1)} {F(y)} m {F(x2)} {F(y)} l S");
    }

    /// <summary>
    /// 渲染单条线段。
    /// </summary>
    private static void EmitLineSeg(StringBuilder sb, float x1, float y1, float x2, float y2, float width)
    {
        sb.AppendLine($"{F(width)} w {F(x1)} {F(y1)} m {F(x2)} {F(y2)} l S");
    }

    /// <summary>
    /// 渲染一排灰度矩形。每个矩形的左下角在 (x, y - h)，右上角在 (x + w, y)。
    /// 即矩形从 y 向上延伸 h。
    /// </summary>
    private static void EmitGrayBlocks(StringBuilder sb, float x, float y, float w, float h, float gap, float[] grays)
    {
        foreach (var gray in grays)
        {
            // PDF rect: (x, y-h) 到 (x+w, y)
            sb.AppendLine($"{F(gray)} g {F(x)} {F(y - h)} {F(w)} {F(h)} f 0 g");
            x += w + gap;
        }
    }

    /// <summary>
    /// 渲染 Code 128B 条形码的黑色竖条。bars 从 y 向上延伸 barHeight。
    /// 不绘制 human-readable 文字（由调用方用 EmitText 单独处理）。
    /// </summary>
    private static void EmitCode128Bars(StringBuilder sb, float x, float y, float barUnit, float barHeight, string data)
    {
        var codes = new List<int> { 104 }; // Start B
        int checksum = 104;
        for (int i = 0; i < data.Length; i++)
        {
            int code = data[i] - 32;
            codes.Add(code);
            checksum += code * (i + 1);
        }
        codes.Add(checksum % 103);
        codes.Add(106); // Stop

        foreach (var code in codes)
        {
            var pattern = GetCode128Pattern(code);
            foreach (char bit in pattern)
            {
                if (bit == '1')
                    sb.AppendLine($"0 g {F(x)} {F(y - barHeight)} {F(barUnit)} {F(barHeight)} f");
                x += barUnit;
            }
        }
    }

    // ===== Code 128 patterns =====

    private static string GetCode128Pattern(int code)
    {
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
        return "11011001100";
    }

    // ===== PDF string utilities =====

    private static string EscapePdfString(string text)
    {
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

    // ===== PDF document assembly =====

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
        sb.Append($"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {F(PageW)} {F(PageH)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n");

        // 4: Content stream
        offsets.Add(sb.Length);
        sb.Append($"4 0 obj\n<< /Length {contentBytes.Length} >>\nstream\n");
        var headerBytes = WinAnsi.GetBytes(sb.ToString());
        var footer = WinAnsi.GetBytes("\nendstream\nendobj\n");

        var baseOffset = headerBytes.Length + contentBytes.Length + footer.Length;

        sb.Clear();

        // 5: Helvetica
        offsets.Add(baseOffset + sb.Length);
        sb.Append("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

        // 6: Courier
        offsets.Add(baseOffset + sb.Length);
        sb.Append("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n");

        // xref
        var middleBytes = WinAnsi.GetBytes(sb.ToString());
        var xrefOffset = baseOffset + middleBytes.Length;
        var xref = new StringBuilder();
        xref.Append("xref\n0 7\n");
        xref.Append("0000000000 65535 f \n");
        foreach (var offset in offsets)
            xref.Append($"{offset:D10} 00000 n \n");
        xref.Append($"trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n{xrefOffset}\n%%EOF");

        var xrefBytes = WinAnsi.GetBytes(xref.ToString());

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
