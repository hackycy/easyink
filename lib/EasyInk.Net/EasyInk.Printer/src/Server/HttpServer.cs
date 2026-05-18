using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;

namespace EasyInk.Printer.Server;

public class HttpServer
{
    private readonly int _port;
    private readonly SemaphoreSlim _concurrency;
    private readonly ConcurrentDictionary<Guid, Task> _inFlight = new();
    private HttpListener? _listener;
    private CancellationTokenSource? _cts;
    private Task? _listenTask;

    public int Port => _port;
    public bool IsRunning { get; private set; }
    public bool IsAccessDenied { get; private set; }
    public string? LastError { get; private set; }

    public Func<HttpListenerContext, Task>? OnRequest { get; set; }

    public HttpServer(int port, int maxConcurrentRequests = 50)
    {
        _port = port;
        _concurrency = new SemaphoreSlim(maxConcurrentRequests, maxConcurrentRequests);
    }

    public bool TryStart()
    {
        if (IsRunning) return true;

        IsAccessDenied = false;

        try
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://+:{_port}/");
            _listener.Start();

            _cts = new CancellationTokenSource();
            IsRunning = true;
            LastError = null;

            _listenTask = Task.Factory.StartNew(
                () => ListenLoop(),
                _cts.Token,
                TaskCreationOptions.LongRunning,
                TaskScheduler.Default).Unwrap();

            return true;
        }
        catch (HttpListenerException ex) when (ex.ErrorCode == 5)
        {
            IsAccessDenied = true;
            LastError = ex.Message;
            _listener?.Close();
            _listener = null;
            IsRunning = false;
            return false;
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            _listener?.Close();
            _listener = null;
            IsRunning = false;
            return false;
        }
    }

    public void Stop()
    {
        if (!IsRunning) return;

        IsRunning = false;
        _cts?.Cancel();
        try { _listener?.Stop(); }
        catch (Exception ex) { SimpleLogger.Error("停止监听器异常", ex); }
        try { _listenTask?.Wait(TimeSpan.FromSeconds(3)); }
        catch (Exception ex) { SimpleLogger.Error("等待监听任务异常", ex); }
        _cts?.Dispose();
        _listener?.Close();
        _listener = null;

        // 等待正在执行的请求完成
        var remaining = _inFlight.Values.ToArray();
        if (remaining.Length > 0)
        {
            try { Task.WaitAll(remaining, TimeSpan.FromSeconds(10)); }
            catch (Exception ex) { SimpleLogger.Error("等待进行中的请求超时", ex); }
        }
        _inFlight.Clear();
    }

    private async Task ListenLoop()
    {
        while (_cts is { } cts && !cts.Token.IsCancellationRequested)
        {
            try
            {
                var listener = _listener;
                if (listener == null) break;
                var context = await listener.GetContextAsync();
                var handler = OnRequest;
                if (handler != null)
                {
                    await _concurrency.WaitAsync(_cts.Token);
                    var requestId = Guid.NewGuid();
                    var task = Task.Run(async () =>
                    {
                        try
                        {
                            await handler(context);
                        }
                        catch (Exception ex) when (TransportExceptionClassifier.IsExpectedDisconnect(ex))
                        {
                            CloseResponseQuietly(context);
                        }
                        catch (Exception ex)
                        {
                            SimpleLogger.Error("请求处理异常", ex);
                            WriteInternalErrorQuietly(context);
                        }
                        finally
                        {
                            _concurrency.Release();
                            _inFlight.TryRemove(requestId, out _);
                        }
                    });
                    _inFlight[requestId] = task;
                }
            }
            catch (HttpListenerException) { break; }
            catch (ObjectDisposedException) { break; }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                SimpleLogger.Error("监听异常", ex);
            }
        }
    }

    private static void WriteInternalErrorQuietly(HttpListenerContext context)
    {
        try
        {
            context.Response.StatusCode = 500;
            context.Response.Close();
        }
        catch (Exception ex) when (TransportExceptionClassifier.IsExpectedDisconnect(ex)) { }
        catch (Exception closeEx) { SimpleLogger.Debug("错误响应关闭异常", closeEx); }
    }

    private static void CloseResponseQuietly(HttpListenerContext context)
    {
        try { context.Response.Close(); }
        catch (Exception ex) when (TransportExceptionClassifier.IsExpectedDisconnect(ex)) { }
    }
}
