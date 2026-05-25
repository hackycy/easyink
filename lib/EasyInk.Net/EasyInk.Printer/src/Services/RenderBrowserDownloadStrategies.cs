using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using EasyInk.Printer.Config;
using Newtonsoft.Json.Linq;

namespace EasyInk.Printer.Services;

internal sealed class BrowserDownloadInfo
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

internal sealed class ManifestBrowserInfo
{
    public string? Executable { get; set; }
    public string? Url { get; set; }
    public string? Sha256 { get; set; }
    public long? Size { get; set; }
}

internal sealed class RenderBrowserDownloadContext
{
    public RenderBrowserDownloadContext(
        string browserKind,
        RenderBrowserVersionOption version,
        ManifestBrowserInfo? manifest,
        string? configuredUrl,
        string[] executableCandidates,
        Func<string, CancellationToken, string> readJsonFromUrl)
    {
        BrowserKind = browserKind;
        Version = version;
        Manifest = manifest;
        ConfiguredUrl = configuredUrl;
        ExecutableCandidates = executableCandidates;
        ReadJsonFromUrl = readJsonFromUrl;
    }

    public string BrowserKind { get; }
    public RenderBrowserVersionOption Version { get; }
    public ManifestBrowserInfo? Manifest { get; }
    public string? ConfiguredUrl { get; }
    public string[] ExecutableCandidates { get; }
    public Func<string, CancellationToken, string> ReadJsonFromUrl { get; }
    public string ChromeForTestingPlatform => Environment.Is64BitOperatingSystem ? "win64" : "win32";
    public string ChromiumSnapshotPlatform => Environment.Is64BitOperatingSystem ? "Win_x64" : "Win";
}

internal interface IRenderBrowserDownloadStrategy
{
    BrowserDownloadInfo? Resolve(RenderBrowserDownloadContext context, CancellationToken cancellationToken);
}

internal static class RenderBrowserDownloadResolver
{
    private static readonly IRenderBrowserDownloadStrategy[] _strategies =
    {
        new ConfiguredBrowserDownloadUrlStrategy(),
        new ChromiumSnapshotDownloadStrategy(),
        new ChromeForTestingDownloadStrategy(),
        new ManifestBrowserDownloadStrategy()
    };

    public static BrowserDownloadInfo? Resolve(RenderBrowserDownloadContext context, CancellationToken cancellationToken)
    {
        foreach (var strategy in _strategies)
        {
            var download = strategy.Resolve(context, cancellationToken);
            if (download != null)
                return download;
        }

        return null;
    }
}

internal sealed class ConfiguredBrowserDownloadUrlStrategy : IRenderBrowserDownloadStrategy
{
    public BrowserDownloadInfo? Resolve(RenderBrowserDownloadContext context, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(context.ConfiguredUrl))
            return null;

        return new BrowserDownloadInfo(
            context.ConfiguredUrl!.Trim(),
            context.Version.DisplayName,
            context.ExecutableCandidates.First(),
            "configured-url",
            null);
    }
}

internal sealed class ChromiumSnapshotDownloadStrategy : IRenderBrowserDownloadStrategy
{
    private const string SnapshotRoot = "https://commondatastorage.googleapis.com/chromium-browser-snapshots";

    private static readonly IReadOnlyDictionary<string, string> MilestoneRevisions = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [RenderBrowserVersionCatalog.LegacyWindowsKey] = "1069273"
    };

    public BrowserDownloadInfo? Resolve(RenderBrowserDownloadContext context, CancellationToken cancellationToken)
    {
        if (!string.Equals(context.BrowserKind, RenderBrowserKindCatalog.ChromiumKey, StringComparison.OrdinalIgnoreCase))
            return null;

        var revision = ResolveRevision(context, cancellationToken);
        if (string.IsNullOrWhiteSpace(revision))
            return null;

        var platform = context.ChromiumSnapshotPlatform;
        var url = SnapshotRoot + "/" + platform + "/" + revision + "/chrome-win.zip";
        return new BrowserDownloadInfo(
            url,
            context.Version.DisplayName + "-chromium-" + platform + "-" + revision,
            "chrome-win/chrome.exe",
            "chromium-snapshot",
            null);
    }

    private static string? ResolveRevision(RenderBrowserDownloadContext context, CancellationToken cancellationToken)
    {
        if (MilestoneRevisions.TryGetValue(context.Version.Key, out var revision))
            return revision;

        if (!string.Equals(context.Version.Key, RenderBrowserVersionCatalog.StableKey, StringComparison.OrdinalIgnoreCase))
            return null;

        return context.ReadJsonFromUrl(
            SnapshotRoot + "/" + context.ChromiumSnapshotPlatform + "/LAST_CHANGE",
            cancellationToken).Trim();
    }
}

internal sealed class ChromeForTestingDownloadStrategy : IRenderBrowserDownloadStrategy
{
    private const string StableUrl = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
    private const string MilestoneUrl = "https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone-with-downloads.json";

    public BrowserDownloadInfo? Resolve(RenderBrowserDownloadContext context, CancellationToken cancellationToken)
    {
        if (!SupportsBrowserKind(context.BrowserKind) || !context.Version.SupportsAutomaticDownload)
            return null;

        var json = context.ReadJsonFromUrl(
            string.Equals(context.Version.Key, RenderBrowserVersionCatalog.StableKey, StringComparison.OrdinalIgnoreCase) ? StableUrl : MilestoneUrl,
            cancellationToken);
        var root = JObject.Parse(json);
        var versionNode = string.Equals(context.Version.Key, RenderBrowserVersionCatalog.StableKey, StringComparison.OrdinalIgnoreCase)
            ? root["channels"]?["Stable"] as JObject
            : root["milestones"]?[context.Version.ChromeForTestingMilestone!] as JObject;

        if (versionNode == null)
            throw new InvalidOperationException("未找到可下载的 Render Chrome 版本: " + context.Version.DisplayName);

        var version = versionNode.Value<string>("version") ?? context.Version.DisplayName;
        var downloads = versionNode["downloads"] as JObject;
        var download = ResolveDownload(context.BrowserKind, downloads, context.ChromeForTestingPlatform);
        if (download == null)
            throw new InvalidOperationException("未找到适用于 Windows 的 Render 浏览器下载包: " + context.Version.DisplayName);

        return new BrowserDownloadInfo(
            download.Url,
            version + "-" + download.DownloadType + "-" + download.Platform,
            download.Executable,
            "chrome-for-testing",
            null);
    }

    private static bool SupportsBrowserKind(string browserKind)
    {
        return string.Equals(browserKind, RenderBrowserKindCatalog.AutoKey, StringComparison.OrdinalIgnoreCase)
               || string.Equals(browserKind, RenderBrowserKindCatalog.ChromeForTestingKey, StringComparison.OrdinalIgnoreCase)
               || string.Equals(browserKind, RenderBrowserKindCatalog.HeadlessShellKey, StringComparison.OrdinalIgnoreCase)
               || string.Equals(browserKind, RenderBrowserKindCatalog.ChromeKey, StringComparison.OrdinalIgnoreCase);
    }

    private static ChromeForTestingDownload? ResolveDownload(string browserKind, JObject? downloads, string platform)
    {
        var preferHeadlessShell = string.Equals(browserKind, RenderBrowserKindCatalog.AutoKey, StringComparison.OrdinalIgnoreCase)
                                  || string.Equals(browserKind, RenderBrowserKindCatalog.ChromeForTestingKey, StringComparison.OrdinalIgnoreCase)
                                  || string.Equals(browserKind, RenderBrowserKindCatalog.HeadlessShellKey, StringComparison.OrdinalIgnoreCase);
        return preferHeadlessShell
            ? FindDownload(downloads, "chrome-headless-shell", platform)
              ?? FindDownload(downloads, "chrome", platform)
              ?? FindDownload(downloads, "chrome-headless-shell", "win32")
              ?? FindDownload(downloads, "chrome", "win32")
            : FindDownload(downloads, "chrome", platform)
              ?? FindDownload(downloads, "chrome-headless-shell", platform)
              ?? FindDownload(downloads, "chrome", "win32")
              ?? FindDownload(downloads, "chrome-headless-shell", "win32");
    }

    private static ChromeForTestingDownload? FindDownload(JObject? downloads, string downloadType, string platform)
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
}

internal sealed class ManifestBrowserDownloadStrategy : IRenderBrowserDownloadStrategy
{
    public BrowserDownloadInfo? Resolve(RenderBrowserDownloadContext context, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(context.Manifest?.Url))
            return null;

        return new BrowserDownloadInfo(
            context.Manifest!.Url!,
            context.Version.DisplayName,
            context.Manifest.Executable ?? context.ExecutableCandidates.First(),
            "manifest",
            context.Manifest.Size);
    }
}
