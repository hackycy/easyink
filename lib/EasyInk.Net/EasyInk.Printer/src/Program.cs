using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Printer.Config;
using EasyInk.Printer.Models;
using EasyInk.Printer.Server;
using EasyInk.Printer.Services.Abstractions;
using EasyInk.Printer.UI;
using Microsoft.Extensions.DependencyInjection;

namespace EasyInk.Printer;

static class Program
{
    private static Mutex _mutex = null!;
    private static string _crashLogDir = null!;
    private static bool _disposed;
    private static int _fatalDialogShown;

    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length >= 3 && args[0] == "--register-urlacl" && int.TryParse(args[1], out var port))
        {
            RegisterUrlAcl(port, args[2]);
            return;
        }

        if (args.Length >= 3 && args[0] == "--ensure-network-access" && int.TryParse(args[1], out var networkPort))
        {
            EnsureNetworkAccess(networkPort, args[2]);
            return;
        }

        var launchedByAutoStart = IsAutoStartLaunch(args);

        bool createdNew;
        _mutex = new Mutex(true, "EasyInk.Printer.SingleInstance", out createdNew);

        if (!createdNew)
        {
            if (!launchedByAutoStart)
            {
                MessageBox.Show(LangManager.Get("App_AlreadyRunning_Message"), LangManager.Get("App_AlreadyRunning_Title"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            return;
        }

        try
        {
            Run();
        }
        catch (Exception ex)
        {
            HandleFatalException(ex, "Program.Main");
        }
        finally
        {
            DisposeMutex();
        }
    }

    private static bool IsAutoStartLaunch(string[] args)
    {
        foreach (var arg in args)
        {
            if (string.Equals(arg, "--autostart", StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    private static void Run()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

        var config = HostConfig.Load();
        LangManager.Initialize(string.IsNullOrEmpty(config.Language) ? null : config.Language);
        HostConfig.ReconcileAutoStartRegistry();

        SimpleLogger.Configure(HostConfig.DefaultFileLogDir, config.PrintDebugLoggingEnabled, config.FileLogRetentionDays);

        _crashLogDir = HostConfig.ResolveCrashLogDir(config.CrashLogDir!);
        AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            HandleFatalException(ToException(e.ExceptionObject), "AppDomain.UnhandledException");
        Application.ThreadException += (s, e) =>
            HandleFatalException(e.Exception, "Application.ThreadException");
        TaskScheduler.UnobservedTaskException += (s, e) =>
        {
            if (TransportExceptionClassifier.IsExpectedDisconnect(e.Exception))
            {
                SimpleLogger.Debug("已忽略预期的后台网络断开异常", e.Exception);
                e.SetObserved();
                return;
            }

            HandleFatalException(e.Exception, "TaskScheduler.UnobservedTaskException");
            e.SetObserved();
        };

        var services = ServiceConfig.Configure(config);
        var engineApi = services.GetRequiredService<EngineApi>();
        var auditService = services.GetRequiredService<IAuditService>();
        var debugLogService = services.GetRequiredService<Services.PrintDebugLogService>();
        var renderRuntimeManager = services.GetRequiredService<Services.RenderRuntimeManager>();
        var httpServer = services.GetRequiredService<HttpServer>();
        var wsHandler = services.GetRequiredService<WebSocketHandler>();
        var wsCommandHandler = services.GetRequiredService<WebSocketCommandHandler>();
        var router = services.GetRequiredService<Router>();

        wsHandler.SetCommandHandler(wsCommandHandler);

        engineApi.LogWithContext += (level, message, jobId) => OnEngineLog(debugLogService, level, message, jobId);

        engineApi.PrintCompleted += (requestId, request, result) =>
        {
            try
            {
                auditService.LogPrint(new Models.PrintAuditLog
                {
                    Timestamp = DateTime.Now,
                    PrinterName = request.PrinterName ?? "",
                    PaperWidth = request.PaperSize?.Width,
                    PaperHeight = request.PaperSize?.Height,
                    PaperUnit = request.PaperSize?.Unit ?? "mm",
                    Copies = request.Copies,
                    Dpi = request.Dpi,
                    UserId = request.UserData?.UserId,
                    LabelType = request.UserData?.LabelType,
                    Status = result.Success ? JobStatus.Completed.ToString() : JobStatus.Failed.ToString(),
                    ErrorMessage = result.ErrorInfo?.Message,
                    JobId = requestId
                });
            }
            catch (Exception ex)
            {
                SimpleLogger.Error("审计日志写入失败", ex);
            }

            try
            {
                debugLogService.WriteCompletionResult(requestId, request, result);
            }
            catch (Exception ex)
            {
                SimpleLogger.Error("打印调试完成日志写入失败", ex);
            }
        };

        httpServer.OnRequest = context =>
        {
            if (context.Request.IsWebSocketRequest)
                return wsHandler.HandleConnection(context);
            return router.HandleRequest(context);
        };

        if (!httpServer.TryStart())
        {
            SimpleLogger.Error(LangManager.Get("App_HttpStartFailed", httpServer.LastError!));

            if (httpServer.IsAccessDenied)
            {
                var result = MessageBox.Show(
                    LangManager.Get("App_NeedUrlAcl_Message"),
                    LangManager.Get("App_NeedUrlAcl_Title"),
                    MessageBoxButtons.OKCancel,
                    MessageBoxIcon.Warning);

                if (result == DialogResult.OK)
                {
                    LaunchNetworkAccessRegistration(config.HttpPort);
                    return;
                }
            }
        }
        else
        {
            if (PromptForFirewallRuleIfNeeded(config.HttpPort))
                return;
        }

        var trayIcon = services.GetRequiredService<TrayIcon>();
        var mainWindow = services.GetRequiredService<MainWindow>();

        mainWindow.OnRestart += () =>
        {
            Cleanup(httpServer, wsHandler, engineApi, renderRuntimeManager, trayIcon);

            DisposeMutex();

            Process.Start(Application.ExecutablePath);
            Application.Exit();
        };

        trayIcon.OnShowMainWindow += () =>
        {
            mainWindow.Show();
            mainWindow.ShowInTaskbar = true;
            mainWindow.WindowState = FormWindowState.Normal;
            mainWindow.BringToFront();
        };

        trayIcon.OnRestartServer += () =>
        {
            httpServer.Stop();
            if (!httpServer.TryStart())
            {
                SimpleLogger.Error(LangManager.Get("App_HttpRestartFailed", httpServer.LastError!));

                if (httpServer.IsAccessDenied)
                {
                    var result = MessageBox.Show(
                        LangManager.Get("App_NeedUrlAcl_Message"),
                        LangManager.Get("App_NeedUrlAcl_Title"),
                        MessageBoxButtons.OKCancel,
                        MessageBoxIcon.Warning);

                    if (result == DialogResult.OK)
                    {
                        LaunchNetworkAccessRegistration(config.HttpPort);
                        Application.Exit();
                        return;
                    }
                }
            }
            if (httpServer.IsRunning)
            {
                if (PromptForFirewallRuleIfNeeded(config.HttpPort))
                    return;
                trayIcon.UpdateStatus(LangManager.Get("Tray_Status_Running", config.HttpPort));
                trayIcon.ShowBalloon("EasyInk Printer", LangManager.Get("Tray_Balloon_Restarted"));
            }
            else
            {
                trayIcon.UpdateStatus(LangManager.Get("Tray_Status_Error"));
                trayIcon.ShowBalloon("EasyInk Printer", LangManager.Get("App_ServerStartFailed", httpServer.LastError!));
            }
        };

        trayIcon.OnExit += () =>
        {
            Cleanup(httpServer, wsHandler, engineApi, renderRuntimeManager, trayIcon);
            Application.Exit();
        };

        if (httpServer.IsRunning)
            trayIcon.UpdateStatus(LangManager.Get("Tray_Status_Running", config.HttpPort));
        else
            trayIcon.UpdateStatus(LangManager.Get("Tray_Status_Error"));

        if (config.StartMinimized)
        {
            mainWindow.WindowState = FormWindowState.Minimized;
            mainWindow.ShowInTaskbar = false;
        }
        mainWindow.FormClosing += (s, e) =>
        {
            if (e.CloseReason != CloseReason.UserClosing) return;

            if (config.MinimizeToTray)
            {
                e.Cancel = true;
                mainWindow.Hide();
                return;
            }

            var result = MessageBox.Show(
                LangManager.Get("App_CloseConfirm_Message"),
                LangManager.Get("App_CloseConfirm_Title"),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2);

            if (result != DialogResult.Yes)
                e.Cancel = true;
        };

        Application.Run(mainWindow);

        Cleanup(httpServer, wsHandler, engineApi, renderRuntimeManager, trayIcon);
    }

    private static void OnEngineLog(Services.PrintDebugLogService debugLogService, LogLevel level, string message, string? jobId)
    {
        if (level == LogLevel.Error)
            SimpleLogger.Error(message);
        else
            SimpleLogger.Info(message);

        debugLogService.AppendEngineLog(jobId, level, message);
    }

    private static void Cleanup(HttpServer httpServer, WebSocketHandler wsHandler, EngineApi engineApi, Services.RenderRuntimeManager renderRuntimeManager, TrayIcon trayIcon)
    {
        if (_disposed) return;
        _disposed = true;

        try { httpServer.Stop(); } catch (Exception ex) { SimpleLogger.Debug("HTTP服务器停止异常", ex); }
        try { wsHandler.Dispose(); } catch (Exception ex) { SimpleLogger.Debug("WebSocket处理器释放异常", ex); }
        try { renderRuntimeManager.Dispose(); } catch (Exception ex) { SimpleLogger.Debug("Render daemon 停止异常", ex); }
        try { engineApi.Dispose(); } catch (Exception ex) { SimpleLogger.Debug("引擎释放异常", ex); }
        try { trayIcon.Dispose(); } catch (Exception ex) { SimpleLogger.Debug("托盘图标释放异常", ex); }
    }

    private static Exception ToException(object exceptionObject)
    {
        if (exceptionObject is Exception exception)
            return exception;

        return new InvalidOperationException(LangManager.Get("App_UnhandledNonException", exceptionObject ?? LangManager.Get("App_UnhandledNullOrEmpty")));
    }

    private static void DisposeMutex()
    {
        if (_mutex == null) return;

        try { _mutex.ReleaseMutex(); } catch (ApplicationException) { } catch (ObjectDisposedException) { }
        try { _mutex.Dispose(); } catch (ObjectDisposedException) { }

        _mutex = null!;
    }

    private static void HandleFatalException(Exception ex, string source)
    {
        var safeException = ex ?? new InvalidOperationException(LangManager.Get("App_CaughtNullException"));

        try
        {
            SimpleLogger.Error($"未处理异常: {source}", safeException);
        }
        catch
        {
            // 忽略日志二次失败，避免覆盖原始异常。
        }

        var logPath = WriteCrashLog(safeException, source);
        if (Interlocked.CompareExchange(ref _fatalDialogShown, 1, 0) != 0)
            return;

        ShowMessage(
            BuildFatalErrorMessage(safeException, logPath!),
            LangManager.Get("App_FatalError_Title"),
            MessageBoxIcon.Error);
    }

    private static string BuildFatalErrorMessage(Exception ex, string logPath)
    {
        var sb = new StringBuilder();
        sb.AppendLine(LangManager.Get("App_FatalError_Message"));
        AppendUserFacingException(sb, ex);
        AppendSQLiteGuidance(sb, ex);
        AppendLogPath(sb, logPath);
        return sb.ToString().TrimEnd();
    }

    private static void AppendUserFacingException(StringBuilder sb, Exception ex)
    {
        sb.AppendLine();
        sb.AppendLine($"{LangManager.Get("App_ExceptionType")}: {ex.GetType().Name}");
        sb.AppendLine($"{LangManager.Get("App_ExceptionMessage")}: {ex.Message}");
    }

    private static void AppendSQLiteGuidance(StringBuilder sb, Exception ex)
    {
        if (!ContainsSQLiteInteropError(ex)) return;

        sb.AppendLine();
        sb.AppendLine(LangManager.Get("App_SQLiteGuidance_Reason"));
        sb.AppendLine(LangManager.Get("App_SQLiteGuidance_CheckFiles"));
        sb.AppendLine(LangManager.Get("App_SQLiteGuidance_Action"));
    }

    private static bool ContainsSQLiteInteropError(Exception? ex)
    {
        if (ex == null) return false;

        if (ex is DllNotFoundException &&
            ex.Message.IndexOf("SQLite.Interop.dll", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return true;
        }

        if (ex is AggregateException aggregateException)
        {
            foreach (var inner in aggregateException.InnerExceptions)
            {
                if (ContainsSQLiteInteropError(inner))
                    return true;
            }
        }

        return ContainsSQLiteInteropError(ex.InnerException);
    }

    private static void AppendLogPath(StringBuilder sb, string logPath)
    {
        if (string.IsNullOrEmpty(logPath)) return;

        sb.AppendLine();
        sb.AppendLine($"{LangManager.Get("App_CrashLog_Path")}: {logPath}");
    }

    private static void ShowMessage(string text, string caption, MessageBoxIcon icon)
    {
        try
        {
            MessageBox.Show(text, caption, MessageBoxButtons.OK, icon);
        }
        catch
        {
            // 桌面环境异常时至少保留日志文件。
        }
    }

    private static string? WriteCrashLog(Exception ex, string source)
    {
        try
        {
            var crashLogDir = string.IsNullOrWhiteSpace(_crashLogDir)
                ? HostConfig.DefaultCrashLogDir
                : _crashLogDir;

            if (!Directory.Exists(crashLogDir))
                Directory.CreateDirectory(crashLogDir);

            var sb = new StringBuilder();
            sb.AppendLine($"========== {LangManager.Get("App_CrashLog_Title")} ==========");
            sb.AppendLine($"{LangManager.Get("App_CrashLog_Time")}: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}");
            sb.AppendLine($"{LangManager.Get("App_CrashLog_Source")}: {source}");
            sb.AppendLine();

            sb.AppendLine($"--- {LangManager.Get("App_CrashLog_EnvironmentInfo")} ---");
            sb.AppendLine($"OS: {Environment.OSVersion}");
            sb.AppendLine($".NET: {Environment.Version}");
            sb.AppendLine($"64位系统: {Environment.Is64BitOperatingSystem}");
            sb.AppendLine($"64位进程: {Environment.Is64BitProcess}");
            sb.AppendLine($"工作集: {Environment.WorkingSet / 1024 / 1024} MB");
            sb.AppendLine($"进程运行时长: {Process.GetCurrentProcess().TotalProcessorTime}");
            sb.AppendLine();

            sb.AppendLine($"--- {LangManager.Get("App_CrashLog_ExceptionInfo")} ---");
            AppendException(sb, ex, 0);

            var fileName = $"crash_{DateTime.Now:yyyyMMdd_HHmmss}.log";
            var filePath = Path.Combine(crashLogDir, fileName);
            File.WriteAllText(filePath, sb.ToString(), Encoding.UTF8);
            return filePath;
        }
        catch
        {
            // 崩溃时写日志本身不应再抛异常
            return null;
        }
    }

    private static void AppendException(StringBuilder sb, Exception ex, int depth)
    {
        if (ex == null) return;

        var indent = new string(' ', depth * 2);
        if (depth > 0)
            sb.AppendLine($"{indent}--- {LangManager.Get("App_InnerException_Label")} ---");

        sb.AppendLine($"{indent}{LangManager.Get("App_Type")}: {ex.GetType().FullName}");
        sb.AppendLine($"{indent}{LangManager.Get("App_Message")}: {ex.Message}");
        sb.AppendLine($"{indent}{LangManager.Get("App_StackTrace")}:");
        sb.AppendLine(ex.StackTrace ?? LangManager.Get("App_NoStackTrace"));

        if (ex is AggregateException agg)
        {
            for (int i = 0; i < agg.InnerExceptions.Count; i++)
            {
                sb.AppendLine();
                sb.AppendLine($"{indent}--- {LangManager.Get("App_AggregateException_Label")} [{i}] ---");
                AppendException(sb, agg.InnerExceptions[i], depth + 1);
            }
        }

        if (ex.InnerException != null)
        {
            sb.AppendLine();
            AppendException(sb, ex.InnerException, depth + 1);
        }
    }

    private static bool PromptForFirewallRuleIfNeeded(int port)
    {
        if (IsFirewallRuleConfigured(port)) return false;

        var result = MessageBox.Show(
            LangManager.Get("App_NeedFirewall_Message", port),
            LangManager.Get("App_NeedFirewall_Title"),
            MessageBoxButtons.OKCancel,
            MessageBoxIcon.Warning);

        if (result == DialogResult.OK)
        {
            LaunchNetworkAccessRegistration(port);
            Application.Exit();
            return true;
        }

        return false;
    }

    private static void LaunchNetworkAccessRegistration(int port)
    {
        var user = $"{Environment.UserDomainName}\\{Environment.UserName}";
        Process.Start(new ProcessStartInfo
        {
            FileName = Application.ExecutablePath,
            Arguments = $"--ensure-network-access {port} \"{user}\"",
            Verb = "runas",
            UseShellExecute = true
        });
    }

    private static bool IsFirewallRuleConfigured(int port)
    {
        var ruleName = GetFirewallRuleName(port);
        try
        {
            var result = RunNetsh($"advfirewall firewall show rule name=\"{ruleName}\"");
            return result.ExitCode == 0;
        }
        catch (Exception ex)
        {
            SimpleLogger.Debug("检查防火墙规则异常", ex);
            return false;
        }
    }

    private static string GetFirewallRuleName(int port)
    {
        return $"EasyInk Printer HTTP {port}";
    }

    private static void EnsureNetworkAccess(int port, string user)
    {
        try
        {
            var urlAcl = EnsureUrlAcl(port, user);
            var firewall = EnsureFirewallRule(port);

            if (urlAcl.Success && firewall.Success)
            {
                MessageBox.Show(
                    LangManager.Get("App_NetworkAccessSuccess"),
                    LangManager.Get("App_AclSuccess_Title"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                RestartNonElevated();
            }
            else
            {
                var message = BuildCommandFailureMessage(urlAcl, firewall);
                MessageBox.Show(
                    LangManager.Get("App_NetworkAccessFailure", message),
                    LangManager.Get("App_AclFailure_Title"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                LangManager.Get("App_AclException", ex.Message),
                LangManager.Get("App_AclException_Title"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static CommandResult EnsureUrlAcl(int port, string user)
    {
        var url = $"http://+:{port}/";
        var show = RunNetsh($"http show urlacl url={url}");
        if (show.ExitCode == 0 && show.Output.IndexOf(user, StringComparison.OrdinalIgnoreCase) >= 0)
            return CommandResult.SuccessResult(show.Output);

        if (show.ExitCode == 0)
            RunNetsh($"http delete urlacl url={url}");

        return RunNetsh($"http add urlacl url={url} user=\"{user}\"");
    }

    private static CommandResult EnsureFirewallRule(int port)
    {
        var ruleName = GetFirewallRuleName(port);
        RunNetsh($"advfirewall firewall delete rule name=\"{ruleName}\"");
        return RunNetsh($"advfirewall firewall add rule name=\"{ruleName}\" dir=in action=allow protocol=TCP localport={port} profile=any");
    }

    private static string BuildCommandFailureMessage(params CommandResult[] results)
    {
        var sb = new StringBuilder();
        foreach (var result in results)
        {
            if (result.Success) continue;
            if (sb.Length > 0) sb.AppendLine();
            sb.AppendLine(result.Command);
            var message = string.IsNullOrWhiteSpace(result.Error) ? result.Output : result.Error;
            sb.AppendLine(string.IsNullOrWhiteSpace(message) ? $"ExitCode: {result.ExitCode}" : message.Trim());
        }

        return sb.ToString();
    }

    private static CommandResult RunNetsh(string arguments)
    {
        using (var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "netsh",
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.Default,
                StandardErrorEncoding = Encoding.Default
            }
        })
        {
            process.Start();
            var error = process.StandardError.ReadToEnd();
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();

            return new CommandResult(arguments, process.ExitCode, output, error);
        }
    }

    private static void RegisterUrlAcl(int port, string user)
    {
        try
        {
            var result = EnsureUrlAcl(port, user);

            if (result.ExitCode == 0)
            {
                MessageBox.Show(
                    LangManager.Get("App_AclSuccess"),
                    LangManager.Get("App_AclSuccess_Title"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                RestartNonElevated();
            }
            else
            {
                var message = string.IsNullOrWhiteSpace(result.Error) ? result.Output : result.Error;
                MessageBox.Show(
                    LangManager.Get("App_AclFailure", message),
                    LangManager.Get("App_AclFailure_Title"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                LangManager.Get("App_AclException", ex.Message),
                LangManager.Get("App_AclException_Title"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static void RestartNonElevated()
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = Application.ExecutablePath,
            UseShellExecute = false
        });
    }

    private sealed class CommandResult
    {
        public CommandResult(string command, int exitCode, string output, string error)
        {
            Command = command;
            ExitCode = exitCode;
            Output = output;
            Error = error;
        }

        public string Command { get; }
        public int ExitCode { get; }
        public string Output { get; }
        public string Error { get; }
        public bool Success => ExitCode == 0;

        public static CommandResult SuccessResult(string output)
        {
            return new CommandResult("", 0, output, "");
        }
    }
}
