using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Printer.Api;
using EasyInk.Printer.Config;
using Newtonsoft.Json;

namespace EasyInk.Printer.Server;

public class Router
{
    private const long MaxRequestBodyBytes = 10 * 1024 * 1024; // 10MB

    private readonly PrinterController _printerController;
    private readonly PrintController _printController;
    private readonly JobController _jobController;
    private readonly LogController _logController;
    private readonly StatusController _statusController;
    private readonly WebSocketHandler _wsHandler;
    private readonly bool _trustAllOrigins;
    private readonly string? _apiKey;
    private readonly List<RouteEntry> _routes;

    private delegate Task<PrinterResult> RouteHandler(HttpListenerRequest request);
    internal delegate bool PathMatcher(string path);

    private struct RouteEntry
    {
        public string Method;
        public PathMatcher Match;
        public RouteHandler Handler;
    }

    public Router(PrinterController printerController, PrintController printController,
        JobController jobController, LogController logController, StatusController statusController,
        WebSocketHandler wsHandler, HostConfig config)
    {
        _printerController = printerController;
        _printController = printController;
        _jobController = jobController;
        _logController = logController;
        _statusController = statusController;
        _wsHandler = wsHandler;
        _trustAllOrigins = config.TrustAllOrigins;
        _apiKey = config.ApiKey;

        _routes = new List<RouteEntry>
        {
            // GET routes
            Route("GET", Exact("/api/status"), _ => Task.FromResult(_statusController.GetStatus())),
            Route("GET", Exact("/api/status/connections"), _ => Task.FromResult(PrinterResult.Ok("connections", new { count = _wsHandler.ConnectionCount }))),
            Route("GET", Exact("/api/printers"), _ => Task.FromResult(_printerController.GetPrinters())),
            Route("GET", MatchPrinterStatus, req => Task.FromResult(HandleGetPrinterStatus(req))),
            Route("GET", Exact("/api/jobs"), _ => Task.FromResult(_jobController.GetAllJobs())),
            Route("GET", MatchJobById, req => Task.FromResult(HandleGetJobStatus(req))),
            Route("GET", Exact("/api/logs"), req => Task.FromResult(_logController.QueryLogs(req.QueryString))),

            // POST routes
            Route("POST", Exact("/api/print"), HandlePrintRequest),
            Route("POST", Exact("/api/print/async"), HandleEnqueuePrintRequest),
            Route("POST", Exact("/api/print/batch"), async req => _printController.BatchPrint(await ReadBodyAsString(req) ?? "")),
            Route("POST", Exact("/api/print/batch/async"), async req => _printController.EnqueueBatchPrint(await ReadBodyAsString(req) ?? "")),
        };
    }

    private static RouteEntry Route(string method, PathMatcher match, RouteHandler handler)
    {
        return new RouteEntry { Method = method, Match = match, Handler = handler };
    }

    internal static PathMatcher Exact(string path) => p => p == path;

    internal static bool MatchPrinterStatus(string path)
    {
        return path.StartsWith("/api/printers/") && path.EndsWith("/status")
            && path.Split('/').Length == 5;
    }

    internal static bool MatchJobById(string path)
    {
        return path.StartsWith("/api/jobs/") && path.Length > 10;
    }

    private PrinterResult HandleGetPrinterStatus(HttpListenerRequest request)
    {
        var segments = request.Url.AbsolutePath.TrimEnd('/').Split('/');
        if (segments.Length != 5 || string.IsNullOrEmpty(segments[3]))
            return PrinterResult.Error("", ErrorCode.InvalidParams, LangManager.Get("Api_MissingPrinterName"));
        var name = Uri.UnescapeDataString(segments[3]);
        return _printerController.GetPrinterStatus(name);
    }

    private PrinterResult HandleGetJobStatus(HttpListenerRequest request)
    {
        var id = request.Url.AbsolutePath.TrimEnd('/').Substring(10);
        if (string.IsNullOrEmpty(id))
            return PrinterResult.Error("", ErrorCode.InvalidParams, LangManager.Get("Api_MissingJobId"));
        return _jobController.GetJobStatus(id);
    }

    public async Task HandleRequest(HttpListenerContext context)
    {
        try
        {
            await HandleRequestCore(context);
        }
        catch (Exception ex) when (TransportExceptionClassifier.IsExpectedDisconnect(ex))
        {
            CloseResponseQuietly(context.Response);
        }
    }

    private async Task HandleRequestCore(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;

        if (_trustAllOrigins)
        {
            response.Headers.Add("Access-Control-Allow-Origin", "*");
        }
        else
        {
            var origin = request.Headers["Origin"];
            if (!string.IsNullOrEmpty(origin) && IsLocalOrigin(origin))
                response.Headers.Add("Access-Control-Allow-Origin", origin);
        }
        response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, X-API-Key");

        if (request.HttpMethod == "OPTIONS")
        {
            response.StatusCode = 200;
            response.Close();
            return;
        }

        if (!ValidateApiKey(request))
        {
            var unauthorized = Encoding.UTF8.GetBytes(SerializeResult(PrinterResult.Error("", ErrorCode.Unauthorized, LangManager.Get("Api_InvalidApiKey"))));
            response.StatusCode = 401;
            response.ContentType = "application/json; charset=utf-8";
            response.ContentLength64 = unauthorized.Length;
            await response.OutputStream.WriteAsync(unauthorized, 0, unauthorized.Length);
            response.Close();
            return;
        }

        PrinterResult result;
        try
        {
            result = await RouteRequest(request);
        }
        catch (Exception ex) when (TransportExceptionClassifier.IsExpectedDisconnect(ex))
        {
            throw;
        }
        catch (Exception ex)
        {
            SimpleLogger.Error("请求处理异常", ex);
            result = PrinterResult.Error("", ErrorCode.InternalError, LangManager.Get("Api_InternalError"));
        }

        var buffer = Encoding.UTF8.GetBytes(SerializeResult(result));
        response.ContentType = "application/json; charset=utf-8";
        response.ContentLength64 = buffer.Length;
        await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
        response.Close();
    }

    private static void CloseResponseQuietly(HttpListenerResponse response)
    {
        try { response.Close(); }
        catch (Exception ex) when (TransportExceptionClassifier.IsExpectedDisconnect(ex)) { }
    }

    private async Task<PrinterResult> RouteRequest(HttpListenerRequest request)
    {
        var path = request.Url.AbsolutePath.TrimEnd('/');
        var method = request.HttpMethod;

        foreach (var route in _routes)
        {
            if (route.Method == method && route.Match(path))
                return await route.Handler(request);
        }

        return PrinterResult.Error("", ErrorCode.NotFound, LangManager.Get("Api_RouteNotFound", method, path));
    }

    private async Task<PrinterResult> HandlePrintRequest(HttpListenerRequest request)
    {
        var (paramsJson, pdfBytes) = await ReadMultipartOrJson(request);
        if (paramsJson == null)
            return PrinterResult.Error("", ErrorCode.InvalidParams, LangManager.Get("Api_MissingParams"));
        if (pdfBytes != null)
            return _printController.Print(paramsJson, pdfBytes);
        return _printController.Print(paramsJson);
    }

    private async Task<PrinterResult> HandleEnqueuePrintRequest(HttpListenerRequest request)
    {
        var (paramsJson, pdfBytes) = await ReadMultipartOrJson(request);
        if (paramsJson == null)
            return PrinterResult.Error("", ErrorCode.InvalidParams, LangManager.Get("Api_MissingParams"));
        if (pdfBytes != null)
            return _printController.EnqueuePrint(paramsJson, pdfBytes);
        return _printController.EnqueuePrint(paramsJson);
    }

    private async Task<(string? paramsJson, byte[]? pdfBytes)> ReadMultipartOrJson(HttpListenerRequest request)
    {
        var contentType = request.ContentType ?? "";

        if (contentType.Contains("multipart/form-data"))
        {
            var body = await ReadBodyAsBytes(request);
            if (body == null) return (null, null);
            var multipart = MultipartParser.Parse(body, contentType);

            if (multipart.Params == null || multipart.PdfBytes == null || multipart.PdfBytes.Length == 0)
                return (null, null);

            return (multipart.Params.ToString(), multipart.PdfBytes);
        }

        return (await ReadBodyAsString(request), null);
    }

    private static async Task<string?> ReadBodyAsString(HttpListenerRequest request)
    {
        if (request.InputStream == null) return null;
        if (request.ContentLength64 < 0) return null;
        if (request.ContentLength64 > MaxRequestBodyBytes)
            throw new InvalidOperationException(LangManager.Get("Api_BodyTooLarge", request.ContentLength64 / 1024 / 1024, MaxRequestBodyBytes / 1024 / 1024));

        var buffer = new byte[request.ContentLength64];
        int totalRead = 0;
        int bytesRead;
        while (totalRead < buffer.Length &&
               (bytesRead = await request.InputStream.ReadAsync(buffer, totalRead, buffer.Length - totalRead)) > 0)
        {
            totalRead += bytesRead;
        }

        return request.ContentEncoding.GetString(buffer, 0, totalRead);
    }

    private static async Task<byte[]?> ReadBodyAsBytes(HttpListenerRequest request)
    {
        if (request.InputStream == null) return null;
        if (request.ContentLength64 < 0) return null;
        if (request.ContentLength64 > MaxRequestBodyBytes)
            throw new InvalidOperationException(LangManager.Get("Api_BodyTooLarge", request.ContentLength64 / 1024 / 1024, MaxRequestBodyBytes / 1024 / 1024));

        var buffer = new byte[request.ContentLength64];
        int totalRead = 0;
        int bytesRead;
        while (totalRead < buffer.Length &&
               (bytesRead = await request.InputStream.ReadAsync(buffer, totalRead, buffer.Length - totalRead)) > 0)
        {
            totalRead += bytesRead;
        }

        if (totalRead == buffer.Length)
            return buffer;

        var result = new byte[totalRead];
        Array.Copy(buffer, result, totalRead);
        return result;
    }

    private static string SerializeResult(PrinterResult result)
    {
        return JsonConvert.SerializeObject(result, JsonConfig.CamelCase);
    }

    private bool ValidateApiKey(HttpListenerRequest request)
    {
        return ValidateApiKeyCore(_apiKey, request.Headers["X-API-Key"]);
    }

    internal static bool ValidateApiKeyCore(string? configuredKey, string? providedKey)
    {
        if (string.IsNullOrEmpty(configuredKey))
            return true;
        if (string.IsNullOrEmpty(providedKey))
            return false;
        if (providedKey!.Length != configuredKey!.Length)
            return false;

        // constant-time comparison to prevent timing attacks
        int diff = 0;
        for (int i = 0; i < configuredKey.Length; i++)
            diff |= configuredKey[i] ^ providedKey[i];
        return diff == 0;
    }

    internal static bool IsLocalOrigin(string origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
            return false;

        var host = uri.Host;
        return host == "localhost"
            || host == "127.0.0.1"
            || host == "[::1]"
            || host == "0.0.0.0";
    }
}
