using System;
using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Printer.Config;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EasyInk.Printer.Services;

internal sealed class RenderClient
{
    private readonly HostConfig _config;

    public RenderClient(HostConfig config)
    {
        _config = config;
    }

    public RenderClientResponse RenderPrintPdf(RenderRuntimeHandle runtime, string requestId, PrintRequestParams request, CancellationToken cancellationToken)
    {
        var renderRequest = BuildRenderRequest(requestId, request);
        var requestJson = renderRequest.ToString(Formatting.None);
        var stopwatch = Stopwatch.StartNew();

        using var http = new HttpClient { Timeout = TimeSpan.FromMilliseconds(Math.Max(_config.RenderRequestTimeoutMs, 1000) + 5000) };
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, runtime.BaseUrl + "/v1/render/print-pdf");
        httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", runtime.AuthToken);
        httpRequest.Content = new StringContent(requestJson, Encoding.UTF8, "application/json");

        try
        {
            using var response = http.SendAsync(httpRequest, cancellationToken).GetAwaiter().GetResult();
            stopwatch.Stop();
            var diagnosticsId = response.Headers.Contains("X-EasyInk-Diagnostics-Id")
                ? string.Join(",", response.Headers.GetValues("X-EasyInk-Diagnostics-Id"))
                : null;
            var contentType = response.Content.Headers.ContentType?.MediaType;

            if (response.IsSuccessStatusCode)
            {
                var pdfBytes = response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
                if (pdfBytes.Length == 0 || !string.Equals(contentType, "application/pdf", StringComparison.OrdinalIgnoreCase))
                {
                    return RenderClientResponse.Failure(
                        requestJson,
                        (int)response.StatusCode,
                        contentType,
                        diagnosticsId,
                        stopwatch.ElapsedMilliseconds,
                        RenderPdfResult.Error(ErrorCode.RenderFailed, "Render 返回内容不是 PDF", null, diagnosticsId),
                        null);
                }

                return RenderClientResponse.Success(requestJson, (int)response.StatusCode, contentType, diagnosticsId, stopwatch.ElapsedMilliseconds, pdfBytes);
            }

            var errorJson = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            return RenderClientResponse.Failure(
                requestJson,
                (int)response.StatusCode,
                contentType,
                diagnosticsId,
                stopwatch.ElapsedMilliseconds,
                ParseRenderError(response.StatusCode, errorJson, diagnosticsId),
                errorJson);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            stopwatch.Stop();
            return RenderClientResponse.Failure(
                requestJson,
                0,
                null,
                null,
                stopwatch.ElapsedMilliseconds,
                RenderPdfResult.Error(ErrorCode.PrintTimeout, "Render 请求超时", ex.Message),
                null);
        }
        catch (Exception ex) when (ex is HttpRequestException || ex is InvalidOperationException || ex is WebException)
        {
            stopwatch.Stop();
            return RenderClientResponse.Failure(
                requestJson,
                0,
                null,
                null,
                stopwatch.ElapsedMilliseconds,
                RenderPdfResult.Error(ErrorCode.RenderFailed, "Render 请求失败", ex.Message),
                null);
        }
    }

    private JObject BuildRenderRequest(string requestId, PrintRequestParams request)
    {
        var payload = new JObject
        {
            ["requestId"] = requestId,
            ["source"] = JObject.FromObject(request.RenderSource!, JsonSerializer.Create(JsonConfig.CamelCase)),
            ["output"] = new JObject { ["type"] = "binary" }
        };

        var pdf = request.RenderOptions?.Pdf == null
            ? new JObject()
            : JObject.FromObject(request.RenderOptions.Pdf, JsonSerializer.Create(JsonConfig.CamelCase));
        ApplyPaperDefaults(pdf, request);
        if (pdf.HasValues)
            payload["pdf"] = pdf;

        if (request.RenderOptions?.Wait != null)
            payload["wait"] = JObject.FromObject(request.RenderOptions.Wait, JsonSerializer.Create(JsonConfig.CamelCase));
        if (request.RenderOptions?.Security != null)
            payload["security"] = JObject.FromObject(request.RenderOptions.Security, JsonSerializer.Create(JsonConfig.CamelCase));

        var diagnostics = request.RenderOptions?.Diagnostics == null
            ? new JObject()
            : JObject.FromObject(request.RenderOptions.Diagnostics, JsonSerializer.Create(JsonConfig.CamelCase));
        if (_config.RenderDiagnosticsEnabled)
        {
            diagnostics["includeHtmlSnapshot"] = true;
            diagnostics["includeScreenshot"] = true;
            if (diagnostics["includeRequestHeaders"] == null)
                diagnostics["includeRequestHeaders"] = false;
        }
        if (diagnostics.HasValues)
            payload["diagnostics"] = diagnostics;

        return payload;
    }

    private static void ApplyPaperDefaults(JObject pdf, PrintRequestParams request)
    {
        if (request.PaperSize != null)
        {
            if (pdf["paperWidthMm"] == null)
                pdf["paperWidthMm"] = ToMillimeters(request.PaperSize.Width, request.PaperSize.Unit);
            if (pdf["paperHeightMm"] == null)
                pdf["paperHeightMm"] = ToMillimeters(request.PaperSize.Height, request.PaperSize.Unit);
        }

        if (request.Landscape && pdf["landscape"] == null)
            pdf["landscape"] = true;
    }

    private static double ToMillimeters(double value, string? unit)
    {
        return string.Equals(unit, "inch", StringComparison.OrdinalIgnoreCase) ? value * 25.4 : value;
    }

    private static RenderPdfResult ParseRenderError(HttpStatusCode statusCode, string errorJson, string? diagnosticsId)
    {
        try
        {
            var json = JObject.Parse(errorJson);
            var error = json["error"] as JObject;
            var renderCode = error?.Value<string>("code") ?? statusCode.ToString();
            var message = error?.Value<string>("message") ?? "Render 渲染失败";
            diagnosticsId ??= json["diagnostics"]?.Value<string>("id");

            var details = new JObject
            {
                ["renderCode"] = renderCode,
                ["httpStatus"] = (int)statusCode
            };
            if (!string.IsNullOrWhiteSpace(diagnosticsId))
                details["diagnosticsId"] = diagnosticsId;
            if (error?["details"] != null)
                details["details"] = error["details"];

            return RenderPdfResult.Error(MapRenderErrorCode(renderCode), message, details.ToString(Formatting.None), diagnosticsId);
        }
        catch (JsonException)
        {
            return RenderPdfResult.Error(
                MapHttpStatus(statusCode),
                "Render 渲染失败",
                errorJson,
                diagnosticsId);
        }
    }

    private static string MapRenderErrorCode(string renderCode)
    {
        switch (renderCode)
        {
            case "INVALID_REQUEST":
            case "UNSUPPORTED_SOURCE":
            case "SECURITY_BLOCKED":
                return ErrorCode.InvalidParams;
            case "INVALID_PDF":
                return ErrorCode.InvalidPdfSource;
            case "TOO_MANY_REQUESTS":
                return ErrorCode.QueueFull;
            case "RENDER_TIMEOUT":
                return ErrorCode.PrintTimeout;
            default:
                return ErrorCode.RenderFailed;
        }
    }

    private static string MapHttpStatus(HttpStatusCode statusCode)
    {
        switch (statusCode)
        {
            case HttpStatusCode.BadRequest:
            case HttpStatusCode.Forbidden:
                return ErrorCode.InvalidParams;
            case (HttpStatusCode)429:
                return ErrorCode.QueueFull;
            case HttpStatusCode.GatewayTimeout:
                return ErrorCode.PrintTimeout;
            default:
                return ErrorCode.RenderFailed;
        }
    }
}

internal sealed class RenderClientResponse
{
    private RenderClientResponse(
        string requestJson,
        int statusCode,
        string? contentType,
        string? diagnosticsId,
        long durationMs,
        RenderPdfResult result,
        byte[]? pdfBytes,
        string? errorJson)
    {
        RequestJson = requestJson;
        StatusCode = statusCode;
        ContentType = contentType;
        DiagnosticsId = diagnosticsId;
        DurationMs = durationMs;
        Result = result;
        PdfBytes = pdfBytes;
        ErrorJson = errorJson;
    }

    public string RequestJson { get; }
    public int StatusCode { get; }
    public string? ContentType { get; }
    public string? DiagnosticsId { get; }
    public long DurationMs { get; }
    public RenderPdfResult Result { get; }
    public byte[]? PdfBytes { get; }
    public string? ErrorJson { get; }

    public static RenderClientResponse Success(string requestJson, int statusCode, string? contentType, string? diagnosticsId, long durationMs, byte[] pdfBytes)
    {
        return new RenderClientResponse(
            requestJson,
            statusCode,
            contentType,
            diagnosticsId,
            durationMs,
            RenderPdfResult.Ok(pdfBytes, diagnosticsId),
            pdfBytes,
            null);
    }

    public static RenderClientResponse Failure(string requestJson, int statusCode, string? contentType, string? diagnosticsId, long durationMs, RenderPdfResult result, string? errorJson)
    {
        return new RenderClientResponse(requestJson, statusCode, contentType, diagnosticsId, durationMs, result, null, errorJson);
    }
}