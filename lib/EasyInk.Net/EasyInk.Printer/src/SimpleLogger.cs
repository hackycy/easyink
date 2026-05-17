using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace EasyInk.Printer;

/// <summary>
/// 轻量级日志，同时输出到 Debug 和文件
/// </summary>
public static class SimpleLogger
{
    private static readonly object Lock = new object();
    private static string? _logDirectory;
    private static bool _debugEnabled;
    private static int _retentionDays = 7;
    private static Timer? _cleanupTimer;

    /// <summary>
    /// 配置日志输出目录
    /// </summary>
    public static void Configure(string logDirectory, bool debugEnabled = false, int retentionDays = 7)
    {
        if (string.IsNullOrEmpty(logDirectory)) return;
        if (!Directory.Exists(logDirectory))
            Directory.CreateDirectory(logDirectory);

        lock (Lock)
        {
            _logDirectory = logDirectory;
            _debugEnabled = debugEnabled;
            _retentionDays = Math.Max(1, retentionDays);
            _cleanupTimer?.Dispose();
            _cleanupTimer = new Timer(_ => CleanupExpiredLogs(), null, TimeSpan.FromDays(1), TimeSpan.FromDays(1));
        }

        CleanupExpiredLogs();
    }

    /// <summary>
    /// 记录信息日志
    /// </summary>
    public static void Info(string message)
    {
        Write("INFO", message);
    }

    /// <summary>
    /// 记录调试日志
    /// </summary>
    public static void Debug(string message, Exception? ex = null)
    {
        var text = ex != null ? $"{message}: {ex}" : message;
        Write("DEBUG", text);
    }

    /// <summary>
    /// 记录错误日志
    /// </summary>
    public static void Error(string message, Exception? ex = null)
    {
        var text = ex != null ? $"{message}: {ex}" : message;
        Write("ERROR", text);
    }

    private static void Write(string level, string message)
    {
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [{level}] {message}";
        System.Diagnostics.Debug.WriteLine(line);

        if (!ShouldWriteToFile(level)) return;
        try
        {
            lock (Lock)
            {
                if (_logDirectory == null) return;
                var path = Path.Combine(_logDirectory, $"easyink-{DateTime.Now:yyyy-MM-dd}.log");
                File.AppendAllText(path, line + Environment.NewLine);
            }
        }
        catch
        {
            // 日志写入失败不应影响业务
        }
    }

    private static bool ShouldWriteToFile(string level)
    {
        if (string.Equals(level, "ERROR", StringComparison.OrdinalIgnoreCase))
            return true;
        return _debugEnabled;
    }

    private static void CleanupExpiredLogs()
    {
        string? directory;
        int retentionDays;
        lock (Lock)
        {
            directory = _logDirectory;
            retentionDays = _retentionDays;
        }

        if (string.IsNullOrEmpty(directory) || !Directory.Exists(directory)) return;

        var cutoff = DateTime.Now.Date.AddDays(-retentionDays + 1);
        try
        {
            foreach (var path in Directory.GetFiles(directory, "easyink-*.log"))
            {
                try
                {
                    var name = Path.GetFileNameWithoutExtension(path);
                    var datePart = name.StartsWith("easyink-", StringComparison.OrdinalIgnoreCase)
                        ? name.Substring("easyink-".Length)
                        : string.Empty;
                    DateTime logDate;
                    var expired = DateTime.TryParseExact(
                            datePart,
                            "yyyy-MM-dd",
                            System.Globalization.CultureInfo.InvariantCulture,
                            System.Globalization.DateTimeStyles.None,
                            out logDate)
                        ? logDate < cutoff
                        : File.GetLastWriteTime(path) < cutoff;

                    if (expired)
                        File.Delete(path);
                }
                catch
                {
                }
            }
        }
        catch
        {
        }
    }
}
