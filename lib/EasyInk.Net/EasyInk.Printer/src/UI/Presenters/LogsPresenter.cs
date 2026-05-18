using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
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
    private static readonly char[] CsvEscapeChars = { ',', '"', '\r', '\n' };
    private readonly IAuditService _auditService;
    private ILogsView? _view;
    private bool _isBusy;
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
        if (_disposed || _isBusy || _view == null) return;

        NormalizeRange(ref from, ref to);

        _isBusy = true;
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
            _isBusy = false;
        }
    }

    public async Task<int?> ExportCsvAsync(DateTime from, DateTime to, string filePath)
    {
        if (_disposed || _isBusy || _view == null) return null;

        NormalizeRange(ref from, ref to);

        _isBusy = true;
        _view.SetBusy(true);
        _view.SetError(null);

        try
        {
            var count = await Task.Run(() => ExportRows(filePath, from, to)).ConfigureAwait(false);
            Post(view => view.SetError(null));
            return count;
        }
        catch (ObjectDisposedException)
        {
            return null;
        }
        catch (Exception ex)
        {
            Post(view => view.SetError(LangManager.Get("Error_ExportLogs", ex.Message)));
            return null;
        }
        finally
        {
            Post(view => view.SetBusy(false));
            _isBusy = false;
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

    private int ExportRows(string filePath, DateTime from, DateTime to)
    {
        var directory = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            Directory.CreateDirectory(directory);

        using var stream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.Read);
        using var writer = new StreamWriter(stream, new UTF8Encoding(true), 64 * 1024);

        WriteCsvRow(
            writer,
            LangManager.Get("Logs_ColTime"),
            LangManager.Get("Logs_ColPrinter"),
            LangManager.Get("Logs_ColStatus"),
            LangManager.Get("Logs_ColUser"),
            LangManager.Get("Logs_ColLabelType"),
            LangManager.Get("Logs_ColJobId"),
            LangManager.Get("Logs_ColError"));

        var count = 0;
        foreach (var log in _auditService.EnumerateLogs(from, to))
        {
            WriteCsvRow(
                writer,
                log.Timestamp.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
                log.PrinterName,
                log.Status,
                log.UserId ?? string.Empty,
                log.LabelType ?? string.Empty,
                log.JobId ?? string.Empty,
                log.ErrorMessage ?? string.Empty);
            count++;
        }

        return count;
    }

    private static void WriteCsvRow(TextWriter writer, params string?[] values)
    {
        for (var i = 0; i < values.Length; i++)
        {
            if (i > 0) writer.Write(',');
            WriteCsvValue(writer, values[i]);
        }

        writer.WriteLine();
    }

    private static void WriteCsvValue(TextWriter writer, string? value)
    {
        value ??= string.Empty;
        if (value.IndexOfAny(CsvEscapeChars) < 0)
        {
            writer.Write(value);
            return;
        }

        writer.Write('"');
        foreach (var ch in value)
        {
            if (ch == '"') writer.Write("\"\"");
            else writer.Write(ch);
        }

        writer.Write('"');
    }

    private static void NormalizeRange(ref DateTime from, ref DateTime to)
    {
        var fromDate = from.Date;
        var toDate = to.Date;

        if (fromDate > toDate)
        {
            var tmp = fromDate;
            fromDate = toDate;
            toDate = tmp;
        }

        from = fromDate;
        to = toDate >= DateTime.MaxValue.Date
            ? DateTime.MaxValue
            : toDate.AddDays(1).AddTicks(-1);
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
