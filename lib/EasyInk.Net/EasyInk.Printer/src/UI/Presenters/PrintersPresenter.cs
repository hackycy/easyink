using System.Collections.Generic;
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
