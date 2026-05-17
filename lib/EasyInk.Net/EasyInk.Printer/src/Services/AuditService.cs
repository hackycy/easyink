using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using System.Linq;
using System.Threading;
using Dapper;
using EasyInk.Printer.Config;
using EasyInk.Printer.Models;
using EasyInk.Printer.Services.Abstractions;

namespace EasyInk.Printer.Services;

/// <summary>
/// 审计日志服务，使用 SQLite 存储打印日志
/// </summary>
public class AuditService : IAuditService, IDisposable
{
    private readonly string _connectionString;
    private readonly int _retentionDays;
    private readonly Timer? _cleanupTimer;
    private int _cleanupRunning;

    /// <summary>
    /// 初始化审计服务
    /// </summary>
    /// <param name="dbPath">数据库文件路径，默认为当前用户本地应用数据目录下的 audit.db</param>
    public AuditService(string? dbPath = null, int retentionDays = 90, bool startCleanupTimer = true)
    {
        var path = HostConfig.ResolveDbPath(dbPath!);
        _connectionString = $"Data Source={path}";
        _retentionDays = Math.Max(1, retentionDays);

        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        InitializeDatabase();
        TryCleanupOldLogs();

        if (startCleanupTimer)
            _cleanupTimer = new Timer(_ => TryCleanupOldLogs(), null, TimeSpan.FromDays(1), TimeSpan.FromDays(1));
    }

    private void InitializeDatabase()
    {
        using var connection = new SQLiteConnection(_connectionString);
        connection.Execute(@"
            CREATE TABLE IF NOT EXISTS PrintAuditLog (
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
            )
        ");

        connection.Execute("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON PrintAuditLog(Timestamp)");
        connection.Execute("CREATE INDEX IF NOT EXISTS idx_audit_printer ON PrintAuditLog(PrinterName)");
        connection.Execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON PrintAuditLog(UserId)");
        connection.Execute("CREATE INDEX IF NOT EXISTS idx_audit_status ON PrintAuditLog(Status)");
    }

    /// <summary>
    /// 记录打印日志
    /// </summary>
    public void LogPrint(PrintAuditLog log)
    {
        using var connection = new SQLiteConnection(_connectionString);
        connection.Execute(@"
            INSERT INTO PrintAuditLog
            (Timestamp, PrinterName, PaperWidth, PaperHeight, PaperUnit,
             Copies, Dpi, UserId, LabelType, Status, ErrorMessage, JobId)
            VALUES
            (@Timestamp, @PrinterName, @PaperWidth, @PaperHeight, @PaperUnit,
             @Copies, @Dpi, @UserId, @LabelType, @Status, @ErrorMessage, @JobId)
        ", log);
    }

    /// <summary>
    /// 查询审计日志
    /// </summary>
    public List<PrintAuditLog> QueryLogs(
        DateTime? startTime = null,
        DateTime? endTime = null,
        string? printerName = null,
        string? userId = null,
        string? status = null,
        int limit = 100,
        int offset = 0)
    {
        using var connection = new SQLiteConnection(_connectionString);

        var sql = "SELECT * FROM PrintAuditLog WHERE 1=1";
        var parameters = new DynamicParameters();

        if (startTime.HasValue)
        {
            sql += " AND Timestamp >= @StartTime";
            parameters.Add("StartTime", startTime.Value);
        }

        if (endTime.HasValue)
        {
            sql += " AND Timestamp <= @EndTime";
            parameters.Add("EndTime", endTime.Value);
        }

        if (!string.IsNullOrEmpty(printerName))
        {
            sql += " AND PrinterName = @PrinterName";
            parameters.Add("PrinterName", printerName);
        }

        if (!string.IsNullOrEmpty(userId))
        {
            sql += " AND UserId = @UserId";
            parameters.Add("UserId", userId);
        }

        if (!string.IsNullOrEmpty(status))
        {
            sql += " AND Status = @Status";
            parameters.Add("Status", status);
        }

        sql += " ORDER BY Timestamp DESC LIMIT @Limit OFFSET @Offset";
        parameters.Add("Limit", limit);
        parameters.Add("Offset", offset);

        return connection.Query<PrintAuditLog>(sql, parameters).ToList();
    }

    public int CleanupOldLogs(DateTime? now = null)
    {
        var cutoff = (now ?? DateTime.Now).AddDays(-_retentionDays);
        using var connection = new SQLiteConnection(_connectionString);
        connection.Open();
        using var transaction = connection.BeginTransaction();
        var deleted = connection.Execute(
            "DELETE FROM PrintAuditLog WHERE Timestamp < @Cutoff",
            new { Cutoff = cutoff },
            transaction);
        transaction.Commit();

        if (deleted > 0)
            connection.Execute("VACUUM");

        return deleted;
    }

    private void TryCleanupOldLogs()
    {
        if (Interlocked.Exchange(ref _cleanupRunning, 1) == 1)
            return;

        try
        {
            CleanupOldLogs();
        }
        catch (Exception ex)
        {
            SimpleLogger.Error("审计日志清理失败", ex);
        }
        finally
        {
            Interlocked.Exchange(ref _cleanupRunning, 0);
        }
    }

    public void Dispose()
    {
        _cleanupTimer?.Dispose();
    }
}
