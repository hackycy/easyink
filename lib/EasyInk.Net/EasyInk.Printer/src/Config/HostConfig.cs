using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using Newtonsoft.Json;

namespace EasyInk.Printer.Config;

public class HostConfig
{
    private const int MinWebSocketConnections = 10;
    private const int DefaultWebSocketConnections = 100;
    private const int MinQueueSize = 10;
    private const int DefaultQueueSize = 100;
    private const int MinPrintTimeoutSeconds = 5;
    private const int DefaultPrintTimeoutSeconds = 30;
    private const int MinConcurrentRequests = 5;
    private const int DefaultConcurrentRequests = 50;

    private int _maxWebSocketConnections = DefaultWebSocketConnections;
    private int _maxQueueSize = DefaultQueueSize;
    private int _printTimeoutSeconds = DefaultPrintTimeoutSeconds;
    private int _maxConcurrentRequests = DefaultConcurrentRequests;

    private static readonly string DefaultDataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "EasyInk.Printer",
        "data");

    private static readonly string DefaultBundledSumatraPdfPath = Path.Combine(
        AppDomain.CurrentDomain.BaseDirectory,
        "SumatraPDF",
        "SumatraPDF.exe");

    public int HttpPort { get; set; } = 18080;
    public bool AutoStart { get; set; } = false;
    public bool MinimizeToTray { get; set; } = true;
    public bool StartMinimized { get; set; } = true;
    public string? DbPath { get; set; }
    public string? CrashLogDir { get; set; }
    public bool TrustAllOrigins { get; set; } = false;
    public string? ApiKey { get; set; }
    public string Language { get; set; } = "";

    /// <summary>
    /// 低 DPI 小票/热敏打印机位图增强模式：normal、boost、monochrome。默认 boost。
    /// </summary>
    public string LowDpiPrintEnhancement { get; set; } = "boost";

    /// <summary>
    /// 使用 Raw ESC/POS 直发模式的打印机名称列表（模糊匹配，忽略大小写）。
    /// </summary>
    public List<string> RawPrinterNames { get; set; } = new();

    /// <summary>
    /// Raw 打印 DPI。默认 203（通用热敏打印机分辨率，8 dots/mm）。
    /// </summary>
    public int RawPrintDpi { get; set; } = 203;

    /// <summary>
    /// Raw 打印最大宽度（点数）。默认 576（80mm 纸宽热敏机典型值，72mm 可打印 × 8 dots/mm）。
    /// </summary>
    public int RawPrintMaxDotsWidth { get; set; } = 576;

    /// <summary>
    /// SumatraPDF.exe 路径。为空时不启用 SumatraPDF fallback。
    /// </summary>
    public string? SumatraPdfPath { get; set; } = DefaultBundledSumatraPdfPath;

    /// <summary>
    /// 使用 SumatraPDF fallback 的打印机名称列表（模糊匹配，忽略大小写）。
    /// </summary>
    public List<string> SumatraPrinterNames { get; set; } = new();

    /// <summary>
    /// SumatraPDF -print-settings 参数，默认 fit。
    /// </summary>
    public string SumatraPrintSettings { get; set; } = "fit";

    /// <summary>
    /// SumatraPDF 打印进程超时时间（秒）。
    /// </summary>
    public int SumatraTimeoutSeconds { get; set; } = 60;

    public int MaxWebSocketConnections
    {
        get => _maxWebSocketConnections;
        set => _maxWebSocketConnections = value < MinWebSocketConnections ? MinWebSocketConnections : value;
    }

    public int MaxQueueSize
    {
        get => _maxQueueSize;
        set => _maxQueueSize = value < MinQueueSize ? MinQueueSize : value;
    }

    public int PrintTimeoutSeconds
    {
        get => _printTimeoutSeconds;
        set => _printTimeoutSeconds = value < MinPrintTimeoutSeconds ? MinPrintTimeoutSeconds : value;
    }

    public int MaxConcurrentRequests
    {
        get => _maxConcurrentRequests;
        set => _maxConcurrentRequests = value < MinConcurrentRequests ? MinConcurrentRequests : value;
    }

    public static string DefaultDbPath => Path.Combine(DefaultDataDir, "audit.db");

    public static string DefaultCrashLogDir => Path.Combine(DefaultDataDir, "crash");

    public static string DefaultSumatraPdfPath => DefaultBundledSumatraPdfPath;

    public static string ResolveDbPath(string dbPath)
    {
        return string.IsNullOrWhiteSpace(dbPath) ? DefaultDbPath : dbPath;
    }

    public static string ResolveCrashLogDir(string dir)
    {
        return string.IsNullOrWhiteSpace(dir) ? DefaultCrashLogDir : dir;
    }

    public static bool IsValidFilePath(string path, out string? error)
    {
        error = null;

        if (string.IsNullOrWhiteSpace(path))
        {
            error = LangManager.Get("Config_PathNotEmpty");
            return false;
        }

        path = path.Trim();

        try
        {
            var invalidChars = Path.GetInvalidPathChars();
            if (path.IndexOfAny(invalidChars) >= 0)
            {
                error = LangManager.Get("Config_PathInvalidChars");
                return false;
            }
        }
        catch
        {
            error = LangManager.Get("Config_PathInvalidFormat");
            return false;
        }

        var root = Path.GetPathRoot(path);
        if (string.IsNullOrEmpty(root) || !Regex.IsMatch(root, @"^[A-Za-z]:\\"))
        {
            error = LangManager.Get("Config_PathNoDrive");
            return false;
        }

        return true;
    }

    private static readonly string ConfigDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "EasyInk.Printer");

    private static readonly string ConfigPath = Path.Combine(ConfigDir, "config.json");

    private const string AutoStartRegKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AutoStartRegName = "EasyInkPrinter";
    private const string LegacyAutoStartRegName = "EasyInkPrinterHost";

    public static bool GetAutoStartRegistry()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(AutoStartRegKey, false);
            return HasAutoStartValue(key, AutoStartRegName) || HasAutoStartValue(key, LegacyAutoStartRegName);
        }
        catch
        {
            return false;
        }
    }

    public static void SetAutoStartRegistry(bool enable)
    {
        SetAutoStartRegistry(enable, Process.GetCurrentProcess().MainModule.FileName);
    }

    internal static string BuildAutoStartCommand(string exePath)
    {
        return $"\"{exePath}\" --autostart";
    }

    internal static void SetAutoStartRegistry(bool enable, string exePath)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(AutoStartRegKey, true);
            if (key == null) return;

            if (enable)
            {
                key.SetValue(AutoStartRegName, BuildAutoStartCommand(exePath));
                key.DeleteValue(LegacyAutoStartRegName, false);
            }
            else
            {
                key.DeleteValue(AutoStartRegName, false);
                key.DeleteValue(LegacyAutoStartRegName, false);
            }
        }
        catch (Exception ex)
        {
            EasyInk.Printer.SimpleLogger.Error("设置开机自启动失败", ex);
        }
    }

    public static void ReconcileAutoStartRegistry()
    {
        if (!GetAutoStartRegistry())
            return;

        SetAutoStartRegistry(true);
    }

    private static bool HasAutoStartValue(RegistryKey? key, string valueName)
    {
        return key?.GetValue(valueName) != null;
    }

    public static HostConfig Load()
    {
        try
        {
            if (File.Exists(ConfigPath))
            {
                var json = File.ReadAllText(ConfigPath);
                return JsonConvert.DeserializeObject<HostConfig>(json) ?? new HostConfig();
            }
        }
        catch (Exception ex)
        {
            EasyInk.Printer.SimpleLogger.Error("配置读取失败，使用默认值", ex);
        }
        return new HostConfig();
    }

    public void Save()
    {
        if (!Directory.Exists(ConfigDir))
            Directory.CreateDirectory(ConfigDir);

        var json = JsonConvert.SerializeObject(this, Formatting.Indented);
        var tmpPath = ConfigPath + ".tmp";
        File.WriteAllText(tmpPath, json);
        File.Copy(tmpPath, ConfigPath, overwrite: true);
        File.Delete(tmpPath);
    }
}
