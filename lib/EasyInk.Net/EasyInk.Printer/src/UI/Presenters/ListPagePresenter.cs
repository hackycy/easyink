using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EasyInk.Engine.Models;

namespace EasyInk.Printer.UI.Presenters;

internal interface IListPageView
{
    void RunOnUiThread(Action action);
    void SetBusy(bool busy);
    void SetError(string? message);
    void SetRows(IReadOnlyList<ListViewRow> rows);
}

internal abstract class ListPagePresenter : IDisposable
{
    private IListPageView? _view;
    private bool _isRefreshing;
    private bool _disposed;

    protected ListPagePresenter(string errorMessageKey)
    {
        ErrorMessageKey = errorMessageKey;
    }

    protected string ErrorMessageKey { get; }

    public void Attach(IListPageView view)
    {
        _view = view ?? throw new ArgumentNullException(nameof(view));
    }

    public async Task RefreshAsync()
    {
        if (_disposed || _isRefreshing || _view == null) return;

        _isRefreshing = true;
        _view.SetBusy(true);
        _view.SetError(null);
        _view.SetRows(Array.Empty<ListViewRow>());

        try
        {
            var rows = await Task.Run(LoadRows).ConfigureAwait(false);
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
            Post(view => view.SetError(LangManager.Get(ErrorMessageKey, ex.Message)));
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

    protected abstract PrinterResult FetchData();
    protected abstract IReadOnlyList<ListViewRow> MapRows(PrinterResult result);

    private IReadOnlyList<ListViewRow> LoadRows()
    {
        var result = FetchData();
        if (!result.Success)
            throw new InvalidOperationException(result.ErrorInfo?.Message ?? LangManager.Get("Api_InternalError"));

        return MapRows(result);
    }

    private void Post(Action<IListPageView> update)
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
