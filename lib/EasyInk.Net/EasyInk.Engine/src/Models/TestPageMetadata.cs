using System.Collections.Generic;

namespace EasyInk.Engine.Models;

/// <summary>
/// 测试页元数据 - 由宿主层填充，注入到测试页生成
/// </summary>
public class TestPageMetadata
{
    // System
    public string? OsVersion { get; set; }
    public string? DotNetVersion { get; set; }
    public string? AppVersion { get; set; }
    public string? MachineName { get; set; }
    public string? UserName { get; set; }
    public string? DeviceNumber { get; set; }

    // Network
    public int HttpPort { get; set; }
    public string? LanAddresses { get; set; }
    public string? MacAddresses { get; set; }
    public string? DefaultGateway { get; set; }
    public string? DnsServers { get; set; }
    public bool ApiKeyEnabled { get; set; }
    public bool TrustAllOrigins { get; set; }

    // Print Config
    public int? ConfigDpi { get; set; }
    public string? LowDpiEnhancement { get; set; }
    public string? RawPrinterNames { get; set; }
    public int? RawPrintDpi { get; set; }
    public int? RawPrintMaxDotsWidth { get; set; }
    public string? SumatraPrinterNames { get; set; }
    public int? SumatraTimeoutSeconds { get; set; }
    public bool RenderEnabled { get; set; }
    public int? MaxQueueSize { get; set; }
    public int? MaxConcurrentRequests { get; set; }

    // Printer Capabilities
    public string? DriverName { get; set; }
    public string? DefaultPaperSize { get; set; }
    public List<string>? SupportedPaperSizes { get; set; }
}
