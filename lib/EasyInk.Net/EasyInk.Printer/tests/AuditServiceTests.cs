using System;
using System.IO;
using System.Linq;
using EasyInk.Printer.Models;
using EasyInk.Printer.Services;
using Xunit;

namespace EasyInk.Printer.Tests;

public class AuditServiceTests : IDisposable
{
    private readonly string _dbPath;
    private readonly AuditService _service;

    public AuditServiceTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"audit_test_{Guid.NewGuid():N}.db");
        _service = new AuditService(_dbPath);
    }

    public void Dispose()
    {
        _service.Dispose();
        if (File.Exists(_dbPath))
            File.Delete(_dbPath);
    }

    [Fact]
    public void LogPrint_InsertsRecord()
    {
        _service.LogPrint(new PrintAuditLog
        {
            Timestamp = DateTime.UtcNow,
            PrinterName = "TestPrinter",
            Status = "Success",
            JobId = "job-1"
        });

        var logs = _service.QueryLogs(limit: 10);
        Assert.Single(logs);
        Assert.Equal("TestPrinter", logs[0].PrinterName);
        Assert.Equal("Success", logs[0].Status);
        Assert.Equal("job-1", logs[0].JobId);
    }

    [Fact]
    public void QueryLogs_FilterByPrinterName()
    {
        _service.LogPrint(new PrintAuditLog
        {
            Timestamp = DateTime.UtcNow, PrinterName = "PrinterA", Status = "Success", JobId = "j1"
        });
        _service.LogPrint(new PrintAuditLog
        {
            Timestamp = DateTime.UtcNow, PrinterName = "PrinterB", Status = "Success", JobId = "j2"
        });

        var logs = _service.QueryLogs(printerName: "PrinterA");
        Assert.Single(logs);
        Assert.Equal("PrinterA", logs[0].PrinterName);
    }

    [Fact]
    public void QueryLogs_FilterByStatus()
    {
        _service.LogPrint(new PrintAuditLog
        {
            Timestamp = DateTime.UtcNow, PrinterName = "P", Status = "Success", JobId = "j1"
        });
        _service.LogPrint(new PrintAuditLog
        {
            Timestamp = DateTime.UtcNow, PrinterName = "P", Status = "Failed", JobId = "j2"
        });

        var logs = _service.QueryLogs(status: "Failed");
        Assert.Single(logs);
        Assert.Equal("Failed", logs[0].Status);
    }

    [Fact]
    public void QueryLogs_FilterByTimeRange()
    {
        var now = DateTime.UtcNow;
        _service.LogPrint(new PrintAuditLog
        {
            Timestamp = now.AddHours(-2), PrinterName = "P", Status = "Success", JobId = "j1"
        });
        _service.LogPrint(new PrintAuditLog
        {
            Timestamp = now, PrinterName = "P", Status = "Success", JobId = "j2"
        });

        var logs = _service.QueryLogs(startTime: now.AddHours(-1));
        Assert.Single(logs);
        Assert.Equal("j2", logs[0].JobId);
    }

    [Fact]
    public void QueryLogs_Pagination()
    {
        for (int i = 0; i < 5; i++)
        {
            _service.LogPrint(new PrintAuditLog
            {
                Timestamp = DateTime.UtcNow.AddSeconds(i),
                PrinterName = "P",
                Status = "Success",
                JobId = $"j{i}"
            });
        }

        var page1 = _service.QueryLogs(limit: 2, offset: 0);
        var page2 = _service.QueryLogs(limit: 2, offset: 2);

        Assert.Equal(2, page1.Count);
        Assert.Equal(2, page2.Count);
        Assert.NotEqual(page1[0].JobId, page2[0].JobId);
    }

    [Fact]
    public void QueryLogs_ReturnsEmptyWhenNoMatch()
    {
        var logs = _service.QueryLogs(printerName: "NonExistent");
        Assert.Empty(logs);
    }

    [Fact]
    public void EnumerateLogs_FiltersByTimeRange()
    {
        var now = DateTime.UtcNow;
        _service.LogPrint(new PrintAuditLog
        {
            Timestamp = now.AddHours(-2), PrinterName = "Old", Status = "Success", JobId = "old"
        });
        _service.LogPrint(new PrintAuditLog
        {
            Timestamp = now, PrinterName = "New", Status = "Success", JobId = "new"
        });

        var logs = _service.EnumerateLogs(startTime: now.AddHours(-1)).ToList();

        Assert.Single(logs);
        Assert.Equal("new", logs[0].JobId);
    }

    [Fact]
    public void CleanupOldLogs_DeletesRowsOlderThanRetention()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"audit_cleanup_{Guid.NewGuid():N}.db");
        try
        {
            using var service = new AuditService(dbPath, retentionDays: 1, startCleanupTimer: false);
            var now = DateTime.Now;
            service.LogPrint(new PrintAuditLog
            {
                Timestamp = now.AddDays(-2), PrinterName = "Old", Status = "Success", JobId = "old"
            });
            service.LogPrint(new PrintAuditLog
            {
                Timestamp = now, PrinterName = "New", Status = "Success", JobId = "new"
            });

            var deleted = service.CleanupOldLogs(now);
            var logs = service.QueryLogs(limit: 10);

            Assert.Equal(1, deleted);
            Assert.Single(logs);
            Assert.Equal("new", logs[0].JobId);
        }
        finally
        {
            if (File.Exists(dbPath))
                File.Delete(dbPath);
        }
    }
}
