using System;
using System.Data.SQLite;
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
            DocumentType = "receipt",
            Status = "Success",
            JobId = "job-1"
        });

        var logs = _service.QueryLogs(limit: 10);
        Assert.Single(logs);
        Assert.Equal("TestPrinter", logs[0].PrinterName);
        Assert.Equal("receipt", logs[0].DocumentType);
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

    [Fact]
    public void Constructor_MigratesLegacyLabelTypeToDocumentType()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"audit_legacy_{Guid.NewGuid():N}.db");
        try
        {
            using (var connection = new SQLiteConnection($"Data Source={dbPath}"))
            {
                connection.Open();
                using var command = connection.CreateCommand();
                command.CommandText = @"
                    CREATE TABLE PrintAuditLog (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        Timestamp DATETIME NOT NULL,
                        PrinterName TEXT NOT NULL,
                        PaperWidth REAL,
                        PaperHeight REAL,
                        PaperUnit TEXT DEFAULT 'mm',
                        Copies INTEGER DEFAULT 1,
                        Dpi INTEGER,
                        UserId TEXT,
                        LabelType TEXT,
                        Status TEXT NOT NULL,
                        ErrorMessage TEXT,
                        JobId TEXT,
                        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    INSERT INTO PrintAuditLog
                    (Timestamp, PrinterName, UserId, LabelType, Status, JobId)
                    VALUES
                    (@Timestamp, 'LegacyPrinter', 'user-1', 'receipt', 'Success', 'legacy-job');
                ";
                command.Parameters.AddWithValue("@Timestamp", DateTime.UtcNow);
                command.ExecuteNonQuery();
            }

            using var service = new AuditService(dbPath, startCleanupTimer: false);
            var logs = service.QueryLogs(limit: 10);

            Assert.Single(logs);
            Assert.Equal("receipt", logs[0].DocumentType);
        }
        finally
        {
            if (File.Exists(dbPath))
                File.Delete(dbPath);
        }
    }
}
