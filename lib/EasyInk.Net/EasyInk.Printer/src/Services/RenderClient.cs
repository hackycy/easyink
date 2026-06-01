using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Printer.Config;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EasyInk.Printer.Services;

internal sealed class RenderClient
{
    private const int ExitSuccess = 0;
    private const int ExitInvalidArguments = 2;
    private const int ExitInvalidRequestJson = 3;
    private const int ExitDaemonUnavailable = 4;
    private const int ExitDaemonProtocol = 5;
    private const int ExitRenderFailed = 6;
    private const int ExitOutputWriteFailed = 7;
    private const int ExitTimeout = 8;
    private const int ExitBrowserUnavailable = 9;

    private readonly HostConfig _config;

    public RenderClient(HostConfig config)
    {
        _config = config;
    }

    public RenderClientResponse RenderPrintPdf(RenderRuntimeOptions runtime, string requestId, PrintRequestParams request, CancellationToken cancellationToken)
    {
        var renderRequest = BuildRenderRequest(requestId, request);
        var requestJson = renderRequest.ToString(Formatting.None);
        var workDir = CreateWorkDir(requestId);
        var requestPath = Path.Combine(workDir, "request.json");
        var outputPath = Path.Combine(workDir, "output.pdf");
        var diagnosticsPath = Path.Combine(workDir, "diagnostics.json");

        File.WriteAllText(requestPath, requestJson, new UTF8Encoding(false));

        var stopwatch = Stopwatch.StartNew();
        var processResult = RunRender(runtime, requestPath, outputPath, diagnosticsPath, cancellationToken);
        stopwatch.Stop();

        var summary = ParseSummary(processResult.Stdout);
        var diagnosticsId = ReadDiagnosticsId(diagnosticsPath) ?? summary.DiagnosticsId;
        var errorJson = BuildErrorJson(processResult, summary, diagnosticsId);

        if (processResult.ExitCode == ExitSuccess && File.Exists(outputPath))
        {
            var pdfBytes = File.ReadAllBytes(outputPath);
            if (pdfBytes.Length > 0)
            {
                return RenderClientResponse.Success(
                    requestJson,
                    processResult.ExitCode,
                    diagnosticsId,
                    stopwatch.ElapsedMilliseconds,
                    pdfBytes,
                    summary.PageCount);
            }

            return RenderClientResponse.Failure(
                requestJson,
                ExitOutputWriteFailed,
                diagnosticsId,
                stopwatch.ElapsedMilliseconds,
                RenderPdfResult.Error(ErrorCode.RenderFailed, "Render 未生成有效 PDF", errorJson, diagnosticsId),
                errorJson);
        }

        return RenderClientResponse.Failure(
            requestJson,
            processResult.ExitCode,
            diagnosticsId,
            stopwatch.ElapsedMilliseconds,
            ParseRenderFailure(processResult.ExitCode, summary, processResult.Stderr, diagnosticsId),
            errorJson);
    }

    private ProcessResult RunRender(RenderRuntimeOptions runtime, string requestPath, string outputPath, string diagnosticsPath, CancellationToken cancellationToken)
    {
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = runtime.HostPath,
            Arguments = BuildArguments(runtime, requestPath, outputPath, diagnosticsPath),
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = Path.GetDirectoryName(runtime.HostPath) ?? AppDomain.CurrentDomain.BaseDirectory
        };
        process.OutputDataReceived += (s, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
        process.ErrorDataReceived += (s, e) => { if (e.Data != null) stderr.AppendLine(e.Data); };

        if (!process.Start())
            throw new InvalidOperationException("Render CLI 启动失败");

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        var deadline = DateTime.UtcNow.AddMilliseconds(Math.Max(runtime.RequestTimeoutMs, 1000) + 15000);
        while (!process.HasExited)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                TryKill(process);
                cancellationToken.ThrowIfCancellationRequested();
            }
            if (DateTime.UtcNow >= deadline)
            {
                TryKill(process);
                return new ProcessResult(ExitTimeout, stdout.ToString(), "Render CLI 请求超时");
            }
            process.WaitForExit(100);
        }

        process.WaitForExit();
        return new ProcessResult(process.ExitCode, stdout.ToString(), stderr.ToString());
    }

    private static string BuildArguments(RenderRuntimeOptions runtime, string requestPath, string outputPath, string diagnosticsPath)
    {
        var args = new StringBuilder();
        AppendArg(args, "render");
        AppendArg(args, "--request");
        AppendArg(args, requestPath);
        AppendArg(args, "--out");
        AppendArg(args, outputPath);
        AppendArg(args, "--json");
        AppendArg(args, "--diagnostics-out");
        AppendArg(args, diagnosticsPath);
        AppendArg(args, "--browser-path");
        AppendArg(args, runtime.BrowserPath);
        AppendArg(args, "--headless-mode");
        AppendArg(args, runtime.HeadlessMode);
        AppendArg(args, "--profile-root");
        AppendArg(args, runtime.ProfileRoot);
        AppendArg(args, "--temp-dir");
        AppendArg(args, runtime.TempDir);
        AppendArg(args, "--log-dir");
        AppendArg(args, runtime.LogDir);
        if (runtime.DisableSandbox)
            AppendArg(args, "--disable-sandbox");
        AppendArg(args, "--max-concurrency");
        AppendArg(args, runtime.MaxConcurrency.ToString());
        AppendArg(args, "--max-queue-size");
        AppendArg(args, runtime.MaxQueueSize.ToString());
        AppendArg(args, "--request-timeout-ms");
        AppendArg(args, runtime.RequestTimeoutMs.ToString());
        AppendArg(args, "--idle-timeout-ms");
        AppendArg(args, runtime.IdleTimeoutMs.ToString());
        return args.ToString();
    }

    internal static string BuildArgumentsForTest(RenderRuntimeOptions runtime, string requestPath, string outputPath, string diagnosticsPath)
    {
        return BuildArguments(runtime, requestPath, outputPath, diagnosticsPath);
    }

    internal JObject BuildRenderRequestForTest(string requestId, PrintRequestParams request)
    {
        return BuildRenderRequest(requestId, request);
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

    private static RenderPdfResult ParseRenderFailure(int exitCode, RenderSummary summary, string stderr, string? diagnosticsId)
    {
        var renderCode = string.IsNullOrWhiteSpace(summary.Code) ? ExitCodeToRenderCode(exitCode) : summary.Code!;
        var message = !string.IsNullOrWhiteSpace(summary.Message)
            ? summary.Message!
            : !string.IsNullOrWhiteSpace(stderr)
                ? stderr.Trim()
                : "Render 渲染失败";

        var details = new JObject
        {
            ["renderCode"] = renderCode,
            ["exitCode"] = exitCode
        };
        if (!string.IsNullOrWhiteSpace(diagnosticsId))
            details["diagnosticsId"] = diagnosticsId;

        return RenderPdfResult.Error(MapRenderErrorCode(renderCode, exitCode), message, details.ToString(Formatting.None), diagnosticsId);
    }

    private static string MapRenderErrorCode(string renderCode, int exitCode)
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
        }

        if (exitCode == ExitTimeout)
            return ErrorCode.PrintTimeout;
        if (exitCode == ExitInvalidArguments || exitCode == ExitInvalidRequestJson)
            return ErrorCode.InvalidParams;
        return ErrorCode.RenderFailed;
    }

    private static string ExitCodeToRenderCode(int exitCode)
    {
        switch (exitCode)
        {
            case ExitInvalidArguments:
                return "INVALID_ARGUMENTS";
            case ExitInvalidRequestJson:
                return "INVALID_REQUEST";
            case ExitDaemonUnavailable:
                return "DAEMON_UNAVAILABLE";
            case ExitDaemonProtocol:
                return "DAEMON_PROTOCOL";
            case ExitRenderFailed:
                return "RENDER_FAILED";
            case ExitOutputWriteFailed:
                return "OUTPUT_WRITE_FAILED";
            case ExitTimeout:
                return "RENDER_TIMEOUT";
            case ExitBrowserUnavailable:
                return "BROWSER_UNAVAILABLE";
            default:
                return "RENDER_FAILED";
        }
    }

    private static RenderSummary ParseSummary(string stdout)
    {
        try
        {
            var json = JObject.Parse(stdout);
            return new RenderSummary
            {
                Success = json.Value<bool?>("success") ?? false,
                Code = json.Value<string>("code"),
                Message = json.Value<string>("message"),
                RequestId = json.Value<string>("requestId"),
                PageCount = json.Value<int?>("pageCount"),
                DiagnosticsPath = json.Value<string>("diagnosticsPath"),
                DiagnosticsId = ReadDiagnosticsId(json.Value<string>("diagnosticsPath"))
            };
        }
        catch (JsonException)
        {
            return new RenderSummary();
        }
    }

    private static string? ReadDiagnosticsId(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return null;

        try
        {
            var json = JObject.Parse(File.ReadAllText(path));
            return json.Value<string>("id");
        }
        catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException || ex is JsonException)
        {
            return null;
        }
    }

    private static string? BuildErrorJson(ProcessResult processResult, RenderSummary summary, string? diagnosticsId)
    {
        if (processResult.ExitCode == ExitSuccess)
            return null;

        var payload = new JObject
        {
            ["success"] = false,
            ["exitCode"] = processResult.ExitCode,
            ["code"] = string.IsNullOrWhiteSpace(summary.Code) ? ExitCodeToRenderCode(processResult.ExitCode) : summary.Code,
            ["message"] = string.IsNullOrWhiteSpace(summary.Message) ? processResult.Stderr.Trim() : summary.Message,
            ["diagnosticsId"] = diagnosticsId,
            ["stdout"] = processResult.Stdout.Trim(),
            ["stderr"] = processResult.Stderr.Trim()
        };
        return payload.ToString(Formatting.Indented);
    }

    private static string CreateWorkDir(string requestId)
    {
        var root = Path.Combine(Path.GetTempPath(), "EasyInk.Printer", "render-cli");
        Directory.CreateDirectory(root);
        var name = DateTime.Now.ToString("yyyyMMdd-HHmmssfff") + "_" + SanitizeFileName(requestId);
        var dir = Path.Combine(root, name);
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void AppendArg(StringBuilder builder, string value)
    {
        if (builder.Length > 0)
            builder.Append(' ');
        builder.Append(QuoteArg(value));
    }

    private static string QuoteArg(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static string SanitizeFileName(string value)
    {
        var result = string.IsNullOrWhiteSpace(value) ? "render" : value.Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars())
            result = result.Replace(invalid, '_');
        return result;
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
                process.Kill();
        }
        catch
        {
        }
    }

    private sealed class ProcessResult
    {
        public ProcessResult(int exitCode, string stdout, string stderr)
        {
            ExitCode = exitCode;
            Stdout = stdout;
            Stderr = stderr;
        }

        public int ExitCode { get; }
        public string Stdout { get; }
        public string Stderr { get; }
    }

    private sealed class RenderSummary
    {
        public bool Success { get; set; }
        public string? Code { get; set; }
        public string? Message { get; set; }
        public string? RequestId { get; set; }
        public int? PageCount { get; set; }
        public string? DiagnosticsPath { get; set; }
        public string? DiagnosticsId { get; set; }
    }
}

internal sealed class RenderClientResponse
{
    private RenderClientResponse(
        string requestJson,
        int exitCode,
        string? diagnosticsId,
        long durationMs,
        RenderPdfResult result,
        byte[]? pdfBytes,
        string? errorJson)
    {
        RequestJson = requestJson;
        ExitCode = exitCode;
        DiagnosticsId = diagnosticsId;
        DurationMs = durationMs;
        Result = result;
        PdfBytes = pdfBytes;
        ErrorJson = errorJson;
    }

    public string RequestJson { get; }
    public int ExitCode { get; }
    public string? DiagnosticsId { get; }
    public long DurationMs { get; }
    public RenderPdfResult Result { get; }
    public byte[]? PdfBytes { get; }
    public string? ErrorJson { get; }

    public static RenderClientResponse Success(string requestJson, int exitCode, string? diagnosticsId, long durationMs, byte[] pdfBytes, int? pageCount)
    {
        return new RenderClientResponse(
            requestJson,
            exitCode,
            diagnosticsId,
            durationMs,
            RenderPdfResult.Ok(pdfBytes, diagnosticsId, pageCount),
            pdfBytes,
            null);
    }

    public static RenderClientResponse Failure(string requestJson, int exitCode, string? diagnosticsId, long durationMs, RenderPdfResult result, string? errorJson)
    {
        return new RenderClientResponse(requestJson, exitCode, diagnosticsId, durationMs, result, null, errorJson);
    }
}
