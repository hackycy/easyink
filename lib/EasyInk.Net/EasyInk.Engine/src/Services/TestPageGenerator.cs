using System;
using System.Collections.Generic;
using System.Linq;
using EasyInk.Engine.Models;

namespace EasyInk.Engine.Services;

/// <summary>
/// 在内存中生成测试页 PDF（无外部依赖）。
///
/// 排版完全由 <see cref="PdfPageBuilder"/> 负责，本类只描述各 section 的内容顺序，
/// 不直接计算坐标。空间不够时由 builder 自动分页。
/// </summary>
internal static class TestPageGenerator
{
    // ===== Quick =====

    internal static byte[] GenerateQuick(string printerName, string printPath, TestPageMetadata? meta = null)
    {
        var b = new PdfPageBuilder();

        b.Text("EasyInk Print Test", 16f);
        b.Hr(0.8f);
        b.Spacer(2f);

        b.KeyValue("Printer", printerName, 9f, indent: 0f);
        b.KeyValue("Path", printPath, 9f, indent: 0f);
        b.KeyValue("App", meta?.AppVersion, 9f, indent: 0f);
        foreach (var url in BuildServiceUrls(meta))
            b.KeyValue("Service", url, 9f, indent: 0f);
        b.KeyValue("Time", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), 9f, indent: 0f);

        return b.Build();
    }

    // ===== Full =====

    internal static byte[] GenerateFull(string printerName, string printPath,
        bool statusReady, string? statusDetail, string? paperSize, TestPageMetadata? meta = null)
    {
        var b = new PdfPageBuilder();

        // Header
        b.Text("EasyInk Print Test Page", 18f);
        b.Hr(0.8f);

        // System
        b.Section("System Information");
        b.KeyValue("OS", meta?.OsVersion);
        b.KeyValue(".NET", meta?.DotNetVersion);
        b.KeyValue("App Version", meta?.AppVersion);
        b.KeyValue("Machine", meta?.MachineName);
        b.KeyValue("User", meta?.UserName);
        b.KeyValue("Device No", meta?.DeviceNumber);
        b.KeyValue("Test Time", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"));

        // Network
        b.Section("Network & Service");
        b.KeyValue("HTTP Port", meta is { HttpPort: > 0 } ? meta.HttpPort.ToString() : null);
        foreach (var ip in SplitAddresses(meta?.LanAddresses))
            b.KeyValue("LAN IPv4", ip);
        b.KeyValue("MAC Address", meta?.MacAddresses);
        b.KeyValue("Gateway", meta?.DefaultGateway);
        b.KeyValue("DNS", meta?.DnsServers);
        foreach (var url in BuildServiceUrls(meta))
            b.KeyValue("Service URL", url);
        b.KeyValue("API Key", meta is null ? null : (meta.ApiKeyEnabled ? "Enabled" : "Disabled"));
        b.KeyValue("Trust All Origins", meta is null ? null : (meta.TrustAllOrigins ? "Yes" : "No"));

        // Printer Info
        b.Section("Printer Information");
        b.KeyValue("Name", printerName);
        b.KeyValue("Print Path", printPath);
        b.KeyValue("Status Ready", statusReady ? "Yes" : "No");
        b.KeyValue("Status Detail", statusDetail);
        b.KeyValue("Paper Match", paperSize);
        b.KeyValue("Driver", meta?.DriverName);
        b.KeyValue("Default Paper", meta?.DefaultPaperSize);

        // Print Config
        b.Section("Print Configuration");
        b.KeyValue("Low DPI Enhancement", meta?.LowDpiEnhancement);
        b.KeyValue("Raw Printers", meta?.RawPrinterNames);
        b.KeyValue("Raw DPI", meta?.RawPrintDpi?.ToString());
        b.KeyValue("Raw Max Width",
            meta?.RawPrintMaxDotsWidth is int w ? $"{w} dots" : null);
        b.KeyValue("SumatraPDF Printers", meta?.SumatraPrinterNames);
        b.KeyValue("SumatraPDF Timeout",
            meta?.SumatraTimeoutSeconds is int s ? $"{s}s" : null);
        b.KeyValue("Render", meta is null ? null : (meta.RenderEnabled ? "Enabled" : "Disabled"));
        b.KeyValue("Max Queue", meta?.MaxQueueSize?.ToString());
        b.KeyValue("Max Concurrent", meta?.MaxConcurrentRequests?.ToString());

        // Capabilities
        if (meta?.SupportedPaperSizes is { Count: > 0 } sizes)
        {
            b.Section("Printer Capabilities");
            b.KeyValue("Supported Papers", $"{sizes.Count} total");
            var preview = sizes.Take(6).ToList();
            b.KeyValue("Names", string.Join(", ", preview));
            if (sizes.Count > preview.Count)
                b.Text($"  ... and {sizes.Count - preview.Count} more", 8f, indent: 6f);
        }

        return b.Build();
    }

    // ===== Helpers =====

    private static IEnumerable<string> SplitAddresses(string? joined)
    {
        if (string.IsNullOrEmpty(joined)) yield break;
        foreach (var part in joined.Split(new[] { '|' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = part.Trim();
            if (trimmed.Length > 0) yield return trimmed;
        }
    }

    private static IEnumerable<string> BuildServiceUrls(TestPageMetadata? meta)
    {
        if (meta == null || meta.HttpPort <= 0) yield break;
        foreach (var ip in SplitAddresses(meta.LanAddresses))
            yield return $"http://{ip}:{meta.HttpPort}";
    }
}
