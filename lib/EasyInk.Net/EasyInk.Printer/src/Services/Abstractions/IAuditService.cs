using System;
using System.Collections.Generic;
using EasyInk.Printer.Models;

namespace EasyInk.Printer.Services.Abstractions;

/// <summary>
/// 审计日志服务
/// </summary>
public interface IAuditService
{
    /// <summary>
    /// 记录打印日志
    /// </summary>
    void LogPrint(PrintAuditLog log);

    /// <summary>
    /// 查询打印日志
    /// </summary>
    List<PrintAuditLog> QueryLogs(
        DateTime? startTime = null,
        DateTime? endTime = null,
        string? printerName = null,
        string? userId = null,
        string? status = null,
        int limit = 100,
        int offset = 0);

    /// <summary>
    /// 流式枚举打印日志，用于桌面端大批量导出。
    /// </summary>
    IEnumerable<PrintAuditLog> EnumerateLogs(
        DateTime? startTime = null,
        DateTime? endTime = null,
        string? printerName = null,
        string? userId = null,
        string? status = null);
}
