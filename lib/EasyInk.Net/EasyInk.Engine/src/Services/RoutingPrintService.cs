using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;

namespace EasyInk.Engine.Services;

/// <summary>
/// 打印路由服务：根据打印机名称判断走哪种打印路径。
/// SumatraPDF fallback → Raw ESC/POS → PrintDocument (GDI)。
/// </summary>
public class RoutingPrintService : IPrintService
{
    private readonly IPrintService _gdiService;
    private readonly IPrintService _rawService;
    private readonly IPrintService? _sumatraService;
    private readonly List<string> _rawPrinterPatterns;
    private readonly List<string> _sumatraPrinterPatterns;

    public RoutingPrintService(IPrintService gdiService, IPrintService rawService, IEnumerable<string> rawPrinterNames)
        : this(gdiService, rawService, rawPrinterNames, null, null)
    {
    }

    public RoutingPrintService(
        IPrintService gdiService,
        IPrintService rawService,
        IEnumerable<string> rawPrinterNames,
        IPrintService? sumatraService,
        IEnumerable<string>? sumatraPrinterNames)
    {
        _gdiService = gdiService ?? throw new ArgumentNullException(nameof(gdiService));
        _rawService = rawService ?? throw new ArgumentNullException(nameof(rawService));
        _sumatraService = sumatraService;
        _rawPrinterPatterns = (rawPrinterNames ?? Array.Empty<string>())
            .Select(s => s.Trim())
            .Where(s => s.Length > 0)
            .ToList();
        _sumatraPrinterPatterns = (sumatraPrinterNames ?? Array.Empty<string>())
            .Select(s => s.Trim())
            .Where(s => s.Length > 0)
            .ToList();
    }

    public PrinterResult Print(string requestId, PrintRequestParams request, CancellationToken cancellationToken = default)
    {
        return SelectService(request.PrinterName).Print(requestId, request, cancellationToken);
    }

    /// <summary>
    /// 获取指定打印机会使用的打印路径名称（供测试/诊断使用）
    /// </summary>
    internal string GetPrintPathName(string printerName)
    {
        var service = SelectService(printerName);
        if (service == _sumatraService) return "SumatraPDF";
        if (service == _rawService) return "Raw (ESC/POS)";
        return "GDI (Pdfium)";
    }

    private IPrintService SelectService(string printerName)
    {
        if (string.IsNullOrEmpty(printerName))
            return _gdiService;

        if (_sumatraService != null &&
            _sumatraPrinterPatterns.Any(p => printerName.IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0))
            return _sumatraService;

        return _rawPrinterPatterns.Any(p => printerName.IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0)
            ? _rawService
            : _gdiService;
    }
}
