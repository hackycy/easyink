using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using EasyInk.Engine.Models;
using EasyInk.Printer.Config;
using Microsoft.Win32;
using Newtonsoft.Json.Linq;

namespace EasyInk.Printer.Services;

internal sealed class RenderRuntimeManager : IDisposable
{
    private const string ChromeForTestingStableUrl = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
    private const string ChromeForTestingMilestoneUrl = "https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone-with-downloads.json";

    private readonly HostConfig _config;
    private readonly object _sync = new object();
    private Process? _process;
    private string? _authToken;
    private bool _disposed;

    public RenderRuntimeManager(HostConfig config)
    {
        _config = config;
    }

    public RenderRuntimeHandle EnsureAvailable(CancellationToken cancellationToken = default)
    {
        if (!_config.RenderEnabled)
            throw new InvalidOperationException("Render 未启用");

        lock (_sync)
        {
            ThrowIfDisposed();
            _authToken ??= GenerateToken();

            if (IsProcessAlive() && IsHealthy(cancellationToken))
                return CurrentHandle();

            StopProcess();
            StartProcess(cancellationToken);
            WaitUntilHealthy(cancellationToken);
            return CurrentHandle();
        }
    }

    public void Dispose()
    {
        lock (_sync)
        {
            _disposed = true;
            StopProcess();
        }
    }

    public string InstallBrowserVersion(string versionKey, CancellationToken cancellationToken = default)
    {
        return InstallBrowserVersion(versionKey, null, cancellationToken);
    }

    public string InstallBrowserVersion(string versionKey, IProgress<RenderBrowserInstallProgress>? progress, CancellationToken cancellationToken = default)
    {
        var normalizedKey = RenderBrowserVersionCatalog.NormalizeKey(versionKey);
        var effectiveKey = RenderBrowserVersionCatalog.ResolveEffectiveKey(normalizedKey);
        var option = RenderBrowserVersionCatalog.GetOption(effectiveKey);
        progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.Resolving));
        var manifest = LoadManifestBrowserInfo(ResolveManifestPath());
        var executableHint = manifest?.Executable ?? option.ExecutableHint;
        var versionDir = HostConfig.GetRenderBrowserVersionDir(normalizedKey);

        var existingBrowser = LocateBrowserExecutable(versionDir, executableHint);
        if (existingBrowser != null)
        {
            progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.CacheHit, existingBrowser));
            return existingBrowser;
        }

        var installedLegacyBrowser = LocateSystemChromeForLegacyWindows(effectiveKey);
        if (installedLegacyBrowser != null)
        {
            progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.CacheHit, installedLegacyBrowser));
            return installedLegacyBrowser;
        }

        var download = ResolveBrowserDownload(option, manifest, cancellationToken);
        if (download == null)
            throw CreateBrowserMissingException(normalizedKey);

        var downloadedArchive = DownloadBrowserArchive(download, manifest, normalizedKey, progress, cancellationToken);
        progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.Extracting, downloadedArchive));
        var installedPath = ExtractBrowserArchive(downloadedArchive, manifest, download.Executable, versionDir);
        progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.Completed, installedPath));
        return installedPath;
    }

    private void StartProcess(CancellationToken cancellationToken)
    {
        var hostPath = HostConfig.DefaultRenderHostPath;
        if (!File.Exists(hostPath))
            throw new FileNotFoundException("内置 Render Host 不存在", hostPath);

        var browserPath = ResolveBrowserExecutablePath(cancellationToken);
        var profileRoot = HostConfig.ResolveRenderProfileRoot(_config.RenderProfileRoot!);
        var tempDir = HostConfig.ResolveRenderTempDir(_config.RenderTempDir!);
        var logDir = HostConfig.ResolveRenderLogDir(_config.RenderLogDir!);

        Directory.CreateDirectory(profileRoot);
        Directory.CreateDirectory(tempDir);
        Directory.CreateDirectory(logDir);

        var args = string.Join(" ", new[]
        {
            "--host 127.0.0.1",
            "--port " + _config.RenderPort,
            "--browser-path " + QuoteArg(browserPath),
            "--profile-root " + QuoteArg(profileRoot),
            "--temp-dir " + QuoteArg(tempDir),
            "--log-dir " + QuoteArg(logDir),
            "--max-concurrency " + _config.RenderMaxConcurrency,
            "--max-queue-size " + _config.RenderMaxQueueSize,
            "--request-timeout-ms " + _config.RenderRequestTimeoutMs,
            "--auth-token " + QuoteArg(_authToken!)
        });

        var startInfo = new ProcessStartInfo
        {
            FileName = hostPath,
            Arguments = args,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            WorkingDirectory = Path.GetDirectoryName(hostPath) ?? AppDomain.CurrentDomain.BaseDirectory
        };

        _process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        _process.OutputDataReceived += (s, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) SimpleLogger.Debug("Render Host: " + e.Data); };
        _process.ErrorDataReceived += (s, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) SimpleLogger.Error("Render Host: " + e.Data); };

        if (!_process.Start())
            throw new InvalidOperationException("Render Host 启动失败");

        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
        cancellationToken.ThrowIfCancellationRequested();
    }

    private string ResolveBrowserExecutablePath(CancellationToken cancellationToken)
    {
        var normalizedKey = RenderBrowserVersionCatalog.NormalizeKey(_config.RenderBrowserVersion);
        var effectiveKey = RenderBrowserVersionCatalog.ResolveEffectiveKey(normalizedKey);
        var option = RenderBrowserVersionCatalog.GetOption(effectiveKey);
        var manifest = LoadManifestBrowserInfo(ResolveManifestPath());
        var executableHint = manifest?.Executable ?? option.ExecutableHint;

        var bundledBrowser = LocateBrowserExecutable(HostConfig.DefaultRenderBrowserDir, executableHint);
        if (bundledBrowser != null)
            return bundledBrowser;

        var versionBrowser = LocateBrowserExecutable(HostConfig.GetRenderBrowserVersionDir(normalizedKey), executableHint);
        if (versionBrowser != null)
            return versionBrowser;

        var cachedBrowser = LocateBrowserExecutable(HostConfig.DefaultRenderBrowserCacheDir, executableHint);
        if (cachedBrowser != null)
            return cachedBrowser;

        var installedLegacyBrowser = LocateSystemChromeForLegacyWindows(effectiveKey);
        if (installedLegacyBrowser != null)
            return installedLegacyBrowser;

        if (!string.IsNullOrWhiteSpace(_config.RenderBrowserExecutablePath))
        {
            var executablePath = _config.RenderBrowserExecutablePath!.Trim();
            if (!File.Exists(executablePath))
                throw new FileNotFoundException("Render Chrome 可执行文件不存在", executablePath);
            return executablePath;
        }

        var download = ResolveBrowserDownload(option, manifest, cancellationToken);
        if (download != null)
        {
            var downloadedArchive = DownloadBrowserArchive(download, manifest, normalizedKey, null, cancellationToken);
            return ExtractBrowserArchive(downloadedArchive, manifest, download.Executable, HostConfig.GetRenderBrowserVersionDir(normalizedKey));
        }

        if (string.IsNullOrWhiteSpace(_config.RenderBrowserArchivePath))
            throw CreateBrowserMissingException(normalizedKey);

        var archivePath = _config.RenderBrowserArchivePath!.Trim();
        return ExtractBrowserArchive(archivePath, manifest, executableHint, HostConfig.GetRenderBrowserVersionDir(normalizedKey));
    }

    private string ExtractBrowserArchive(string archivePath, ManifestBrowserInfo? manifest, string? executableHint, string targetRoot)
    {
        if (!File.Exists(archivePath))
            throw new FileNotFoundException("Render Chrome zip 包不存在", archivePath);
        if (!string.Equals(Path.GetExtension(archivePath), ".zip", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Render Chrome 包仅支持 .zip 文件");

        var archiveHash = ComputeSha256(archivePath);
        ValidateBrowserArchive(archivePath, archiveHash, manifest);

        var targetDir = Path.Combine(targetRoot, Path.GetFileNameWithoutExtension(archivePath) + "-" + archiveHash.Substring(0, 12));
        Directory.CreateDirectory(targetRoot);

        if (!Directory.Exists(targetDir) || !Directory.EnumerateFileSystemEntries(targetDir).Any())
        {
            Directory.CreateDirectory(targetDir);
            ZipFile.ExtractToDirectory(archivePath, targetDir);
        }

        var browserPath = LocateBrowserExecutable(targetDir, manifest?.Executable ?? executableHint);
        if (browserPath == null)
            throw new FileNotFoundException("Render Chrome zip 包中未找到 chrome-headless-shell.exe 或 chrome.exe", targetDir);

        return browserPath;
    }

    private static string? ResolveManifestPath(string? configuredPath)
    {
        if (!string.IsNullOrWhiteSpace(configuredPath))
            return configuredPath;
        return File.Exists(HostConfig.DefaultRenderManifestPath) ? HostConfig.DefaultRenderManifestPath : null;
    }

    private string? ResolveManifestPath()
    {
        return ResolveManifestPath(_config.RenderManifestPath);
    }

    private BrowserDownloadInfo? ResolveBrowserDownload(RenderBrowserVersionOption option, ManifestBrowserInfo? manifest, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(_config.RenderBrowserDownloadUrl))
            return new BrowserDownloadInfo(_config.RenderBrowserDownloadUrl!.Trim(), option.DisplayName, option.ExecutableHint, "legacy", null);

        if (option.SupportsAutomaticDownload)
            return ResolveChromeForTestingDownload(option, cancellationToken);

        if (!string.IsNullOrWhiteSpace(manifest?.Url))
            return new BrowserDownloadInfo(manifest!.Url!, option.DisplayName, manifest.Executable ?? option.ExecutableHint, "manifest", manifest.Size);

        return null;
    }

    private string DownloadBrowserArchive(BrowserDownloadInfo download, ManifestBrowserInfo? manifest, string versionKey, IProgress<RenderBrowserInstallProgress>? progress, CancellationToken cancellationToken)
    {
        var versionDir = HostConfig.GetRenderBrowserVersionDir(versionKey);
        Directory.CreateDirectory(versionDir);
        var downloadsDir = Path.Combine(versionDir, "downloads");
        Directory.CreateDirectory(downloadsDir);

        var archiveName = Path.GetFileName(new Uri(download.Url).LocalPath);
        if (string.IsNullOrWhiteSpace(archiveName) || !archiveName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            archiveName = SanitizeFileName(download.VersionLabel) + ".zip";

        var archivePath = Path.Combine(downloadsDir, archiveName);
        if (File.Exists(archivePath))
        {
            var existingHash = ComputeSha256(archivePath);
            if (manifest == null || string.IsNullOrWhiteSpace(manifest.Sha256) ||
                string.Equals(existingHash, manifest.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                if (download.ExpectedSize.HasValue && download.ExpectedSize.Value > 0 && new FileInfo(archivePath).Length != download.ExpectedSize.Value)
                    File.Delete(archivePath);
                else if (IsReadableZip(archivePath))
                {
                    progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.CacheHit, archivePath));
                    return archivePath;
                }
                else
                    File.Delete(archivePath);
            }
            else
            {
                File.Delete(archivePath);
            }
        }

        var tempArchivePath = archivePath + ".download";
        if (File.Exists(tempArchivePath))
            File.Delete(tempArchivePath);

        try
        {
            SimpleLogger.Info("开始下载 Render Chrome: " + download.Url);
            using var http = CreateHttpClient(TimeSpan.FromMilliseconds(Math.Max(_config.RenderRequestTimeoutMs, 30000)));
            using var response = http.GetAsync(download.Url, HttpCompletionOption.ResponseHeadersRead, cancellationToken).GetAwaiter().GetResult();
            response.EnsureSuccessStatusCode();
            var totalBytes = response.Content.Headers.ContentLength ?? download.ExpectedSize;
            using (var remote = response.Content.ReadAsStreamAsync().GetAwaiter().GetResult())
            using (var local = new FileStream(tempArchivePath, FileMode.Create, FileAccess.Write, FileShare.None, 81920))
            {
                CopyToWithProgress(remote, local, totalBytes, progress, cancellationToken);
            }

            if (download.ExpectedSize.HasValue && download.ExpectedSize.Value > 0 && new FileInfo(tempArchivePath).Length != download.ExpectedSize.Value)
                throw new InvalidOperationException("Render Chrome 下载文件大小不完整");

            if (File.Exists(archivePath))
                File.Delete(archivePath);
            File.Move(tempArchivePath, archivePath);
            SimpleLogger.Info("Render Chrome 下载完成: " + archivePath);
            return archivePath;
        }
        catch
        {
            if (File.Exists(tempArchivePath))
                File.Delete(tempArchivePath);
            throw;
        }
    }

    private BrowserDownloadInfo ResolveChromeForTestingDownload(RenderBrowserVersionOption option, CancellationToken cancellationToken)
    {
        var platform = Environment.Is64BitOperatingSystem ? "win64" : "win32";
        var json = ReadJsonFromUrl(
            string.Equals(option.Key, RenderBrowserVersionCatalog.StableKey, StringComparison.OrdinalIgnoreCase)
                ? ChromeForTestingStableUrl
                : ChromeForTestingMilestoneUrl,
            cancellationToken);
        var root = JObject.Parse(json);
        var versionNode = string.Equals(option.Key, RenderBrowserVersionCatalog.StableKey, StringComparison.OrdinalIgnoreCase)
            ? root["channels"]?["Stable"] as JObject
            : root["milestones"]?[option.ChromeForTestingMilestone!] as JObject;

        if (versionNode == null)
            throw new InvalidOperationException("未找到可下载的 Render Chrome 版本: " + option.DisplayName);

        var version = versionNode.Value<string>("version") ?? option.DisplayName;
        var downloads = versionNode["downloads"] as JObject;
        var download = FindChromeForTestingDownload(downloads, "chrome-headless-shell", platform)
            ?? FindChromeForTestingDownload(downloads, "chrome", platform)
            ?? FindChromeForTestingDownload(downloads, "chrome-headless-shell", "win32")
            ?? FindChromeForTestingDownload(downloads, "chrome", "win32");
        if (download == null)
            throw new InvalidOperationException("未找到适用于 Windows 的 Render Chrome 下载包: " + option.DisplayName);

        return new BrowserDownloadInfo(
            download.Url,
            version + "-" + download.DownloadType + "-" + download.Platform,
            download.Executable,
            download.DownloadType,
            null);
    }

    private string ReadJsonFromUrl(string url, CancellationToken cancellationToken)
    {
        using var http = CreateHttpClient(TimeSpan.FromMilliseconds(Math.Max(_config.RenderRequestTimeoutMs, 30000)));
        using var response = http.GetAsync(url, cancellationToken).GetAwaiter().GetResult();
        response.EnsureSuccessStatusCode();
        return response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
    }

    private static ChromeForTestingDownload? FindChromeForTestingDownload(JObject? downloads, string downloadType, string platform)
    {
        var items = downloads?[downloadType] as JArray;
        if (items == null)
            return null;

        foreach (var item in items.OfType<JObject>())
        {
            if (!string.Equals(item.Value<string>("platform"), platform, StringComparison.OrdinalIgnoreCase))
                continue;

            var url = item.Value<string>("url");
            if (string.IsNullOrWhiteSpace(url))
                continue;

            var executable = string.Equals(downloadType, "chrome-headless-shell", StringComparison.OrdinalIgnoreCase)
                ? "chrome-headless-shell-" + platform + "/chrome-headless-shell.exe"
                : "chrome-" + platform + "/chrome.exe";
            return new ChromeForTestingDownload(url!, platform, downloadType, executable);
        }

        return null;
    }

    private static ManifestBrowserInfo? LoadManifestBrowserInfo(string? manifestPath)
    {
        if (string.IsNullOrWhiteSpace(manifestPath))
            return null;
        if (!File.Exists(manifestPath))
            throw new FileNotFoundException("Render manifest 不存在", manifestPath);

        var json = JObject.Parse(File.ReadAllText(manifestPath));
        var browser = json["browser"] as JObject;
        if (browser == null)
            return null;

        return new ManifestBrowserInfo
        {
            Executable = browser.Value<string>("executable"),
            Url = browser.Value<string>("url"),
            Sha256 = browser.Value<string>("sha256"),
            Size = browser.Value<long?>("size")
        };
    }

    private static void ValidateBrowserArchive(string archivePath, string archiveHash, ManifestBrowserInfo? manifest)
    {
        if (manifest == null)
            return;

        var fileInfo = new FileInfo(archivePath);
        if (manifest.Size.HasValue && manifest.Size.Value > 0 && manifest.Size.Value != fileInfo.Length)
            throw new InvalidOperationException("Render Chrome zip 包大小与 manifest 不一致");

        if (!string.IsNullOrWhiteSpace(manifest.Sha256) &&
            !string.Equals(manifest.Sha256, archiveHash, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Render Chrome zip 包 sha256 与 manifest 不一致");
    }

    private static bool IsReadableZip(string archivePath)
    {
        try
        {
            using var archive = ZipFile.OpenRead(archivePath);
            return archive.Entries.Count > 0;
        }
        catch (Exception ex) when (ex is IOException || ex is InvalidDataException || ex is UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static void CopyToWithProgress(Stream source, Stream destination, long? totalBytes, IProgress<RenderBrowserInstallProgress>? progress, CancellationToken cancellationToken)
    {
        var buffer = new byte[81920];
        long totalRead = 0;
        progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.Downloading, bytesReceived: 0, totalBytes: totalBytes));

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var read = source.Read(buffer, 0, buffer.Length);
            if (read <= 0)
                break;

            destination.Write(buffer, 0, read);
            totalRead += read;
            progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.Downloading, bytesReceived: totalRead, totalBytes: totalBytes));
        }
    }

    private static string? LocateBrowserExecutable(string root, string? manifestExecutable)
    {
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            return null;

        foreach (var candidate in ExpandExecutableCandidates(manifestExecutable))
        {
            var direct = Path.Combine(root, candidate);
            if (File.Exists(direct))
                return direct;

            var fileName = Path.GetFileName(candidate);
            var found = Directory.GetFiles(root, fileName, SearchOption.AllDirectories).FirstOrDefault();
            if (found != null)
                return found;
        }

        return null;
    }

    private static string? LocateSystemChromeForLegacyWindows(string effectiveKey)
    {
        if (!string.Equals(effectiveKey, RenderBrowserVersionCatalog.LegacyWindowsKey, StringComparison.OrdinalIgnoreCase))
            return null;

        foreach (var candidate in EnumerateSystemChromeCandidates().Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(candidate) || !File.Exists(candidate))
                continue;

            var majorVersion = TryGetChromeMajorVersion(candidate);
            if (majorVersion == 109 || (majorVersion == null && RenderBrowserVersionCatalog.IsLegacyWindows()))
                return candidate;
        }

        return null;
    }

    private static string[] EnumerateSystemChromeCandidates()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

        return new[]
        {
            ReadRegistryString(@"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe", string.Empty),
            ReadRegistryString(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe", string.Empty),
            ReadRegistryString(@"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe", string.Empty),
            Path.Combine(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(programFilesX86, "Google", "Chrome", "Application", "chrome.exe")
        }.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s!).ToArray();
    }

    private static string? ReadRegistryString(string keyName, string valueName)
    {
        try
        {
            return Registry.GetValue(keyName, valueName, null) as string;
        }
        catch
        {
            return null;
        }
    }

    private static int? TryGetChromeMajorVersion(string executablePath)
    {
        try
        {
            var versionInfo = FileVersionInfo.GetVersionInfo(executablePath);
            if (versionInfo.ProductMajorPart > 0)
                return versionInfo.ProductMajorPart;
            if (versionInfo.FileMajorPart > 0)
                return versionInfo.FileMajorPart;

            var versionText = versionInfo.ProductVersion ?? versionInfo.FileVersion;
            if (!string.IsNullOrWhiteSpace(versionText))
            {
                var dotIndex = versionText!.IndexOf('.');
                var majorText = dotIndex < 0 ? versionText : versionText.Substring(0, dotIndex);
                if (int.TryParse(majorText, out var majorVersion))
                    return majorVersion;
            }
        }
        catch
        {
        }

        return null;
    }

    private static string[] ExpandExecutableCandidates(string? manifestExecutable)
    {
        var candidates = new[]
        {
            manifestExecutable,
            AppendExe(manifestExecutable),
            "chrome-headless-shell.exe",
            "headless-shell.exe",
            "chrome.exe"
        };

        return candidates
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s!.Replace('/', Path.DirectorySeparatorChar))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string? AppendExe(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value!.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            return value;
        return value + ".exe";
    }

    private void WaitUntilHealthy(CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(Math.Max(_config.RenderRequestTimeoutMs, 5000));
        Exception? lastError = null;

        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (!IsProcessAlive())
                throw new InvalidOperationException("Render Host 已退出");

            try
            {
                if (IsHealthy(cancellationToken))
                    return;
            }
            catch (Exception ex) when (ex is HttpRequestException || ex is TaskCanceledException || ex is InvalidOperationException)
            {
                lastError = ex;
            }

            Thread.Sleep(200);
        }

        throw new TimeoutException("等待 Render Host ready 超时", lastError);
    }

    private bool IsHealthy(CancellationToken cancellationToken)
    {
        using var http = CreateHttpClient(TimeSpan.FromSeconds(2));
        using var request = new HttpRequestMessage(HttpMethod.Get, CurrentHandle().BaseUrl + "/v1/health");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _authToken);
        using var response = http.SendAsync(request, cancellationToken).GetAwaiter().GetResult();
        if (!response.IsSuccessStatusCode)
            return false;

        var json = JObject.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        var browserStatus = json["browser"]?.Value<string>("status");
        return string.Equals(browserStatus, "ready", StringComparison.OrdinalIgnoreCase);
    }

    private RenderRuntimeHandle CurrentHandle()
    {
        return new RenderRuntimeHandle("http://127.0.0.1:" + _config.RenderPort, _authToken!);
    }

    private bool IsProcessAlive()
    {
        return _process != null && !_process.HasExited;
    }

    private void StopProcess()
    {
        var process = _process;
        _process = null;
        if (process == null)
            return;

        try
        {
            if (!process.HasExited)
            {
                process.CloseMainWindow();
                if (!process.WaitForExit(3000))
                    process.Kill();
            }
        }
        catch (Exception ex)
        {
            SimpleLogger.Debug("Render Host 停止异常", ex);
        }
        finally
        {
            process.Dispose();
        }
    }

    private void ThrowIfDisposed()
    {
        if (_disposed)
            throw new ObjectDisposedException(nameof(RenderRuntimeManager));
    }

    private static HttpClient CreateHttpClient(TimeSpan timeout)
    {
        return new HttpClient { Timeout = timeout };
    }

    private static string GenerateToken()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes);
    }

    private static string QuoteArg(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static string ComputeSha256(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(stream);
        return BitConverter.ToString(hash).Replace("-", string.Empty).ToLowerInvariant();
    }

    private static InvalidOperationException CreateBrowserMissingException(string versionKey)
    {
        return new InvalidOperationException(
            "Render Chrome 未安装。请在设置页选择版本并点击下载，或将对应版本 Chrome 解压到 " +
            HostConfig.GetRenderBrowserVersionDir(versionKey) + " 后重试");
    }

    private static string SanitizeFileName(string value)
    {
        var result = value.Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars())
            result = result.Replace(invalid, '_');
        return string.IsNullOrWhiteSpace(result) ? "chrome-for-testing" : result;
    }

    private sealed class BrowserDownloadInfo
    {
        public BrowserDownloadInfo(string url, string versionLabel, string executable, string source, long? expectedSize)
        {
            Url = url;
            VersionLabel = versionLabel;
            Executable = executable;
            Source = source;
            ExpectedSize = expectedSize;
        }

        public string Url { get; }
        public string VersionLabel { get; }
        public string Executable { get; }
        public string Source { get; }
        public long? ExpectedSize { get; }
    }

    private sealed class ChromeForTestingDownload
    {
        public ChromeForTestingDownload(string url, string platform, string downloadType, string executable)
        {
            Url = url;
            Platform = platform;
            DownloadType = downloadType;
            Executable = executable;
        }

        public string Url { get; }
        public string Platform { get; }
        public string DownloadType { get; }
        public string Executable { get; }
    }

    private sealed class ManifestBrowserInfo
    {
        public string? Executable { get; set; }
        public string? Url { get; set; }
        public string? Sha256 { get; set; }
        public long? Size { get; set; }
    }
}