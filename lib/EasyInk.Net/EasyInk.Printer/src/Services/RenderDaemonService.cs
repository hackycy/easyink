using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using EasyInk.Printer.Config;
using Newtonsoft.Json.Linq;

namespace EasyInk.Printer.Services;

internal enum RenderDaemonStateKind
{
    Disabled,
    Running,
    Stopped,
    Error
}

internal sealed class RenderDaemonStatus
{
    public RenderDaemonStateKind Kind { get; set; }
    public string Message { get; set; } = string.Empty;
    public int? Pid { get; set; }
    public string BrowserKind { get; set; } = string.Empty;
    public string BrowserName { get; set; } = string.Empty;
    public string BrowserVersion { get; set; } = string.Empty;
    public bool BrowserReady { get; set; }
    public int RunningJobs { get; set; }
    public int PendingJobs { get; set; }
    public int MaxConcurrency { get; set; }
    public int MaxQueueSize { get; set; }
    public long UptimeMs { get; set; }
    public string? Error { get; set; }

    public static RenderDaemonStatus Disabled()
    {
        return new RenderDaemonStatus { Kind = RenderDaemonStateKind.Disabled, Message = LangManager.Get("Dashboard_Status_Disabled") };
    }

    public static RenderDaemonStatus Stopped(string? error = null)
    {
        return new RenderDaemonStatus { Kind = RenderDaemonStateKind.Stopped, Message = LangManager.Get("Dashboard_Status_Stopped"), Error = error };
    }

    public static RenderDaemonStatus ErrorStatus(string error)
    {
        return new RenderDaemonStatus { Kind = RenderDaemonStateKind.Error, Message = LangManager.Get("Dashboard_Status_Error"), Error = error };
    }
}

internal sealed class RenderDaemonService
{
    private readonly HostConfig _config;
    private readonly RenderRuntimeManager _runtimeManager;

    public event Action? StatusChanged;

    public RenderDaemonService(HostConfig config, RenderRuntimeManager runtimeManager)
    {
        _config = config;
        _runtimeManager = runtimeManager;
    }

    public RenderDaemonStatus GetStatus()
    {
        if (!_config.RenderEnabled)
            return RenderDaemonStatus.Disabled();

        var hostPath = HostConfig.ResolveRenderHostPath(_config.RenderHostPath!);
        if (!File.Exists(hostPath))
            return RenderDaemonStatus.ErrorStatus(LangManager.Get("Error_RenderHostMissing", hostPath));

        var result = RunHost(hostPath, "daemon status", 5000);
        if (result.ExitCode != 0)
            return RenderDaemonStatus.Stopped(ChooseOutput(result));

        try
        {
            return ParseStatus(result.Stdout);
        }
        catch (Exception ex)
        {
            return RenderDaemonStatus.ErrorStatus(ex.Message);
        }
    }

    public RenderDaemonStatus GetCachedStatus()
    {
        if (!_config.RenderEnabled)
            return RenderDaemonStatus.Disabled();

        var hostPath = HostConfig.ResolveRenderHostPath(_config.RenderHostPath!);
        if (!File.Exists(hostPath))
            return RenderDaemonStatus.ErrorStatus(LangManager.Get("Error_RenderHostMissing", hostPath));

        var statePath = GetDaemonStatePath();
        if (!File.Exists(statePath))
            return RenderDaemonStatus.Stopped();

        try
        {
            var root = JObject.Parse(File.ReadAllText(statePath));
            var pid = root.Value<int?>("pid");
            if (!pid.HasValue || !IsProcessAlive(pid.Value))
                return RenderDaemonStatus.Stopped();

            var browser = root["browser"] as JObject;
            return new RenderDaemonStatus
            {
                Kind = RenderDaemonStateKind.Running,
                Message = LangManager.Get("Dashboard_Status_Running"),
                Pid = pid,
                BrowserKind = browser?.Value<string>("kind") ?? string.Empty,
                BrowserVersion = browser?.Value<string>("version") ?? string.Empty
            };
        }
        catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException || ex is Newtonsoft.Json.JsonException)
        {
            return RenderDaemonStatus.Stopped(ex.Message);
        }
    }

    public void Start(bool allowBrowserDownload = true)
    {
        try
        {
            var runtime = _runtimeManager.ResolveOptions(allowBrowserDownload: allowBrowserDownload);
            var result = RunHost(runtime.HostPath, BuildDaemonArguments("start", runtime), 30000);
            ThrowIfFailed(result, LangManager.Get("Error_RenderDaemonStartFailed"));
        }
        finally
        {
            NotifyStatusChanged();
        }
    }

    public void Stop()
    {
        var hostPath = HostConfig.ResolveRenderHostPath(_config.RenderHostPath!);
        if (!File.Exists(hostPath))
            throw new FileNotFoundException(LangManager.Get("Error_RenderHostMissing", hostPath), hostPath);

        try
        {
            var result = RunHost(hostPath, "daemon stop", 10000);
            ThrowIfFailed(result, LangManager.Get("Error_RenderDaemonStopFailed"));
        }
        finally
        {
            NotifyStatusChanged();
        }
    }

    public void Restart()
    {
        try
        {
            var runtime = _runtimeManager.ResolveOptions();
            var result = RunHost(runtime.HostPath, BuildDaemonArguments("restart", runtime), 30000);
            ThrowIfFailed(result, LangManager.Get("Error_RenderDaemonStartFailed"));
        }
        finally
        {
            NotifyStatusChanged();
        }
    }

    private void NotifyStatusChanged()
    {
        try
        {
            StatusChanged?.Invoke();
        }
        catch
        {
        }
    }

    private static string GetDaemonStatePath()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrWhiteSpace(localAppData))
            return Path.Combine(localAppData, "EasyInk.Render", "daemon.json");

        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return string.IsNullOrWhiteSpace(userProfile)
            ? Path.Combine(Path.GetTempPath(), "easyink-render", "daemon.json")
            : Path.Combine(userProfile, "AppData", "Local", "EasyInk.Render", "daemon.json");
    }

    private static bool IsProcessAlive(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            return !process.HasExited;
        }
        catch
        {
            return false;
        }
    }

    private static RenderDaemonStatus ParseStatus(string json)
    {
        var root = JObject.Parse(json);
        var browser = root["browser"] as JObject;
        var queue = root["queue"] as JObject;
        var ready = browser?.Value<bool?>("ready") == true;
        var lastError = browser?.Value<string>("lastError");
        return new RenderDaemonStatus
        {
            Kind = ready ? RenderDaemonStateKind.Running : RenderDaemonStateKind.Error,
            Message = ready ? LangManager.Get("Dashboard_Status_Running") : LangManager.Get("Dashboard_Status_Error"),
            Pid = root.Value<int?>("pid"),
            BrowserKind = browser?.Value<string>("kind") ?? string.Empty,
            BrowserName = browser?.Value<string>("name") ?? string.Empty,
            BrowserVersion = browser?.Value<string>("version") ?? string.Empty,
            BrowserReady = ready,
            RunningJobs = queue?.Value<int?>("running") ?? 0,
            PendingJobs = queue?.Value<int?>("pending") ?? 0,
            MaxConcurrency = queue?.Value<int?>("maxConcurrency") ?? 0,
            MaxQueueSize = queue?.Value<int?>("maxQueueSize") ?? 0,
            UptimeMs = root.Value<long?>("uptimeMs") ?? 0,
            Error = lastError
        };
    }

    private static string BuildDaemonArguments(string command, RenderRuntimeOptions runtime)
    {
        var args = new StringBuilder();
        AppendArg(args, "daemon");
        AppendArg(args, command);
        AppendArg(args, "--browser-kind");
        AppendArg(args, runtime.BrowserKind);
        AppendArg(args, "--browser-path");
        AppendArg(args, runtime.BrowserPath);
        AppendArg(args, "--headless-mode");
        AppendArg(args, runtime.HeadlessMode);
        AppendArg(args, "--profile-root");
        AppendArg(args, runtime.ProfileRoot);
        AppendArg(args, "--temp-dir");
        AppendArg(args, runtime.TempDir);
        AppendArg(args, "--log-dir");
        AppendArg(args, runtime.LogDir);
        if (runtime.DisableSandbox)
            AppendArg(args, "--disable-sandbox");
        AppendArg(args, "--max-concurrency");
        AppendArg(args, runtime.MaxConcurrency.ToString());
        AppendArg(args, "--max-queue-size");
        AppendArg(args, runtime.MaxQueueSize.ToString());
        AppendArg(args, "--request-timeout-ms");
        AppendArg(args, runtime.RequestTimeoutMs.ToString());
        AppendArg(args, "--idle-timeout-ms");
        AppendArg(args, runtime.IdleTimeoutMs.ToString());
        return args.ToString();
    }

    internal static string BuildDaemonArgumentsForTest(string command, RenderRuntimeOptions runtime)
    {
        return BuildDaemonArguments(command, runtime);
    }

    private static RenderDaemonCommandResult RunHost(string hostPath, string arguments, int timeoutMs)
    {
        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = hostPath,
            Arguments = arguments,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = Path.GetDirectoryName(hostPath) ?? AppDomain.CurrentDomain.BaseDirectory
        };

        process.Start();
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(timeoutMs))
        {
            try { process.Kill(); } catch { }
            throw new TimeoutException(LangManager.Get("Error_RenderDaemonCommandTimeout"));
        }

        Task.WaitAll(stdout, stderr);
        return new RenderDaemonCommandResult(process.ExitCode, stdout.Result, stderr.Result);
    }

    private static void ThrowIfFailed(RenderDaemonCommandResult result, string message)
    {
        if (result.ExitCode != 0)
            throw new InvalidOperationException(message + ": " + ChooseOutput(result));
    }

    private static string ChooseOutput(RenderDaemonCommandResult result)
    {
        return string.IsNullOrWhiteSpace(result.Stderr) ? result.Stdout.Trim() : result.Stderr.Trim();
    }

    private static void AppendArg(StringBuilder args, string value)
    {
        if (args.Length > 0)
            args.Append(' ');
        args.Append(QuoteArg(value));
    }

    private static string QuoteArg(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private sealed class RenderDaemonCommandResult
    {
        public RenderDaemonCommandResult(int exitCode, string stdout, string stderr)
        {
            ExitCode = exitCode;
            Stdout = stdout;
            Stderr = stderr;
        }

        public int ExitCode { get; }
        public string Stdout { get; }
        public string Stderr { get; }
    }
}
