using System;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.Linq;
using System.Net.NetworkInformation;
using System.Reflection;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;
using EasyInk.Printer.Config;
using EasyInk.Printer.Utils;

namespace EasyInk.Printer.Api;

public class TestController
{
    private readonly EngineApi _api;
    private readonly IPrinterService _printerService;
    private readonly HostConfig _config;

    public TestController(EngineApi api, IPrinterService printerService, HostConfig config)
    {
        _api = api;
        _printerService = printerService;
        _config = config;
    }

    public PrinterResult TestPrinter(string printerName, string level)
    {
        var testLevel = ParseLevel(level);
        var requestId = Guid.NewGuid().ToString();
        var metadata = BuildMetadata(printerName);
        return _api.TestPrinter(requestId, printerName, testLevel, metadata);
    }

    private TestPageMetadata BuildMetadata(string printerName)
    {
        var lanAddrs = NetworkHelper.GetLanIpv4Addresses();
        var macAddrs = NetworkHelper.GetActivePhysicalMacs();

        var meta = new TestPageMetadata
        {
            // System
            OsVersion = Environment.OSVersion.ToString(),
            DotNetVersion = Environment.Version.ToString(),
            AppVersion = VersionHelper.GetDisplayVersion(Assembly.GetEntryAssembly() ?? Assembly.GetExecutingAssembly()),
            MachineName = Environment.MachineName,
            UserName = Environment.UserName,
            DeviceNumber = NetworkHelper.GenerateDeviceNumber(),

            // Network
            HttpPort = _config.HttpPort,
            LanAddresses = string.Join("|", lanAddrs),
            MacAddresses = macAddrs.Count > 0 ? string.Join(", ", macAddrs) : null,
            DefaultGateway = GetDefaultGateway(),
            DnsServers = GetDnsServers(),
            ApiKeyEnabled = !string.IsNullOrEmpty(_config.ApiKey),
            TrustAllOrigins = _config.TrustAllOrigins,

            // Print Config
            ConfigDpi = _config.RawPrintDpi,
            LowDpiEnhancement = _config.LowDpiPrintEnhancement,
            RawPrinterNames = _config.RawPrinterNames.Count > 0 ? string.Join(", ", _config.RawPrinterNames) : null,
            RawPrintDpi = _config.RawPrintDpi,
            RawPrintMaxDotsWidth = _config.RawPrintMaxDotsWidth,
            SumatraPrinterNames = _config.SumatraPrinterNames.Count > 0 ? string.Join(", ", _config.SumatraPrinterNames) : null,
            SumatraTimeoutSeconds = _config.SumatraTimeoutSeconds,
            RenderEnabled = _config.RenderEnabled,
            MaxQueueSize = _config.MaxQueueSize,
            MaxConcurrentRequests = _config.MaxConcurrentRequests,

            // Printer Capabilities
            DefaultPaperSize = GetDefaultPaperSize(printerName),
            SupportedPaperSizes = GetSupportedPaperSizeNames(printerName)
        };

        return meta;
    }

    private List<string> GetSupportedPaperSizeNames(string printerName)
    {
        try
        {
            var printers = _printerService.GetPrinters();
            var printer = printers.FirstOrDefault(p =>
                string.Equals(p.Name, printerName, StringComparison.OrdinalIgnoreCase));
            if (printer?.SupportedPaperSizes != null)
                return printer.SupportedPaperSizes.Select(s => s.Name).ToList();
        }
        catch { }
        return new List<string>();
    }

    private static string? GetDefaultPaperSize(string printerName)
    {
        try
        {
            var settings = new PrinterSettings { PrinterName = printerName };
            return settings.DefaultPageSettings.PaperSize.PaperName;
        }
        catch { return null; }
    }

    private static string? GetDefaultGateway()
    {
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                var gateways = nic.GetIPProperties().GatewayAddresses;
                foreach (var gw in gateways)
                {
                    var addr = gw.Address.ToString();
                    if (!string.IsNullOrEmpty(addr) && addr != "0.0.0.0")
                        return addr;
                }
            }
        }
        catch { }
        return null;
    }

    private static string? GetDnsServers()
    {
        try
        {
            var servers = new List<string>();
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (var dns in nic.GetIPProperties().DnsAddresses)
                {
                    var addr = dns.ToString();
                    if (!servers.Contains(addr))
                        servers.Add(addr);
                }
            }
            return servers.Count > 0 ? string.Join(", ", servers) : null;
        }
        catch { return null; }
    }

    private static PrinterTestLevel ParseLevel(string value)
    {
        return string.Equals(value, "connectivity", StringComparison.OrdinalIgnoreCase)
            ? PrinterTestLevel.Connectivity
            : string.Equals(value, "full", StringComparison.OrdinalIgnoreCase)
                ? PrinterTestLevel.Full
                : PrinterTestLevel.Quick;
    }
}
