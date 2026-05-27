using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Printer.Api;

namespace EasyInk.Printer.UI.Presenters;

internal sealed class PrintersPresenter : ListPagePresenter
{
    private readonly EngineApi _api;
    private readonly TestController _testController;

    public PrintersPresenter(EngineApi api, TestController testController)
        : base("Error_GetPrinters")
    {
        _api = api;
        _testController = testController;
    }

    public async Task<PrinterTestResult> TestPrinterAsync(string printerName, PrinterTestLevel level)
    {
        return await Task.Run(() =>
        {
            // 通过 TestController 走，确保 metadata（系统/网络/打印配置信息）被构建并传入测试页
            var result = _testController.TestPrinter(printerName, LevelToString(level));
            if (!result.Success)
                throw new InvalidOperationException(result.ErrorInfo?.Message ?? LangManager.Get("Api_InternalError"));
            if (result.Data is PrinterTestResult testResult)
                return testResult;
            throw new InvalidOperationException(LangManager.Get("Api_InternalError"));
        }).ConfigureAwait(false);
    }

    private static string LevelToString(PrinterTestLevel level) => level switch
    {
        PrinterTestLevel.Connectivity => "connectivity",
        PrinterTestLevel.Full => "full",
        _ => "quick"
    };

    protected override PrinterResult FetchData()
    {
        return _api.GetPrinters();
    }

    protected override IReadOnlyList<ListViewRow> MapRows(PrinterResult result)
    {
        if (result.Data is not List<PrinterInfo> printers)
            return new List<ListViewRow>();

        var rows = new List<ListViewRow>();
        foreach (var printer in printers)
        {
            rows.Add(new ListViewRow(
                printer.Name,
                printer.IsDefault ? LangManager.Get("Common_Yes") : string.Empty,
                printer.Status?.Message ?? string.Empty,
                printer.Status?.IsOnline == true ? LangManager.Get("Common_Yes") : LangManager.Get("Common_No"),
                printer.Status?.HasPaper == true ? LangManager.Get("Common_Yes") : LangManager.Get("Common_No")));
        }

        return rows;
    }
}
