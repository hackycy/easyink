using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EasyInk.Engine;
using EasyInk.Engine.Models;

namespace EasyInk.Printer.UI.Presenters;

internal sealed class PrintersPresenter : ListPagePresenter
{
    private readonly EngineApi _api;

    public PrintersPresenter(EngineApi api)
        : base("Error_GetPrinters")
    {
        _api = api;
    }

    public async Task<PrinterTestResult> TestPrinterAsync(string printerName, PrinterTestLevel level)
    {
        return await Task.Run(() =>
        {
            var result = _api.TestPrinter(Guid.NewGuid().ToString(), printerName, level);
            if (!result.Success)
                throw new InvalidOperationException(result.ErrorInfo?.Message ?? LangManager.Get("Api_InternalError"));
            if (result.Data is PrinterTestResult testResult)
                return testResult;
            throw new InvalidOperationException(LangManager.Get("Api_InternalError"));
        }).ConfigureAwait(false);
    }

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
