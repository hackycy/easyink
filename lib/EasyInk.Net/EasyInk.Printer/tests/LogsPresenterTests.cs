using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using EasyInk.Printer.Models;
using EasyInk.Printer.Services.Abstractions;
using EasyInk.Printer.UI.Presenters;
using Xunit;

namespace EasyInk.Printer.Tests;

public class LogsPresenterTests
{
    [Fact]
    public async Task RefreshAsync_UsesWholeDayRangeForDateOnlyFilters()
    {
        LangManager.Initialize("zh-CN");
        var service = new FakeAuditService(Array.Empty<PrintAuditLog>());
        var presenter = new LogsPresenter(service);
        presenter.Attach(new TestLogsView());

        await presenter.RefreshAsync(
            new DateTime(2026, 5, 17, 15, 30, 0),
            new DateTime(2026, 5, 18, 9, 45, 0));

        Assert.Equal(new DateTime(2026, 5, 17, 0, 0, 0), service.LastStartTime);
        Assert.Equal(new DateTime(2026, 5, 18, 23, 59, 59, 999).AddTicks(9999), service.LastEndTime);
    }

    [Fact]
    public async Task ExportCsvAsync_WritesCsvWithCurrentDateRangeAndEscaping()
    {
        LangManager.Initialize("zh-CN");
        var startTime = new DateTime(2026, 5, 17, 0, 0, 0);
        var endTime = new DateTime(2026, 5, 18, 0, 0, 0);
        var service = new FakeAuditService(new[]
        {
            new PrintAuditLog
            {
                Timestamp = new DateTime(2026, 5, 17, 12, 30, 0),
                PrinterName = "Printer, A",
                Status = "Success",
                UserId = "user-1",
                DocumentType = "shipping",
                JobId = "job\"1",
                ErrorMessage = "line1\nline2"
            }
        });
        var presenter = new LogsPresenter(service);
        presenter.Attach(new TestLogsView());
        var csvPath = Path.Combine(Path.GetTempPath(), $"easyink_logs_export_{Guid.NewGuid():N}.csv");

        try
        {
            var count = await presenter.ExportCsvAsync(endTime, startTime, csvPath);
            var csv = File.ReadAllText(csvPath);

            Assert.Equal(1, count);
            Assert.Equal(startTime, service.LastStartTime);
            Assert.Equal(new DateTime(2026, 5, 18, 23, 59, 59, 999).AddTicks(9999), service.LastEndTime);
            Assert.StartsWith("时间,打印机,状态,用户,文档类型,任务ID,错误", csv);
            Assert.Contains("\"Printer, A\"", csv);
            Assert.Contains("\"job\"\"1\"", csv);
            Assert.Contains("\"line1\nline2\"", csv);
        }
        finally
        {
            if (File.Exists(csvPath))
                File.Delete(csvPath);
        }
    }

    private sealed class FakeAuditService : IAuditService
    {
        private readonly IReadOnlyList<PrintAuditLog> _logs;

        public FakeAuditService(IReadOnlyList<PrintAuditLog> logs)
        {
            _logs = logs;
        }

        public DateTime? LastStartTime { get; private set; }
        public DateTime? LastEndTime { get; private set; }

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
            LastStartTime = startTime;
            LastEndTime = endTime;
            return new List<PrintAuditLog>(_logs);
        }

        public IEnumerable<PrintAuditLog> EnumerateLogs(
            DateTime? startTime = null,
            DateTime? endTime = null,
            string? printerName = null,
            string? userId = null,
            string? status = null)
        {
            LastStartTime = startTime;
            LastEndTime = endTime;

            foreach (var log in _logs)
                yield return log;
        }
    }

    private sealed class TestLogsView : ILogsView
    {
        public void RunOnUiThread(Action action)
        {
            action();
        }

        public void SetBusy(bool busy)
        {
        }

        public void SetError(string? message)
        {
        }

        public void SetRows(IReadOnlyList<ListViewRow> rows)
        {
        }
    }
}
