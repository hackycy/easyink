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
    private const int MinRetentionDays = 1;
    private const int MaxRetentionDays = 3650;
    private const int DefaultAuditLogRetentionDays = 90;
    private const int DefaultFileLogRetentionDays = 7;
    private const int MinPrintDebugArtifactRetentionCount = 1;
    private const int DefaultPrintDebugArtifactRetentionCount = 10;
    private const int MinRenderPort = 1024;
    private const int DefaultRenderPort = 18181;
    private const int MinRenderRequestTimeoutMs = 1000;
    private const int DefaultRenderRequestTimeoutMs = 30000;
    private const int DefaultRenderIdleTimeoutMs = 0;
    private const int MinRenderMaxConcurrency = 1;
    private const int DefaultRenderMaxConcurrency = 2;
    private const int MinRenderMaxQueueSize = 0;
    private const int DefaultRenderMaxQueueSize = 16;

    private int _maxWebSocketConnections = DefaultWebSocketConnections;
    private int _maxQueueSize = DefaultQueueSize;
    private int _printTimeoutSeconds = DefaultPrintTimeoutSeconds;
    private int _maxConcurrentRequests = DefaultConcurrentRequests;
    private int _auditLogRetentionDays = DefaultAuditLogRetentionDays;
    private int _fileLogRetentionDays = DefaultFileLogRetentionDays;
    private int _printDebugArtifactRetentionCount = DefaultPrintDebugArtifactRetentionCount;
    private int _renderPort = DefaultRenderPort;
    private int _renderRequestTimeoutMs = DefaultRenderRequestTimeoutMs;
    private int _renderIdleTimeoutMs = DefaultRenderIdleTimeoutMs;
    private int _renderMaxConcurrency = DefaultRenderMaxConcurrency;
    private int _renderMaxQueueSize = DefaultRenderMaxQueueSize;

    private static readonly string DefaultDataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "EasyInk.Printer",
        "data");

    private static readonly string DefaultTempDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "EasyInk.Printer",
        "temp");

    private static readonly string DefaultRenderDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "EasyInk.Printer",
        "render");

    private static readonly string DefaultLogDir = Path.Combine(DefaultDataDir, "logs");

    private static readonly string DefaultBundledSumatraPdfPath = Path.Combine(
        AppDomain.CurrentDomain.BaseDirectory,
        "SumatraPDF",
        "SumatraPDF.exe");

    private static readonly string DefaultBundledRenderHostPathX64 = Path.Combine(
        AppDomain.CurrentDomain.BaseDirectory,
        "render",
        "host",
        "win-x64",
        "easyink-render.exe");

    private static readonly string DefaultBundledRenderHostPathX86 = Path.Combine(
        AppDomain.CurrentDomain.BaseDirectory,
        "render",
        "host",
        "win-x86",
        "easyink-render.exe");

    private static readonly string DefaultBundledRenderBrowserDir = Path.Combine(
        AppDomain.CurrentDomain.BaseDirectory,
        "render",
        "browser");

    private static readonly string DefaultBundledRenderManifestPath = Path.Combine(
        AppDomain.CurrentDomain.BaseDirectory,
        "render",
        "runtime-manifest.json");

    public int HttpPort { get; set; } = 18080;
    public bool AutoStart { get; set; } = false;
    public bool MinimizeToTray { get; set; } = true;
    public bool StartMinimized { get; set; } = true;
    public string? DbPath { get; set; }
    public string? CrashLogDir { get; set; }
    public bool PrintDebugLoggingEnabled { get; set; } = false;
    public string? PrintDebugArtifactsDir { get; set; }
    public bool TrustAllOrigins { get; set; } = false;
    public string? ApiKey { get; set; }
    public string Language { get; set; } = "";

    public bool RenderEnabled { get; set; } = false;
    public string? RenderHostPath { get; set; } = null;
    public string? RenderBrowserExecutablePath { get; set; }
    public string? RenderBrowserHeadlessMode { get; set; } = RenderHeadlessModeCatalog.AutoKey;
    public string? RenderBrowserDir { get; set; }
    public string? RenderBrowserArchivePath { get; set; }
    public string? RenderBrowserDownloadUrl { get; set; }
    public string? RenderBrowserVersion { get; set; } = RenderBrowserVersionCatalog.StableKey;
    public string? RenderManifestPath { get; set; }
    public string? RenderProfileRoot { get; set; }
    public string? RenderTempDir { get; set; }
    public string? RenderLogDir { get; set; }
    public bool RenderDiagnosticsEnabled { get; set; } = false;
    public bool RenderDisableSandbox { get; set; } = false;

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
    /// SumatraPDF 打印前写入临时 PDF 的目录。为空时使用用户本机应用数据目录。
    /// </summary>
    public string? SumatraTempDir { get; set; } = DefaultSumatraTempDir;

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

    public int AuditLogRetentionDays
    {
        get => _auditLogRetentionDays;
        set => _auditLogRetentionDays = Clamp(value, MinRetentionDays, MaxRetentionDays);
    }

    public int FileLogRetentionDays
    {
        get => _fileLogRetentionDays;
        set => _fileLogRetentionDays = Clamp(value, MinRetentionDays, MaxRetentionDays);
    }

    public int PrintDebugArtifactRetentionCount
    {
        get => _printDebugArtifactRetentionCount;
        set => _printDebugArtifactRetentionCount = value < MinPrintDebugArtifactRetentionCount
            ? MinPrintDebugArtifactRetentionCount
            : value;
    }

    public int RenderPort
    {
        get => _renderPort;
        set => _renderPort = Clamp(value, MinRenderPort, 65535);
    }

    public int RenderRequestTimeoutMs
    {
        get => _renderRequestTimeoutMs;
        set => _renderRequestTimeoutMs = value < MinRenderRequestTimeoutMs ? MinRenderRequestTimeoutMs : value;
    }

    public int RenderIdleTimeoutMs
    {
        get => _renderIdleTimeoutMs;
        set => _renderIdleTimeoutMs = value < 0 ? 0 : value;
    }

    public int RenderMaxConcurrency
    {
        get => _renderMaxConcurrency;
        set => _renderMaxConcurrency = value < MinRenderMaxConcurrency ? MinRenderMaxConcurrency : value;
    }

    public int RenderMaxQueueSize
    {
        get => _renderMaxQueueSize;
        set => _renderMaxQueueSize = value < MinRenderMaxQueueSize ? MinRenderMaxQueueSize : value;
    }

    public static string DefaultDbPath => Path.Combine(DefaultDataDir, "audit.db");

    public static string DefaultCrashLogDir => Path.Combine(DefaultDataDir, "crash");

    public static string DefaultFileLogDir => DefaultLogDir;

    public static string DefaultPrintDebugArtifactsDir => Path.Combine(DefaultLogDir, "print-debug");

    public static string DefaultSumatraTempDir => Path.Combine(DefaultTempDir, "sumatra");

    public static string DefaultSumatraPdfPath => DefaultBundledSumatraPdfPath;

    public static string DefaultRenderHostPath
        => Environment.Is64BitOperatingSystem ? DefaultBundledRenderHostPathX64 : DefaultBundledRenderHostPathX86;

    public static string DefaultRenderBrowserDir => DefaultBundledRenderBrowserDir;

    public static string DefaultRenderManifestPath => DefaultBundledRenderManifestPath;

    public static string DefaultRenderBrowserCacheDir => Path.Combine(DefaultRenderDir, "browser");

    public static string DefaultRenderBrowserVersionsDir => Path.Combine(DefaultRenderBrowserCacheDir, "versions");

    public static string DefaultRenderProfileRoot => Path.Combine(DefaultRenderDir, "profile");

    public static string DefaultRenderTempDir => Path.Combine(DefaultRenderDir, "temp");

    public static string DefaultRenderLogDir => Path.Combine(DefaultDataDir, "logs", "render");

    public static string GetRenderBrowserVersionDir(string? versionKey)
    {
        return GetRenderBrowserVersionDir(DefaultRenderBrowserCacheDir, versionKey);
    }

    public static string GetRenderBrowserVersionDir(string browserDir, string? versionKey)
    {
        var normalizedKey = RenderBrowserVersionCatalog.NormalizeKey(versionKey);
        return Path.Combine(ResolveRenderBrowserDir(browserDir), "versions", SanitizePathSegment(normalizedKey));
    }

    public static string ResolveDbPath(string dbPath)
    {
        return string.IsNullOrWhiteSpace(dbPath) ? DefaultDbPath : dbPath;
    }

    public static string ResolveCrashLogDir(string dir)
    {
        return string.IsNullOrWhiteSpace(dir) ? DefaultCrashLogDir : dir;
    }

    public static string ResolvePrintDebugArtifactsDir(string dir)
    {
        return string.IsNullOrWhiteSpace(dir) ? DefaultPrintDebugArtifactsDir : dir;
    }

    public static string ResolveSumatraTempDir(string dir)
    {
        return string.IsNullOrWhiteSpace(dir) ? DefaultSumatraTempDir : dir;
    }

    public static string ResolveRenderHostPath(string path)
    {
        if (!string.IsNullOrWhiteSpace(path))
            return path;

        var preferred = DefaultRenderHostPath;
        if (File.Exists(preferred))
            return preferred;

        var fallback = Environment.Is64BitOperatingSystem ? DefaultBundledRenderHostPathX86 : DefaultBundledRenderHostPathX64;
        return File.Exists(fallback) ? fallback : preferred;
    }

    public static string ResolveRenderBrowserDir(string dir)
    {
        return string.IsNullOrWhiteSpace(dir) ? DefaultRenderBrowserCacheDir : dir;
    }

    public static string ResolveRenderProfileRoot(string dir)
    {
        return string.IsNullOrWhiteSpace(dir) ? DefaultRenderProfileRoot : dir;
    }

    public static string ResolveRenderTempDir(string dir)
    {
        return string.IsNullOrWhiteSpace(dir) ? DefaultRenderTempDir : dir;
    }

    public static string ResolveRenderLogDir(string dir)
    {
        return string.IsNullOrWhiteSpace(dir) ? DefaultRenderLogDir : dir;
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

    private static int Clamp(int value, int min, int max)
    {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    private static string SanitizePathSegment(string value)
    {
        var result = value.Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars())
            result = result.Replace(invalid, '_');
        return string.IsNullOrWhiteSpace(result) ? RenderBrowserVersionCatalog.StableKey : result;
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

        try
        {
            if (File.Exists(ConfigPath))
                File.Replace(tmpPath, ConfigPath, null);
            else
                File.Move(tmpPath, ConfigPath);
        }
        finally
        {
            if (File.Exists(tmpPath))
                File.Delete(tmpPath);
        }
    }
}
