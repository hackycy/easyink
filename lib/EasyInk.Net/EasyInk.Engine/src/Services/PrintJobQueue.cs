using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;

namespace EasyInk.Engine.Services;

/// <summary>
/// 打印任务队列，异步处理打印请求
/// </summary>
public class PrintJobQueue : IDisposable
{
    private const int DefaultMaxQueueSize = 100;

    private readonly IPrintService _printService;
    private readonly ILogger _logger;
    private readonly Action<string, PrintRequestParams, PrinterResult>? _onPrintCompleted;
    private readonly Dictionary<string, (PrintJob Job, PrintRequestParams Request)> _jobs = new();
    private readonly BlockingCollection<(string requestId, PrintRequestParams request)> _queue;
    private readonly CancellationTokenSource _cts = new CancellationTokenSource();
    private readonly Task _worker;
    private readonly object _jobLock = new object();

    /// <summary>
    /// 初始化打印任务队列
    /// </summary>
    /// <param name="printService">打印服务</param>
    /// <param name="maxQueueSize">队列最大容量</param>
    /// <param name="logger">日志记录器</param>
    /// <param name="onPrintCompleted">打印完成回调</param>
    public PrintJobQueue(IPrintService printService, int maxQueueSize = DefaultMaxQueueSize,
        ILogger? logger = null, Action<string, PrintRequestParams, PrinterResult>? onPrintCompleted = null)
    {
        _printService = printService;
        _logger = logger ?? new NullLogger();
        _onPrintCompleted = onPrintCompleted;
        _queue = new BlockingCollection<(string, PrintRequestParams)>(maxQueueSize);
        // LongRunning: 打印队列需要专用线程以避免阻塞线程池
        _worker = Task.Factory.StartNew(
            ProcessQueue,
            _cts.Token,
            TaskCreationOptions.LongRunning,
            TaskScheduler.Default);
    }

    /// <summary>
    /// 将打印任务加入队列
    /// </summary>
    /// <param name="requestId">请求ID</param>
    /// <param name="request">打印请求参数</param>
    /// <returns>任务ID</returns>
    public string Enqueue(string? requestId, PrintRequestParams request)
    {
        var jobId = requestId ?? Guid.NewGuid().ToString();
        var job = new PrintJob
        {
            JobId = jobId,
            PrinterName = request.PrinterName,
            Status = JobStatus.Queued
        };
        lock (_jobLock)
        {
            _jobs[jobId] = (job, request);
        }
        if (!_queue.TryAdd((jobId, request)))
        {
            lock (_jobLock) { _jobs.Remove(jobId); }
            throw new InvalidOperationException("打印队列已满，请稍后重试");
        }
        return jobId;
    }

    /// <summary>
    /// 获取指定任务的状态
    /// </summary>
    /// <param name="jobId">任务ID</param>
    /// <returns>任务信息，不存在时返回 null</returns>
    public PrintJob? GetJobStatus(string jobId)
    {
        lock (_jobLock)
        {
            if (!_jobs.TryGetValue(jobId, out var entry))
                return null;

            var info = entry.Job;
            return new PrintJob
            {
                JobId = info.JobId,
                PrinterName = info.PrinterName,
                Status = info.Status,
                CreatedAt = info.CreatedAt,
                StartedAt = info.StartedAt,
                CompletedAt = info.CompletedAt,
                ErrorMessage = info.ErrorMessage,
                Result = info.Result
            };
        }
    }

    /// <summary>
    /// 获取所有任务列表（不含 Result，减少响应体积；需要完整结果请用 GetJobStatus）
    /// </summary>
    /// <returns>按创建时间倒序排列的任务列表</returns>
    public List<PrintJob> GetAllJobs()
    {
        lock (_jobLock)
        {
            return _jobs.Values.Select(e => new PrintJob
            {
                JobId = e.Job.JobId,
                PrinterName = e.Job.PrinterName,
                Status = e.Job.Status,
                CreatedAt = e.Job.CreatedAt,
                StartedAt = e.Job.StartedAt,
                CompletedAt = e.Job.CompletedAt,
                ErrorMessage = e.Job.ErrorMessage
            }).OrderByDescending(j => j.CreatedAt).ToList();
        }
    }

    private void ProcessQueue()
    {
        var processedCount = 0;
        foreach (var (requestId, request) in _queue.GetConsumingEnumerable(_cts.Token))
        {
            PrintJob jobInfo;
            lock (_jobLock)
            {
                if (!_jobs.TryGetValue(requestId, out var entry))
                    continue;
                jobInfo = entry.Job;
                jobInfo.Status = JobStatus.Printing;
                jobInfo.StartedAt = DateTime.UtcNow;
            }

            PrinterResult? response = null;
            try
            {
                response = _printService.Print(requestId, request, _cts.Token);
                lock (_jobLock)
                {
                    jobInfo.Result = response;
                    jobInfo.Status = response.Success ? JobStatus.Completed : JobStatus.Failed;
                    if (!response.Success)
                        jobInfo.ErrorMessage = response.ErrorInfo?.Message;
                }
            }
            catch (Exception ex)
            {
                lock (_jobLock)
                {
                    jobInfo.Status = JobStatus.Failed;
                    jobInfo.ErrorMessage = ex.Message;
                }
                response = PrinterResult.Error(requestId, ErrorCode.InternalError, ex.Message);
                _logger.Log(LogLevel.Error, $"打印任务 {requestId} 失败: {ex.Message}", requestId);
            }
            finally
            {
                lock (_jobLock) { jobInfo.CompletedAt = DateTime.UtcNow; }
            }

            if (response != null)
                _onPrintCompleted?.Invoke(requestId, request, response);

            if (++processedCount % 100 == 0)
                PurgeExpiredJobs();
        }
    }

    private void PurgeExpiredJobs()
    {
        var cutoff = DateTime.UtcNow.AddHours(-1);
        lock (_jobLock)
        {
            var expiredKeys = _jobs
                .Where(kvp => kvp.Value.Job.CompletedAt.HasValue && kvp.Value.Job.CompletedAt.Value < cutoff)
                .Select(kvp => kvp.Key)
                .ToList();
            foreach (var key in expiredKeys)
                _jobs.Remove(key);
        }
    }

    /// <summary>
    /// 释放队列资源
    /// </summary>
    public void Dispose()
    {
        _queue.CompleteAdding();
        _cts.Cancel();
        try { _worker.Wait(TimeSpan.FromSeconds(30)); }
        catch (Exception) { }
        if (_worker.IsFaulted)
            _logger.Log(LogLevel.Error, $"打印队列工作线程异常: {_worker.Exception?.InnerException?.Message}");
        _cts.Dispose();
        _queue.Dispose();
    }
}
