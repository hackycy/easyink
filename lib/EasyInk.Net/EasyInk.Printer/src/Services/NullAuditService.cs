using System;
using System.Collections.Generic;
using EasyInk.Printer.Models;
using EasyInk.Printer.Services.Abstractions;

namespace EasyInk.Printer.Services;

/// <summary>
/// 审计组件不可用时的降级实现，避免非关键功能阻塞打印服务启动。
/// </summary>
public class NullAuditService : IAuditService
{
    public void LogPrint(PrintAuditLog log)
    {
    }

    public List<PrintAuditLog> QueryLogs(
        DateTime? startTime = null,
        DateTime? endTime = null,
        string? printerName = null,
        string? userId = null,
        string? status = null,
        int limit = 100,
        int offset = 0)
    {
        return new List<PrintAuditLog>();
    }

    public IEnumerable<PrintAuditLog> EnumerateLogs(
        DateTime? startTime = null,
        DateTime? endTime = null,
        string? printerName = null,
        string? userId = null,
        string? status = null)
    {
        yield break;
    }
}
