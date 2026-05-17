using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services;
using EasyInk.Engine.Services.Abstractions;

namespace EasyInk.Engine;

/// <summary>
/// 日志级别
/// </summary>
public enum LogLevel
{
    /// <summary>信息</summary>
    Info,
    /// <summary>错误</summary>
    Error
}

/// <summary>
/// 打印引擎公共API，仅负责打印链路，不含审计持久化
/// </summary>
public class EngineApi : IDisposable
{
    private readonly IPrinterService _printerService;
    private readonly IPrintService _printService;
    private readonly PrintJobQueue _jobQueue;

    /// <summary>
    /// 日志回调事件，订阅方自行决定如何处理日志（写文件、存数据库等）
    /// </summary>
    public event Action<LogLevel, string>? Log;

    /// <summary>
    /// 打印完成回调（requestId, 请求参数, 打印结果），用于审计等宿主层需求
    /// </summary>
    public event Action<string, PrintRequestParams, PrinterResult>? PrintCompleted;

    internal void RaiseLog(LogLevel level, string message)
    {
        var handler = Log;
        handler?.Invoke(level, message);
    }

    internal void RaisePrintCompleted(string requestId, PrintRequestParams request, PrinterResult result)
    {
        var handler = PrintCompleted;
        handler?.Invoke(requestId, request, result);
    }

    /// <summary>
    /// 初始化打印引擎（使用默认服务实现：Pdfium + Windows Print Spooler）
    /// </summary>
    public EngineApi(int? maxQueueSize = null,
        System.Collections.Generic.IEnumerable<string>? rawPrinterNames = null,
        int rawPrintDpi = 203, int rawPrintMaxDotsWidth = 576,
        string? sumatraPdfPath = null,
        System.Collections.Generic.IEnumerable<string>? sumatraPrinterNames = null,
        string? sumatraPrintSettings = null,
        int sumatraTimeoutSeconds = 60,
        LowDpiPrintEnhancementMode lowDpiPrintEnhancementMode = LowDpiPrintEnhancementMode.Boost,
        string? sumatraTempDir = null)
        : this(null, null, maxQueueSize, rawPrinterNames, rawPrintDpi, rawPrintMaxDotsWidth,
            sumatraPdfPath, sumatraPrinterNames, sumatraPrintSettings, sumatraTimeoutSeconds,
            lowDpiPrintEnhancementMode, sumatraTempDir)
    {
    }

    /// <summary>
    /// 初始化打印引擎。
    /// 传入 printService 可替换实现。若指定 rawPrinterNames，则对列表中的打印机使用 ESC/POS raw 路径。
    /// </summary>
    public EngineApi(
        IPrinterService? printerService = null,
        IPrintService? printService = null,
        int? maxQueueSize = null,
        System.Collections.Generic.IEnumerable<string>? rawPrinterNames = null,
        int rawPrintDpi = 203,
        int rawPrintMaxDotsWidth = 576,
        string? sumatraPdfPath = null,
        System.Collections.Generic.IEnumerable<string>? sumatraPrinterNames = null,
        string? sumatraPrintSettings = null,
        int sumatraTimeoutSeconds = 60,
        LowDpiPrintEnhancementMode lowDpiPrintEnhancementMode = LowDpiPrintEnhancementMode.Boost,
        string? sumatraTempDir = null)
    {
        var logger = new EventLogger(this);
        _printerService = printerService ?? new PrinterService(logger);

        if (printService != null)
        {
            _printService = printService;
        }
        else
        {
            var gdiService = new PdfiumPrintService(_printerService, logger, lowDpiPrintEnhancementMode);
            var rawService = new EscPosRawPrintService(_printerService, logger, rawPrintDpi, rawPrintMaxDotsWidth);
            IPrintService? sumatraService = null;
            if (!string.IsNullOrWhiteSpace(sumatraPdfPath) &&
                sumatraPrinterNames != null &&
                sumatraPrinterNames.Any(s => !string.IsNullOrWhiteSpace(s)))
            {
                sumatraService = new SumatraPdfPrintService(
                    _printerService,
                    sumatraPdfPath!,
                    sumatraPrintSettings,
                    Math.Max(sumatraTimeoutSeconds, 1) * 1000,
                    logger,
                    sumatraTempDir);
            }

            _printService = new RoutingPrintService(
                gdiService,
                rawService,
                rawPrinterNames ?? Array.Empty<string>(),
                sumatraService,
                sumatraPrinterNames ?? Array.Empty<string>());
        }

        _jobQueue = new PrintJobQueue(_printService, maxQueueSize ?? 100,
            logger, (requestId, request, result) => RaisePrintCompleted(requestId, request, result));
    }

    /// <summary>
    /// 获取打印机列表
    /// </summary>
    public PrinterResult GetPrinters()
    {
        return PrinterResult.Ok("printers", _printerService.GetPrinters());
    }

    /// <summary>
    /// 获取打印机状态
    /// </summary>
    public PrinterResult GetPrinterStatus(string printerName)
    {
        if (string.IsNullOrEmpty(printerName))
            return PrinterResult.Error("unknown", ErrorCode.InvalidParams, "缺少printerName参数");

        return PrinterResult.Ok("unknown", _printerService.GetPrinterStatus(printerName));
    }

    /// <summary>
    /// 获取打印任务状态
    /// </summary>
    public PrinterResult GetJobStatus(string jobId)
    {
        var info = _jobQueue.GetJobStatus(jobId);
        if (info == null)
            return PrinterResult.Error(jobId, ErrorCode.JobNotFound, $"任务不存在: {jobId}");

        return PrinterResult.Ok(jobId, info);
    }

    /// <summary>
    /// 获取所有打印任务
    /// </summary>
    public PrinterResult GetAllJobs()
    {
        return PrinterResult.Ok("all", _jobQueue.GetAllJobs());
    }

    /// <summary>
    /// 处理 JSON 命令（统一入口）
    /// </summary>
    public PrinterResult HandleCommand(string json)
    {
        PrinterCommand request;
        try
        {
            request = JsonConvert.DeserializeObject<PrinterCommand>(json, JsonConfig.CamelCase)!;
        }
        catch (JsonException)
        {
            return PrinterResult.Error("unknown", ErrorCode.InvalidJson, "无效的JSON");
        }

        if (request == null)
            return PrinterResult.Error("unknown", ErrorCode.InvalidJson, "无效的JSON");

        return HandleCommand(request);
    }

    /// <summary>
    /// 处理命令（对象入口，避免 JSON 序列化往返）
    /// </summary>
    public PrinterResult HandleCommand(PrinterCommand request)
    {
        switch (request.Command)
        {
            case "getPrinters":
                return PrinterResult.Ok(request.Id, _printerService.GetPrinters());
            case "getPrinterStatus":
                return HandleGetPrinterStatus(request);
            case "print":
                return HandlePrint(request);
            case "printAsync":
                return HandleEnqueuePrint(request);
            case "getJobStatus":
                return HandleGetJobStatus(request);
            case "getAllJobs":
                return PrinterResult.Ok(request.Id, _jobQueue.GetAllJobs());
            case "batchPrint":
                return HandleBatchPrint(request, enqueue: false);
            case "batchPrintAsync":
                return HandleBatchPrint(request, enqueue: true);
            default:
                return PrinterResult.Error(request.Id, ErrorCode.UnknownCommand, $"未知命令: {request.Command}");
        }
    }

    /// <summary>
    /// 释放资源
    /// </summary>
    public void Dispose()
    {
        _jobQueue.Dispose();
    }

    private PrinterResult HandleGetPrinterStatus(PrinterCommand request)
    {
        var printerName = GetParam<string>(request, "printerName");
        if (string.IsNullOrEmpty(printerName))
        {
            return PrinterResult.Error(request.Id, ErrorCode.InvalidParams, "缺少printerName参数");
        }

        var status = _printerService.GetPrinterStatus(printerName!);
        return PrinterResult.Ok(request.Id, status);
    }

    private PrinterResult HandlePrint(PrinterCommand request)
    {
        var printParams = ExtractPrintParams(request);
        if (printParams == null)
        {
            return PrinterResult.Error(request.Id, ErrorCode.InvalidParams, "缺少打印参数或格式错误");
        }

        var result = _printService.Print(request.Id, printParams);
        RaisePrintCompleted(request.Id, printParams, result);
        return result;
    }

    private PrinterResult HandleEnqueuePrint(PrinterCommand request)
    {
        var printParams = ExtractPrintParams(request);
        if (printParams == null)
        {
            return PrinterResult.Error(request.Id, ErrorCode.InvalidParams, "缺少打印参数或格式错误");
        }

        try
        {
            var jobId = _jobQueue.Enqueue(request.Id, printParams);
            return PrinterResult.Ok(request.Id, new { jobId, status = JobStatus.Queued });
        }
        catch (InvalidOperationException ex)
        {
            return PrinterResult.Error(request.Id, ErrorCode.QueueFull, ex.Message);
        }
    }

    private PrinterResult HandleGetJobStatus(PrinterCommand request)
    {
        var jobId = GetParam<string>(request, "jobId");
        if (string.IsNullOrEmpty(jobId))
        {
            return PrinterResult.Error(request.Id, ErrorCode.InvalidParams, "缺少jobId参数");
        }

        var info = _jobQueue.GetJobStatus(jobId!);
        if (info == null)
        {
            return PrinterResult.Error(request.Id, ErrorCode.JobNotFound, $"任务不存在: {jobId}");
        }
        return PrinterResult.Ok(request.Id, info);
    }

    private PrinterResult HandleBatchPrint(PrinterCommand request, bool enqueue)
    {
        var jobsToken = request.Params != null && request.Params.ContainsKey("jobs")
            ? request.Params["jobs"]
            : null;

        if (jobsToken == null || !(jobsToken is JArray jArr))
        {
            return PrinterResult.Error(request.Id, ErrorCode.InvalidParams, "缺少jobs数组参数");
        }

        var jobs = jArr.ToObject<List<PrintRequestParams>>() ?? new List<PrintRequestParams>();
        if (jobs.Count == 0)
        {
            return PrinterResult.Error(request.Id, ErrorCode.InvalidParams, "jobs不能为空");
        }

        return ExecuteBatchJobs(request.Id, jobs, enqueue);
    }

    private PrintRequestParams? ExtractPrintParams(PrinterCommand request)
    {
        if (request.Params == null || request.Params.Count == 0)
            return null;

        byte[]? pdfBytes = null;
        if (request.Params.TryGetValue("pdfBytes", out var rawPdfBytes))
        {
            if (rawPdfBytes is byte[] bytes)
                pdfBytes = bytes;
            else if (rawPdfBytes is JValue jValue && jValue.Type == JTokenType.Bytes)
                pdfBytes = jValue.ToObject<byte[]>();
        }

        var jObj = JObject.FromObject(request.Params);
        var printParams = jObj.ToObject<PrintRequestParams>();
        if (pdfBytes != null && pdfBytes.Length > 0 && printParams != null)
            printParams.PdfBytes = pdfBytes;
        return printParams;
    }

    private T? GetParam<T>(PrinterCommand request, string key)
    {
        if (request.Params == null || !request.Params.ContainsKey(key))
        {
            return default;
        }

        var value = request.Params[key];
        if (value is JToken token)
        {
            return token.ToObject<T>();
        }

        var targetType = typeof(T);
        try
        {
            var underlyingType = Nullable.GetUnderlyingType(targetType) ?? targetType;
            var converted = Convert.ChangeType(value, underlyingType);
            return (T)converted;
        }
        catch (Exception ex) when (ex is InvalidCastException || ex is FormatException || ex is OverflowException)
        {
            RaiseLog(LogLevel.Error, $"参数 '{key}' 转换失败: {ex.Message}");
            return default;
        }
    }

    private PrinterResult ExecuteBatchJobs(string requestId, List<PrintRequestParams> jobs, bool enqueue)
    {
        if (enqueue)
        {
            var results = new List<BatchJobResult>(jobs.Count);
            foreach (var job in jobs)
            {
                try
                {
                    var jobId = _jobQueue.Enqueue(null, job);
                    results.Add(new BatchJobResult { JobId = jobId, Status = JobStatus.Queued });
                }
                catch (InvalidOperationException ex)
                {
                    results.Add(new BatchJobResult { JobId = null, Status = JobStatus.Failed, ErrorMessage = ex.Message });
                }
            }
            return PrinterResult.Ok(requestId, new BatchPrintResult { Jobs = results });
        }

        var syncResults = new BatchJobResult[jobs.Count];
        Parallel.For(0, jobs.Count, i =>
        {
            var job = jobs[i];
            var jobId = Guid.NewGuid().ToString();
            var response = _printService.Print(jobId, job);
            RaisePrintCompleted(jobId, job, response);
            syncResults[i] = new BatchJobResult
            {
                JobId = jobId,
                Status = response.Success ? JobStatus.Completed : JobStatus.Failed,
                ErrorMessage = response.Success ? null : response.ErrorInfo?.Message
            };
        });

        return PrinterResult.Ok(requestId, new BatchPrintResult { Jobs = new List<BatchJobResult>(syncResults) });
    }

    private sealed class EventLogger : ILogger
    {
        private readonly EngineApi _api;

        public EventLogger(EngineApi api)
        {
            _api = api;
        }

        public void Log(LogLevel level, string message)
        {
            _api.RaiseLog(level, message);
        }
    }
}
