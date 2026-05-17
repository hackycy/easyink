using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EasyInk.Printer.Services.Abstractions;

namespace EasyInk.Printer.UI.Presenters;

internal interface ILogsView
{
    void RunOnUiThread(Action action);
    void SetBusy(bool busy);
    void SetError(string? message);
    void SetRows(IReadOnlyList<ListViewRow> rows);
}

internal sealed class LogsPresenter : IDisposable
{
    private readonly IAuditService _auditService;
    private ILogsView? _view;
    private bool _isRefreshing;
    private bool _disposed;

    public LogsPresenter(IAuditService auditService)
    {
        _auditService = auditService;
    }

    public void Attach(ILogsView view)
    {
        _view = view ?? throw new ArgumentNullException(nameof(view));
    }

    public Task RefreshDefaultAsync()
    {
        return RefreshAsync(DateTime.Today.AddDays(-7), DateTime.Now);
    }

    public async Task RefreshAsync(DateTime from, DateTime to)
    {
        if (_disposed || _isRefreshing || _view == null) return;

        if (from > to)
        {
            var tmp = from;
            from = to;
            to = tmp;
        }

        _isRefreshing = true;
        _view.SetBusy(true);
        _view.SetError(null);
        _view.SetRows(Array.Empty<ListViewRow>());

        try
        {
            var rows = await Task.Run(() => LoadRows(from, to)).ConfigureAwait(false);
            Post(view =>
            {
                view.SetRows(rows);
                view.SetError(null);
            });
        }
        catch (ObjectDisposedException)
        {
        }
        catch (Exception ex)
        {
            Post(view => view.SetError(LangManager.Get("Error_QueryLogs", ex.Message)));
        }
        finally
        {
            Post(view => view.SetBusy(false));
            _isRefreshing = false;
        }
    }

    public void Dispose()
    {
        _disposed = true;
        _view = null;
    }

    private IReadOnlyList<ListViewRow> LoadRows(DateTime from, DateTime to)
    {
        var logs = _auditService.QueryLogs(from, to, limit: 200);
        var rows = new List<ListViewRow>();
        foreach (var log in logs)
        {
            rows.Add(new ListViewRow(
                log.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"),
                log.PrinterName,
                log.Status,
                log.UserId ?? string.Empty,
                log.LabelType ?? string.Empty,
                log.JobId ?? string.Empty,
                log.ErrorMessage ?? string.Empty));
        }

        return rows;
    }

    private void Post(Action<ILogsView> update)
    {
        var view = _view;
        if (_disposed || view == null) return;

        view.RunOnUiThread(() =>
        {
            if (_disposed) return;
            update(view);
        });
    }
}
