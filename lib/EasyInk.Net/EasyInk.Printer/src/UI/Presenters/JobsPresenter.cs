using System.Collections.Generic;
using EasyInk.Engine;
using EasyInk.Engine.Models;

namespace EasyInk.Printer.UI.Presenters;

internal sealed class JobsPresenter : ListPagePresenter
{
    private readonly EngineApi _api;

    public JobsPresenter(EngineApi api)
        : base("Error_GetJobs")
    {
        _api = api;
    }

    protected override PrinterResult FetchData()
    {
        return _api.GetAllJobs();
    }

    protected override IReadOnlyList<ListViewRow> MapRows(PrinterResult result)
    {
        if (result.Data is not List<PrintJob> jobs)
            return new List<ListViewRow>();

        var rows = new List<ListViewRow>();
        foreach (var job in jobs)
        {
            rows.Add(new ListViewRow(
                job.JobId,
                job.PrinterName,
                job.Status.ToString(),
                job.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                job.ErrorMessage ?? string.Empty));
        }

        return rows;
    }
}
