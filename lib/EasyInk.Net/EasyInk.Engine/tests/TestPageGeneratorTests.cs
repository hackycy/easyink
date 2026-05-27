using System.Linq;
using System.Text;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services;
using Xunit;

namespace EasyInk.Engine.Tests;

public class TestPageGeneratorTests
{
    private static string Ascii(byte[] pdf) => Encoding.GetEncoding(1252).GetString(pdf);

    [Fact]
    public void GenerateQuick_ProducesValidPdfHeaderAndTrailer()
    {
        var pdf = InvokeQuick("PrinterA", "GDI (Pdfium)", null);

        Assert.True(pdf.Length > 100);
        var text = Ascii(pdf);
        Assert.StartsWith("%PDF-1.4", text);
        Assert.EndsWith("%%EOF", text);
        Assert.Contains("/Type /Catalog", text);
        Assert.Contains("EasyInk Print Test", text);
        Assert.Contains("PrinterA", text);
    }

    [Fact]
    public void GenerateQuick_WithLanAddresses_SplitsByPipeAndBuildsServiceUrl()
    {
        var meta = new TestPageMetadata
        {
            HttpPort = 17521,
            LanAddresses = "192.168.1.10|10.0.0.5",
            AppVersion = "1.2.3"
        };
        var pdf = InvokeQuick("PrinterA", "Sumatra", meta);
        var text = Ascii(pdf);

        Assert.Contains("http://192.168.1.10:17521", text);
        Assert.Contains("http://10.0.0.5:17521", text);
        // 旧实现错误的拼接 "{LanAddresses}:{Port}" 在此不应出现
        Assert.DoesNotContain("192.168.1.10|10.0.0.5:17521", text);
    }

    [Fact]
    public void GenerateFull_ContainsAllPopulatedSections()
    {
        var meta = new TestPageMetadata
        {
            OsVersion = "Win10",
            DotNetVersion = "4.8",
            AppVersion = "1.0.0",
            MachineName = "PC-1",
            UserName = "user",
            DeviceNumber = "ABCD-1234",
            HttpPort = 8080,
            LanAddresses = "192.168.0.1",
            MacAddresses = "AA:BB:CC:DD:EE:FF",
            ApiKeyEnabled = true,
            TrustAllOrigins = false,
            RawPrintDpi = 203,
            SumatraTimeoutSeconds = 30,
            RenderEnabled = true,
            DriverName = "Generic / Text Only",
            DefaultPaperSize = "A4",
            SupportedPaperSizes = Enumerable.Range(0, 8).Select(i => $"Paper{i}").ToList()
        };
        var pdf = InvokeFull("HP", "Sumatra", true, "Ready", "PaperKind=A4", meta);
        var text = Ascii(pdf);

        Assert.Contains("System Information", text);
        Assert.Contains("Network & Service", text);
        Assert.Contains("Printer Information", text);
        Assert.Contains("Print Configuration", text);
        Assert.Contains("Printer Capabilities", text);
        Assert.Contains("Generic / Text Only", text);
        Assert.Contains("AA:BB:CC:DD:EE:FF", text);
        Assert.Contains("and 2 more", text);
    }

    [Fact]
    public void GenerateFull_AutoPaginates_WhenContentOverflows()
    {
        // 大量纸张 + 长字段 → 触发自动分页
        var meta = new TestPageMetadata
        {
            HttpPort = 80,
            LanAddresses = string.Join("|", Enumerable.Range(0, 120).Select(i => $"10.0.{i / 256}.{i % 256}")),
            SupportedPaperSizes = Enumerable.Range(0, 200).Select(i => $"PaperItemNumber{i}").ToList()
        };
        var pdf = InvokeFull("HP", "GDI", true, "Ready", "PaperKind=A4", meta);
        var text = Ascii(pdf);

        // 内容超长应自动分页（>= 2 页）
        var match = System.Text.RegularExpressions.Regex.Match(text, @"/Count\s+(\d+)");
        Assert.True(match.Success, "missing /Count in Pages object");
        var pageCount = int.Parse(match.Groups[1].Value);
        Assert.True(pageCount >= 2, $"expected >=2 pages, got {pageCount}");
    }

    [Fact]
    public void GenerateFull_LeavesEnoughGap_BetweenSectionRuleAndFirstKeyValue()
    {
        var meta = new TestPageMetadata
        {
            OsVersion = "Win10"
        };

        var pdf = InvokeFull("HP", "Sumatra", true, "Ready", "PaperKind=A4", meta);
        var text = Ascii(pdf);
        var match = System.Text.RegularExpressions.Regex.Match(
            text,
            @"0\.30 w 30\.00 (?<rule>\d+\.\d+) m 565\.28 (?<ruleEnd>\d+\.\d+) l S\s+BT /F1 8\.00 Tf 36\.00 (?<baseline>\d+\.\d+) Td \(OS: Win10\) Tj ET",
            System.Text.RegularExpressions.RegexOptions.Singleline);

        Assert.True(match.Success, "missing section rule or first key/value row in generated PDF stream");

        var ruleY = float.Parse(match.Groups["rule"].Value, System.Globalization.CultureInfo.InvariantCulture);
        var baselineY = float.Parse(match.Groups["baseline"].Value, System.Globalization.CultureInfo.InvariantCulture);

        Assert.True(ruleY - baselineY >= 10f,
            $"expected section rule to stay at least 10pt above first key/value baseline, got {ruleY - baselineY:F2}pt");
    }

    [Fact]
    public void DumpFullPdfForVisualInspection()
    {
        var meta = new TestPageMetadata
        {
            OsVersion = System.Environment.OSVersion.ToString(),
            DotNetVersion = System.Environment.Version.ToString(),
            AppVersion = "1.2.3",
            MachineName = System.Environment.MachineName,
            UserName = System.Environment.UserName,
            DeviceNumber = "ABCD-1234",
            HttpPort = 17521,
            LanAddresses = "192.168.1.10|10.0.0.5",
            MacAddresses = "AA:BB:CC:DD:EE:FF",
            DefaultGateway = "192.168.1.1",
            DnsServers = "8.8.8.8",
            ApiKeyEnabled = true,
            TrustAllOrigins = false,
            LowDpiEnhancement = "boost",
            RawPrintDpi = 203,
            RawPrintMaxDotsWidth = 576,
            SumatraTimeoutSeconds = 30,
            RenderEnabled = false,
            MaxQueueSize = 100,
            MaxConcurrentRequests = 4,
            DriverName = "Generic / Text Only",
            DefaultPaperSize = "A4",
            SupportedPaperSizes = new System.Collections.Generic.List<string> { "A4", "A5", "Letter", "Legal", "B5", "Custom", "Other" }
        };
        var pdf = InvokeFull("HP LaserJet", "GDI (Pdfium)", true, "Ready", "PaperKind=A4", meta);
        var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "easyink-full-test.pdf");
        System.IO.File.WriteAllBytes(path, pdf);
        System.Console.WriteLine($"PDF written to: {path} ({pdf.Length} bytes)");
        Assert.True(pdf.Length > 500);
    }

    // 反射调用 internal 方法（生成器是 internal static）
    private static byte[] InvokeQuick(string printer, string path, TestPageMetadata? meta)
    {
        var t = typeof(PrintTestService).Assembly.GetType("EasyInk.Engine.Services.TestPageGenerator", true)!;
        var m = t.GetMethod("GenerateQuick",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        return (byte[])m.Invoke(null, new object?[] { printer, path, meta })!;
    }

    private static byte[] InvokeFull(string printer, string path, bool ready, string? detail, string? paper, TestPageMetadata? meta)
    {
        var t = typeof(PrintTestService).Assembly.GetType("EasyInk.Engine.Services.TestPageGenerator", true)!;
        var m = t.GetMethod("GenerateFull",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        return (byte[])m.Invoke(null, new object?[] { printer, path, ready, detail, paper, meta })!;
    }
}
