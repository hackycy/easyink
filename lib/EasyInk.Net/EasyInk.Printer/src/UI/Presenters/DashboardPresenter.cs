using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Printer.Api;
using EasyInk.Printer.Server;
using EasyInk.Printer.Services;
using EasyInk.Printer.Utils;

namespace EasyInk.Printer.UI.Presenters;

internal enum DashboardStateKind
{
    Success,
    Warning,
    Error,
    Info
}

internal sealed class DashboardInfoRow
{
    public DashboardInfoRow(string label, string value)
    {
        Label = label;
        Value = value;
    }

    public string Label { get; }
    public string Value { get; }
}

internal sealed class DashboardSnapshot
{
    public string ServiceStatusText { get; set; } = string.Empty;
    public DashboardStateKind ServiceStatusKind { get; set; }
    public string PortText { get; set; } = string.Empty;
    public string WebSocketText { get; set; } = string.Empty;
    public string QueueText { get; set; } = string.Empty;
    public DashboardStateKind QueueKind { get; set; }
    public string RenderDaemonText { get; set; } = string.Empty;
    public DashboardStateKind RenderDaemonKind { get; set; }
    public string? StartupError { get; set; }
    public IReadOnlyList<DashboardInfoRow> InfoRows { get; set; } = Array.Empty<DashboardInfoRow>();
}

internal interface IDashboardView
{
    void RunOnUiThread(Action action);
    void SetSnapshot(DashboardSnapshot snapshot);
    void SetWebSocketConnections(string value);
    void SetQueueStatus(string text, DashboardStateKind kind);
    void SetRenderDaemonStatus(string text, DashboardStateKind kind);
    void SetBusy(bool busy);
}

internal sealed class DashboardPresenter : IDisposable
{
    private readonly HttpServer _server;
    private readonly WebSocketHandler _wsHandler;
    private readonly EngineApi _api;
    private readonly RenderDaemonService _renderDaemonService;
    private readonly Action _connectionCountChanged;
    private readonly Action _renderDaemonStatusChanged;
    private IDashboardView? _view;
    private bool _isRefreshing;
    private bool _isCachedRefreshing;
    private bool _disposed;

    public DashboardPresenter(HttpServer server, WebSocketHandler wsHandler, EngineApi api, RenderDaemonService renderDaemonService)
    {
        _server = server;
        _wsHandler = wsHandler;
        _api = api;
        _renderDaemonService = renderDaemonService;
        _connectionCountChanged = OnConnectionCountChanged;
        _renderDaemonStatusChanged = OnRenderDaemonStatusChanged;
    }

    public void Attach(IDashboardView view)
    {
        _view = view ?? throw new ArgumentNullException(nameof(view));
        _wsHandler.ConnectionCountChanged += _connectionCountChanged;
        _renderDaemonService.StatusChanged += _renderDaemonStatusChanged;
        _view.SetSnapshot(CreateSnapshot(includeQueueProbe: false));
    }

    public void RefreshCachedInBackground()
    {
        if (_disposed || _isRefreshing || _isCachedRefreshing || _view == null) return;

        _isCachedRefreshing = true;
        Task.Run(() =>
        {
            try
            {
                var queue = GetQueueStatus();
                var render = GetCachedRenderDaemonStatus();
                Post(view =>
                {
                    view.SetQueueStatus(queue.Text, queue.Kind);
                    view.SetRenderDaemonStatus(render.Text, render.Kind);
                });
            }
            catch (ObjectDisposedException)
            {
            }
            catch
            {
                Post(view =>
                {
                    view.SetQueueStatus(LangManager.Get("Dashboard_Status_Unknown"), DashboardStateKind.Info);
                    view.SetRenderDaemonStatus(LangManager.Get("Dashboard_Status_Unknown"), DashboardStateKind.Info);
                });
            }
            finally
            {
                _isCachedRefreshing = false;
            }
        });
    }

    public async Task RefreshAsync()
    {
        if (_disposed || _isRefreshing || _view == null) return;

        _isRefreshing = true;
        _view.SetBusy(true);
        _view.SetSnapshot(CreateSnapshot(includeQueueProbe: false));
        _view.SetRenderDaemonStatus(LangManager.Get("Dashboard_Status_Checking"), DashboardStateKind.Info);

        try
        {
            var queueTask = Task.Run(GetQueueStatus);
            var renderTask = Task.Run(GetRenderDaemonStatus);
            await Task.WhenAll(queueTask, renderTask).ConfigureAwait(false);
            var queue = queueTask.Result;
            var render = renderTask.Result;
            Post(view =>
            {
                view.SetQueueStatus(queue.Text, queue.Kind);
                view.SetRenderDaemonStatus(render.Text, render.Kind);
            });
        }
        catch (ObjectDisposedException)
        {
        }
        catch (Exception ex)
        {
            Post(view =>
            {
                view.SetQueueStatus(LangManager.Get("Dashboard_Status_Unknown"), DashboardStateKind.Info);
                view.SetRenderDaemonStatus(ex.Message, DashboardStateKind.Error);
            });
        }
        finally
        {
            Post(view => view.SetBusy(false));
            _isRefreshing = false;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;

        _disposed = true;
        _wsHandler.ConnectionCountChanged -= _connectionCountChanged;
        _renderDaemonService.StatusChanged -= _renderDaemonStatusChanged;
        _view = null;
    }

    private void OnConnectionCountChanged()
    {
        Post(view => view.SetWebSocketConnections(_wsHandler.ConnectionCount.ToString()));
    }

    private void OnRenderDaemonStatusChanged()
    {
        RefreshCachedInBackground();
    }

    private DashboardSnapshot CreateSnapshot(bool includeQueueProbe)
    {
        var hasError = !_server.IsRunning && _server.LastError != null;
        var queue = includeQueueProbe ? GetQueueStatus() : (LangManager.Get("Dashboard_Status_Idle"), DashboardStateKind.Success);

        return new DashboardSnapshot
        {
            ServiceStatusText = _server.IsRunning
                ? LangManager.Get("Dashboard_Status_Running")
                : hasError ? LangManager.Get("Dashboard_Status_Error") : LangManager.Get("Dashboard_Status_Stopped"),
            ServiceStatusKind = hasError ? DashboardStateKind.Error : DashboardStateKind.Success,
            PortText = _server.Port.ToString(),
            WebSocketText = _wsHandler.ConnectionCount.ToString(),
            QueueText = queue.Item1,
            QueueKind = queue.Item2,
            RenderDaemonText = LangManager.Get("Dashboard_Status_Unknown"),
            RenderDaemonKind = DashboardStateKind.Info,
            StartupError = hasError ? LangManager.Get("Dashboard_StartupError", _server.LastError!) : null,
            InfoRows = CreateInfoRows()
        };
    }

    private IReadOnlyList<DashboardInfoRow> CreateInfoRows()
    {
        var lanIps = NetworkHelper.GetLanIpv4Addresses();
        var addresses = lanIps.Count > 0
            ? string.Join("  ", lanIps.Select(ip => $"http://{ip}:{_server.Port}"))
            : $"http://localhost:{_server.Port}";

        var macs = NetworkHelper.GetActivePhysicalMacs();
        var macText = macs.Count > 0 ? string.Join("  /  ", macs) : LangManager.Get("Dashboard_MacNotDetected");

        return new List<DashboardInfoRow>
        {
            new DashboardInfoRow(LangManager.Get("Dashboard_ServiceAddress"), addresses),
            new DashboardInfoRow(LangManager.Get("Dashboard_DeviceNumber"), NetworkHelper.GenerateDeviceNumber()),
            new DashboardInfoRow(LangManager.Get("Dashboard_AppVersion"), VersionHelper.GetDisplayVersion(typeof(StatusController).Assembly)),
            new DashboardInfoRow(LangManager.Get("Dashboard_MacAddress"), macText)
        };
    }

    private (string Text, DashboardStateKind Kind) GetQueueStatus()
    {
        var result = _api.GetAllJobs();
        var hasActive = result.Success && result.Data is List<PrintJob> jobs
            && jobs.Any(j => j.Status == JobStatus.Printing || j.Status == JobStatus.Queued);

        return hasActive
            ? (LangManager.Get("Dashboard_Status_Busy"), DashboardStateKind.Warning)
            : (LangManager.Get("Dashboard_Status_Idle"), DashboardStateKind.Success);
    }

    private (string Text, DashboardStateKind Kind) GetRenderDaemonStatus()
    {
        var status = _renderDaemonService.GetStatus();
        return ToRenderDaemonDisplay(status);
    }

    private (string Text, DashboardStateKind Kind) GetCachedRenderDaemonStatus()
    {
        var status = _renderDaemonService.GetCachedStatus();
        return ToRenderDaemonDisplay(status);
    }

    private static (string Text, DashboardStateKind Kind) ToRenderDaemonDisplay(RenderDaemonStatus status)
    {
        switch (status.Kind)
        {
            case RenderDaemonStateKind.Running:
                return (status.Pid.HasValue ? LangManager.Get("Dashboard_RenderDaemonRunning", status.Pid.Value) : status.Message, DashboardStateKind.Success);
            case RenderDaemonStateKind.Disabled:
                return (status.Message, DashboardStateKind.Info);
            case RenderDaemonStateKind.Error:
                return (status.Message, DashboardStateKind.Error);
            default:
                return (status.Message, DashboardStateKind.Warning);
        }
    }

    private void Post(Action<IDashboardView> update)
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
