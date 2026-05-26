using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using EasyInk.Engine.Models;
using Newtonsoft.Json;

namespace EasyInk.Printer.Server;

public class WebSocketHandler : IDisposable
{
    private const int MaxBinaryMessageSize = 60 * 1024 * 1024; // 60MB (50MB PDF + 10MB metadata)

    private static readonly TimeSpan PingInterval = TimeSpan.FromSeconds(30);

    private readonly ConcurrentDictionary<string, WebSocket> _connections = new();
    private readonly SemaphoreSlim _broadcastLock = new SemaphoreSlim(1, 1);
    private readonly CancellationTokenSource _cts = new CancellationTokenSource();
    private readonly int _maxConnections;
    private readonly string? _apiKey;
    private readonly Task _pingTask;
    private bool _disposed;
    private WebSocketCommandHandler? _commandHandler;

    public int ConnectionCount => _connections.Count;

    public event Action? ConnectionCountChanged;

    public WebSocketHandler(int maxConnections = 100, string? apiKey = null)
    {
        _maxConnections = maxConnections < 10 ? 10 : maxConnections;
        _apiKey = apiKey;
        _pingTask = PingLoop();
    }

    public void SetCommandHandler(WebSocketCommandHandler handler)
    {
        _commandHandler = handler;
    }

    private async Task PingLoop()
    {
        try
        {
            var pingPayload = Array.Empty<byte>();
            while (!_cts.IsCancellationRequested)
            {
                try { await Task.Delay(PingInterval, _cts.Token); }
                catch (OperationCanceledException) { break; }

                var tasks = new List<Task>();
                foreach (var kvp in _connections)
                {
                    if (kvp.Value.State != WebSocketState.Open)
                    {
                        _connections.TryRemove(kvp.Key, out _);
                        continue;
                    }
                    tasks.Add(SendPingAsync(kvp.Key, kvp.Value, pingPayload));
                }
                await Task.WhenAll(tasks);

                if (_connections.Count == 0)
                    RaiseConnectionCountChanged();
            }
        }
        catch (Exception ex) when (IsExpectedDisconnectException(ex) || _cts.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            SimpleLogger.Error("WebSocket保活循环异常", ex);
        }
    }

    // .NET Framework 4.8 WebSocket does not expose Ping frame sending (no WebSocketMessageType.Ping).
    // Application-level empty binary frame is used as keep-alive instead, which is the pragmatic
    // alternative on this runtime. Migrate to native Ping frames when targeting .NET Core 3.0+.
    private async Task SendPingAsync(string connectionId, WebSocket ws, byte[] payload)
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await ws.SendAsync(new ArraySegment<byte>(payload), WebSocketMessageType.Binary, true, cts.Token);
        }
        catch
        {
            _connections.TryRemove(connectionId, out _);
            try { ws.Dispose(); } catch (Exception disposeEx) { SimpleLogger.Debug("WebSocket ping释放异常", disposeEx); }
        }
    }

    public async Task HandleConnection(HttpListenerContext context)
    {
        if (!context.Request.IsWebSocketRequest)
        {
            context.Response.StatusCode = 400;
            context.Response.Close();
            return;
        }

        if (!ValidateApiKey(context.Request))
        {
            await WriteJsonError(context.Response, 401, ErrorCode.Unauthorized, LangManager.Get("Api_InvalidApiKey"));
            return;
        }

        if (_connections.Count >= _maxConnections)
        {
            await WriteJsonError(context.Response, 429, "TooManyConnections", LangManager.Get("Ws_ConnectionLimit"));
            return;
        }

        var wsContext = await context.AcceptWebSocketAsync(null);
        var ws = wsContext.WebSocket;
        var connectionId = Guid.NewGuid().ToString();
        _connections[connectionId] = ws;
        RaiseConnectionCountChanged();

        try
        {
            await ReceiveLoop(ws);
        }
        catch (Exception ex) when (IsExpectedDisconnectException(ex)) { }
        finally
        {
            _connections.TryRemove(connectionId, out _);
            RaiseConnectionCountChanged();
            await CloseQuietlyAsync(ws);
        }
    }

    private async Task ReceiveLoop(WebSocket ws)
    {
        var buffer = new byte[8192];

        while (ws.State == WebSocketState.Open)
        {
            var messageBuffer = new MemoryStream();
            WebSocketMessageType messageType = WebSocketMessageType.Text;
            bool endOfMessage = false;

            // 接收完整消息（可能分多个帧）
            while (!endOfMessage)
            {
                using var receiveCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), receiveCts.Token);

                if (result.MessageType == WebSocketMessageType.Close)
                    return;

                messageType = result.MessageType;
                endOfMessage = result.EndOfMessage;

                messageBuffer.Write(buffer, 0, result.Count);

                if (messageBuffer.Length > MaxBinaryMessageSize)
                {
                    await SendErrorQuietly(ws, ErrorCode.MessageTooLarge, LangManager.Get("Ws_MessageTooLarge"));
                    return;
                }
            }

            // 处理消息
            if (_commandHandler != null)
            {
                try
                {
                    WebSocketMessage message;
                    if (messageType == WebSocketMessageType.Binary)
                    {
                        message = WebSocketMessage.FromBinary(messageBuffer.ToArray());
                    }
                    else
                    {
                        var json = Encoding.UTF8.GetString(messageBuffer.ToArray());
                        message = WebSocketMessage.FromText(json);
                    }

                    await _commandHandler.HandleMessage(ws, message);
                }
                catch (Exception ex) when (IsExpectedDisconnectException(ex))
                {
                    return;
                }
                catch (Exception ex)
                {
                    await SendErrorQuietly(ws, ErrorCode.InvalidMessage, ex.Message);
                }
            }
        }
    }

    private static async Task SendErrorQuietly(WebSocket ws, string code, string errorMessage)
    {
        try
        {
            if (ws.State != WebSocketState.Open)
                return;

            var errorJson = JsonConvert.SerializeObject(new
            {
                success = false,
                errorInfo = new { code, message = errorMessage }
            });
            var bytes = Encoding.UTF8.GetBytes(errorJson);
            using var sendCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, sendCts.Token);
        }
        catch (Exception ex) when (IsExpectedDisconnectException(ex))
        {
        }
    }

    private bool ValidateApiKey(HttpListenerRequest request)
    {
        return ValidateApiKeyCore(_apiKey, request.QueryString["apiKey"], request.Headers["X-API-Key"]);
    }

    internal static bool ValidateApiKeyCore(string? configuredKey, string? queryApiKey, string? headerApiKey)
    {
        return Router.ValidateApiKeyCore(configuredKey, queryApiKey)
            || Router.ValidateApiKeyCore(configuredKey, headerApiKey);
    }

    private static async Task WriteJsonError(HttpListenerResponse response, int statusCode, string code, string message)
    {
        var json = JsonConvert.SerializeObject(new
        {
            success = false,
            errorInfo = new { code, message }
        });
        var bytes = Encoding.UTF8.GetBytes(json);
        response.StatusCode = statusCode;
        response.ContentType = "application/json";
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes, 0, bytes.Length);
        response.Close();
    }

    public async Task Broadcast(string message)
    {
        var bytes = Encoding.UTF8.GetBytes(message);
        var segment = new ArraySegment<byte>(bytes);

        KeyValuePair<string, WebSocket>[] snapshot;
        await _broadcastLock.WaitAsync();
        try
        {
            snapshot = _connections.ToArray();
        }
        finally
        {
            _broadcastLock.Release();
        }

        var tasks = new List<Task>(snapshot.Length);
        foreach (var kvp in snapshot)
        {
            tasks.Add(SendToConnection(kvp.Key, kvp.Value, segment));
        }
        await Task.WhenAll(tasks);
    }

    private async Task SendToConnection(string connectionId, WebSocket ws, ArraySegment<byte> segment)
    {
        try
        {
            if (ws.State == WebSocketState.Open)
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                await ws.SendAsync(segment, WebSocketMessageType.Text, true, cts.Token);
            }
        }
        catch (Exception ex) when (IsExpectedDisconnectException(ex))
        {
            _connections.TryRemove(connectionId, out _);
        }
    }

    internal async Task SendText(WebSocket? ws, string message)
    {
        if (ws == null || ws.State != WebSocketState.Open)
            return;

        var bytes = Encoding.UTF8.GetBytes(message);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cts.Token);
    }

    internal static Task CloseQuietlyAsync(WebSocket ws)
    {
        try
        {
            if (ws.State != WebSocketState.Closed)
                ws.Abort();
        }
        catch (Exception ex) when (IsExpectedDisconnectException(ex))
        {
            try { ws.Abort(); } catch (Exception abortEx) when (IsExpectedDisconnectException(abortEx)) { }
        }
        finally
        {
            try { ws.Dispose(); } catch (Exception ex) when (IsExpectedDisconnectException(ex)) { }
        }

        return Task.CompletedTask;
    }

    internal static bool IsExpectedDisconnectException(Exception ex)
    {
        return TransportExceptionClassifier.IsExpectedDisconnect(ex);
    }

    private void RaiseConnectionCountChanged()
    {
        try { ConnectionCountChanged?.Invoke(); }
        catch (Exception ex) { SimpleLogger.Debug("WebSocket连接数变更通知异常", ex); }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _cts.Cancel();
        try { _pingTask.Wait(TimeSpan.FromSeconds(3)); }
        catch (AggregateException ex) when (IsExpectedDisconnectException(ex)) { }
        catch (Exception ex) when (IsExpectedDisconnectException(ex)) { }
        foreach (var kvp in _connections)
        {
            try { kvp.Value.Dispose(); } catch (Exception ex) { SimpleLogger.Debug("WebSocket连接释放异常", ex); }
        }
        _connections.Clear();
        _cts.Dispose();
        _broadcastLock.Dispose();
    }
}
