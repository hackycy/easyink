using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using EasyInk.Printer.Config;

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
        RenderBrowserVersionOption version,
        ManifestBrowserInfo? manifest,
        string? configuredUrl,
        string[] executableCandidates,
        Func<string, CancellationToken, string> readJsonFromUrl)
    {
        Version = version;
        Manifest = manifest;
        ConfiguredUrl = configuredUrl;
        ExecutableCandidates = executableCandidates;
        ReadJsonFromUrl = readJsonFromUrl;
    }

    public RenderBrowserVersionOption Version { get; }
    public ManifestBrowserInfo? Manifest { get; }
    public string? ConfiguredUrl { get; }
    public string[] ExecutableCandidates { get; }
    public Func<string, CancellationToken, string> ReadJsonFromUrl { get; }
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
        new ManifestBrowserDownloadStrategy(),
        new ChromiumSnapshotDownloadStrategy(),
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
        [RenderBrowserVersionCatalog.Chromium86Key] = "800218",
        [RenderBrowserVersionCatalog.Chromium109Key] = "1069273"
    };

    public BrowserDownloadInfo? Resolve(RenderBrowserDownloadContext context, CancellationToken cancellationToken)
    {
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
