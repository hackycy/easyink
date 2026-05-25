using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using EasyInk.Engine.Models;
using EasyInk.Printer.Config;
using Microsoft.Win32;
using Newtonsoft.Json.Linq;

namespace EasyInk.Printer.Services;

internal sealed class RenderRuntimeManager : IDisposable
{
    private readonly HostConfig _config;
    private readonly object _sync = new object();
    private bool _disposed;

    public RenderRuntimeManager(HostConfig config)
    {
        _config = config;
    }

    public RenderRuntimeOptions ResolveOptions(CancellationToken cancellationToken = default, bool allowBrowserDownload = true)
    {
        if (!_config.RenderEnabled)
            throw new InvalidOperationException("Render 未启用");

        lock (_sync)
        {
            ThrowIfDisposed();

            return BuildOptions(cancellationToken, allowBrowserDownload);
        }
    }

    public void Dispose()
    {
        lock (_sync)
        {
            _disposed = true;
            StopDaemon();
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
        var browserKind = RenderBrowserKindCatalog.NormalizeKey(_config.RenderBrowserKind);
        progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.Resolving));
        var manifest = LoadManifestBrowserInfo(ResolveManifestPath());
        var executableCandidates = ResolveExecutableCandidates(browserKind, manifest, option);
        var browserDir = HostConfig.ResolveRenderBrowserDir(_config.RenderBrowserDir!);
        var versionDir = HostConfig.GetRenderBrowserVersionDir(browserDir, normalizedKey);

        var existingBrowser = LocateBrowserExecutable(versionDir, executableCandidates);
        if (existingBrowser != null)
        {
            progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.CacheHit, existingBrowser));
            return existingBrowser;
        }

        var download = ResolveBrowserDownload(option, manifest, browserKind, cancellationToken);
        if (download == null)
        {
            var systemBrowser = LocateSystemBrowser(browserKind, effectiveKey);
            if (systemBrowser != null)
            {
                progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.CacheHit, systemBrowser));
                return systemBrowser;
            }

            throw CreateBrowserMissingException(browserKind, normalizedKey, browserDir);
        }

        var downloadedArchive = DownloadBrowserArchive(download, manifest, normalizedKey, progress, cancellationToken);
        progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.Extracting, downloadedArchive));
        var installedPath = ExtractBrowserArchive(downloadedArchive, manifest, BuildInstallExecutableCandidates(download.Executable, executableCandidates), versionDir);
        progress?.Report(new RenderBrowserInstallProgress(RenderBrowserInstallStage.Completed, installedPath));
        return installedPath;
    }

    private RenderRuntimeOptions BuildOptions(CancellationToken cancellationToken, bool allowBrowserDownload)
    {
        var hostPath = HostConfig.ResolveRenderHostPath(_config.RenderHostPath!);
        if (!File.Exists(hostPath))
            throw new FileNotFoundException("Render CLI 不存在", hostPath);

        var browserPath = ResolveBrowserExecutablePath(cancellationToken, allowBrowserDownload);
        var profileRoot = HostConfig.ResolveRenderProfileRoot(_config.RenderProfileRoot!);
        var tempDir = HostConfig.ResolveRenderTempDir(_config.RenderTempDir!);
        var logDir = HostConfig.ResolveRenderLogDir(_config.RenderLogDir!);

        Directory.CreateDirectory(profileRoot);
        Directory.CreateDirectory(tempDir);
        Directory.CreateDirectory(logDir);

        return new RenderRuntimeOptions
        {
            HostPath = hostPath,
            BrowserKind = ResolveBrowserKind(browserPath),
            BrowserPath = browserPath,
            HeadlessMode = RenderHeadlessModeCatalog.NormalizeKey(_config.RenderBrowserHeadlessMode),
            ProfileRoot = profileRoot,
            TempDir = tempDir,
            LogDir = logDir,
            MaxConcurrency = _config.RenderMaxConcurrency,
            MaxQueueSize = _config.RenderMaxQueueSize,
            RequestTimeoutMs = _config.RenderRequestTimeoutMs,
            IdleTimeoutMs = _config.RenderIdleTimeoutMs
        };
    }

    private string ResolveBrowserExecutablePath(CancellationToken cancellationToken, bool allowBrowserDownload)
    {
        var browserKind = RenderBrowserKindCatalog.NormalizeKey(_config.RenderBrowserKind);
        var explicitPath = ResolveExplicitBrowserPath();
        if (explicitPath != null)
            return explicitPath;

        var normalizedKey = RenderBrowserVersionCatalog.NormalizeKey(_config.RenderBrowserVersion);
        var effectiveKey = RenderBrowserVersionCatalog.ResolveEffectiveKey(normalizedKey);
        var option = RenderBrowserVersionCatalog.GetOption(effectiveKey);
        var manifest = LoadManifestBrowserInfo(ResolveManifestPath());
        var executableCandidates = ResolveExecutableCandidates(browserKind, manifest, option);
        var browserDir = HostConfig.ResolveRenderBrowserDir(_config.RenderBrowserDir!);

        var bundledBrowser = LocateBrowserExecutable(HostConfig.DefaultRenderBrowserDir, executableCandidates);
        if (bundledBrowser != null)
            return bundledBrowser;

        var versionBrowser = LocateBrowserExecutable(HostConfig.GetRenderBrowserVersionDir(browserDir, normalizedKey), executableCandidates);
        if (versionBrowser != null)
            return versionBrowser;

        var cachedBrowser = LocateBrowserExecutable(browserDir, executableCandidates);
        if (cachedBrowser != null)
            return cachedBrowser;

        var systemBrowser = LocateSystemBrowser(browserKind, effectiveKey);
        if (systemBrowser != null)
            return systemBrowser;

        if (allowBrowserDownload)
        {
            var download = ResolveBrowserDownload(option, manifest, browserKind, cancellationToken);
            if (download != null)
            {
                var downloadedArchive = DownloadBrowserArchive(download, manifest, normalizedKey, null, cancellationToken);
                return ExtractBrowserArchive(downloadedArchive, manifest, BuildInstallExecutableCandidates(download.Executable, executableCandidates), HostConfig.GetRenderBrowserVersionDir(browserDir, normalizedKey));
            }
        }

        if (!allowBrowserDownload || string.IsNullOrWhiteSpace(_config.RenderBrowserArchivePath))
            throw CreateBrowserMissingException(browserKind, normalizedKey, browserDir);

        var archivePath = _config.RenderBrowserArchivePath!.Trim();
        return ExtractBrowserArchive(archivePath, manifest, executableCandidates, HostConfig.GetRenderBrowserVersionDir(browserDir, normalizedKey));
    }

    private string? ResolveExplicitBrowserPath()
    {
        if (string.IsNullOrWhiteSpace(_config.RenderBrowserExecutablePath))
            return null;

        var executablePath = _config.RenderBrowserExecutablePath!.Trim();
        if (!File.Exists(executablePath))
            throw new FileNotFoundException("Render 浏览器可执行文件不存在", executablePath);
        return executablePath;
    }

    private static string[] ResolveExecutableCandidates(string browserKind, ManifestBrowserInfo? manifest, RenderBrowserVersionOption option)
    {
        var candidates = RenderBrowserKindCatalog.GetExecutableCandidates(browserKind)
            .Cast<string?>()
            .ToList();
        if (!string.IsNullOrWhiteSpace(manifest?.Executable))
            candidates.Insert(0, manifest!.Executable!);
        if (!string.IsNullOrWhiteSpace(option.ExecutableHint))
            candidates.Add(option.ExecutableHint);

        return ExpandExecutableCandidates(candidates);
    }

    internal static string ExtractBrowserArchive(string archivePath, ManifestBrowserInfo? manifest, IEnumerable<string?> executableHints, string targetRoot)
    {
        if (!File.Exists(archivePath))
            throw new FileNotFoundException("Render Chrome zip 包不存在", archivePath);
        if (!string.Equals(Path.GetExtension(archivePath), ".zip", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Render Chrome 包仅支持 .zip 文件");

        var archiveHash = ComputeSha256(archivePath);
        ValidateBrowserArchive(archivePath, archiveHash, manifest);

        var targetDir = Path.Combine(targetRoot, Path.GetFileNameWithoutExtension(archivePath) + "-" + archiveHash.Substring(0, 12));
        Directory.CreateDirectory(targetRoot);
        var executableCandidates = BuildInstallExecutableCandidates(manifest?.Executable, executableHints);

        if (Directory.Exists(targetDir) && Directory.EnumerateFileSystemEntries(targetDir).Any())
        {
            var cachedBrowserPath = LocateBrowserExecutable(targetDir, executableCandidates);
            if (cachedBrowserPath != null)
                return cachedBrowserPath;

            TryDeleteDirectory(targetDir);
        }

        Directory.CreateDirectory(targetDir);
        try
        {
            ZipFile.ExtractToDirectory(archivePath, targetDir);
        }
        catch
        {
            TryDeleteDirectory(targetDir);
            throw;
        }

        var browserPath = LocateBrowserExecutable(targetDir, executableCandidates);
        if (browserPath == null)
        {
            var entries = ListArchiveEntries(archivePath, 12);
            TryDeleteDirectory(targetDir);
            throw new FileNotFoundException(
                "Render Chrome zip 包中未找到可执行文件。候选: " + string.Join(", ", executableCandidates) + "; zip entries: " + entries,
                targetDir);
        }

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

    private BrowserDownloadInfo? ResolveBrowserDownload(RenderBrowserVersionOption option, ManifestBrowserInfo? manifest, string browserKind, CancellationToken cancellationToken)
    {
        var context = new RenderBrowserDownloadContext(
            browserKind,
            option,
            manifest,
            _config.RenderBrowserDownloadUrl,
            ResolveExecutableCandidates(browserKind, manifest, option),
            ReadJsonFromUrl);
        return RenderBrowserDownloadResolver.Resolve(context, cancellationToken);
    }

    private string DownloadBrowserArchive(BrowserDownloadInfo download, ManifestBrowserInfo? manifest, string versionKey, IProgress<RenderBrowserInstallProgress>? progress, CancellationToken cancellationToken)
    {
        var browserDir = HostConfig.ResolveRenderBrowserDir(_config.RenderBrowserDir!);
        var versionDir = HostConfig.GetRenderBrowserVersionDir(browserDir, versionKey);
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
                throw new InvalidOperationException("Render 浏览器下载文件大小不完整");

            if (File.Exists(archivePath))
                File.Delete(archivePath);
            File.Move(tempArchivePath, archivePath);
            SimpleLogger.Info("Render 浏览器下载完成: " + archivePath);
            return archivePath;
        }
        catch
        {
            if (File.Exists(tempArchivePath))
                File.Delete(tempArchivePath);
            throw;
        }
    }

    private string ReadJsonFromUrl(string url, CancellationToken cancellationToken)
    {
        using var http = CreateHttpClient(TimeSpan.FromMilliseconds(Math.Max(_config.RenderRequestTimeoutMs, 30000)));
        using var response = http.GetAsync(url, cancellationToken).GetAwaiter().GetResult();
        response.EnsureSuccessStatusCode();
        return response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
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
        return LocateBrowserExecutable(root, ExpandExecutableCandidates(new[] { manifestExecutable }));
    }

    private static string[] BuildInstallExecutableCandidates(string? primaryExecutable, IEnumerable<string?> executableCandidates)
    {
        return ExpandExecutableCandidates(new[] { primaryExecutable }
            .Concat(executableCandidates)
            .Concat(new[]
            {
                "chrome.exe",
                "chromium.exe",
                "chrome-win64/chrome.exe",
                "chrome-win32/chrome.exe",
                "chrome-win/chrome.exe"
            }));
    }

    private static string? LocateBrowserExecutable(string root, string[] executableCandidates)
    {
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            return null;

        foreach (var candidate in executableCandidates)
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

    private static string? LocateSystemBrowser(string browserKind, string effectiveKey)
    {
        if (string.Equals(browserKind, RenderBrowserKindCatalog.AutoKey, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(browserKind, RenderBrowserKindCatalog.ChromeForTestingKey, StringComparison.OrdinalIgnoreCase))
            return LocateSystemChromeForLegacyWindows(effectiveKey);

        if (string.Equals(browserKind, RenderBrowserKindCatalog.EdgeKey, StringComparison.OrdinalIgnoreCase))
            return EnumerateSystemEdgeCandidates().FirstOrDefault(File.Exists);

        if (string.Equals(browserKind, RenderBrowserKindCatalog.ChromeKey, StringComparison.OrdinalIgnoreCase))
            return EnumerateSystemChromeCandidates().FirstOrDefault(File.Exists);

        if (string.Equals(browserKind, RenderBrowserKindCatalog.ChromiumKey, StringComparison.OrdinalIgnoreCase))
            return EnumerateSystemChromiumCandidates().FirstOrDefault(File.Exists);

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

    private static string[] EnumerateSystemEdgeCandidates()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

        return new[]
        {
            ReadRegistryString(@"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe", string.Empty),
            ReadRegistryString(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe", string.Empty),
            ReadRegistryString(@"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe", string.Empty),
            Path.Combine(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")
        }.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s!).ToArray();
    }

    private static string[] EnumerateSystemChromiumCandidates()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

        return new[]
        {
            Path.Combine(localAppData, "Chromium", "Application", "chrome.exe"),
            Path.Combine(programFiles, "Chromium", "Application", "chrome.exe"),
            Path.Combine(programFilesX86, "Chromium", "Application", "chrome.exe"),
            Path.Combine(localAppData, "Chromium", "Application", "chromium.exe"),
            Path.Combine(programFiles, "Chromium", "Application", "chromium.exe"),
            Path.Combine(programFilesX86, "Chromium", "Application", "chromium.exe")
        };
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

    private static string[] ExpandExecutableCandidates(IEnumerable<string?> executableCandidates)
    {
        return executableCandidates
            .SelectMany(c => new[] { c, AppendExe(c) })
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s!.Replace('/', Path.DirectorySeparatorChar))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string ListArchiveEntries(string archivePath, int maxEntries)
    {
        try
        {
            using var archive = ZipFile.OpenRead(archivePath);
            var entries = archive.Entries
                .Take(maxEntries)
                .Select(e => e.FullName)
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToArray();
            return entries.Length == 0 ? "<empty>" : string.Join(", ", entries);
        }
        catch
        {
            return "<unreadable>";
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
                Directory.Delete(path, true);
        }
        catch
        {
        }
    }

    private static string? AppendExe(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value!.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            return value;
        return value + ".exe";
    }

    private void StopDaemon()
    {
        var hostPath = HostConfig.ResolveRenderHostPath(_config.RenderHostPath!);
        if (!File.Exists(hostPath))
            return;

        try
        {
            using var process = new Process();
            process.StartInfo = new ProcessStartInfo
            {
                FileName = hostPath,
                Arguments = "daemon stop",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                WorkingDirectory = Path.GetDirectoryName(hostPath) ?? AppDomain.CurrentDomain.BaseDirectory
            };

            if (process.Start() && !process.WaitForExit(3000))
                process.Kill();
        }
        catch (Exception ex)
        {
            SimpleLogger.Debug("Render daemon 停止异常", ex);
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

    private string ResolveBrowserKind(string browserPath)
    {
        var configuredKind = RenderBrowserKindCatalog.NormalizeKey(_config.RenderBrowserKind);
        return string.Equals(configuredKind, RenderBrowserKindCatalog.AutoKey, StringComparison.OrdinalIgnoreCase)
            ? InferBrowserKind(browserPath)
            : configuredKind;
    }

    private static string InferBrowserKind(string browserPath)
    {
        var name = Path.GetFileNameWithoutExtension(browserPath) ?? string.Empty;
        if (name.IndexOf("headless-shell", StringComparison.OrdinalIgnoreCase) >= 0)
            return "headless-shell";
        if (name.IndexOf("chromium", StringComparison.OrdinalIgnoreCase) >= 0)
            return "chromium";
        if (name.IndexOf("chrome", StringComparison.OrdinalIgnoreCase) >= 0)
            return "chrome-for-testing";
        if (name.IndexOf("msedge", StringComparison.OrdinalIgnoreCase) >= 0)
            return "edge";
        return "chrome-for-testing";
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

    private static InvalidOperationException CreateBrowserMissingException(string browserKind, string versionKey, string browserDir)
    {
        return new InvalidOperationException(
            "Render 浏览器未安装。请在设置页选择浏览器类型和版本后点击下载，或将对应浏览器解压到 " +
            HostConfig.GetRenderBrowserVersionDir(browserDir, versionKey) + " 后重试。当前类型: " + browserKind);
    }

    private static string SanitizeFileName(string value)
    {
        var result = value.Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars())
            result = result.Replace(invalid, '_');
        return string.IsNullOrWhiteSpace(result) ? "chrome-for-testing" : result;
    }

}