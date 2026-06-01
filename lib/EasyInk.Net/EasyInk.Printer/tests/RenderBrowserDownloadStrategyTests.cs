using System.Threading;
using EasyInk.Printer.Config;
using EasyInk.Printer.Services;
using Xunit;

namespace EasyInk.Printer.Tests;

public class RenderBrowserDownloadStrategyTests
{
    [Fact]
    public void Resolve_Chromium109_UsesChromiumSnapshot()
    {
        var context = CreateContext(RenderBrowserVersionCatalog.Chromium109Key);

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("chromium-snapshot", download!.Source);
        Assert.Contains("/1069273/chrome-win.zip", download.Url);
        Assert.Equal("chrome-win/chrome.exe", download.Executable);
    }

    [Fact]
    public void Resolve_Chromium86_UsesChromiumSnapshot()
    {
        var context = CreateContext(RenderBrowserVersionCatalog.Chromium86Key);

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("chromium-snapshot", download!.Source);
        Assert.Contains("/800218/chrome-win.zip", download.Url);
        Assert.Equal("chrome-win/chrome.exe", download.Executable);
    }

    [Fact]
    public void Resolve_Stable_UsesLatestChromiumSnapshot()
    {
        var context = CreateContext(RenderBrowserVersionCatalog.StableKey, "123456\n");

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("chromium-snapshot", download!.Source);
        Assert.Contains("/123456/chrome-win.zip", download.Url);
        Assert.Equal("chrome-win/chrome.exe", download.Executable);
    }

    [Fact]
    public void Resolve_ManifestUrlWinsOverSnapshot()
    {
        var context = CreateContext(
            RenderBrowserVersionCatalog.StableKey,
            "123456\n",
            new ManifestBrowserInfo
            {
                Url = "https://example.test/chromium.zip",
                Executable = "chromium/chrome.exe",
                Size = 1024
            });

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("manifest", download!.Source);
        Assert.Equal("https://example.test/chromium.zip", download.Url);
        Assert.Equal("chromium/chrome.exe", download.Executable);
        Assert.Equal(1024, download.ExpectedSize);
    }

    private static RenderBrowserDownloadContext CreateContext(
        string versionKey,
        string json = "",
        ManifestBrowserInfo? manifest = null)
    {
        var version = RenderBrowserVersionCatalog.GetOption(versionKey);
        return new RenderBrowserDownloadContext(
            version,
            manifest,
            configuredUrl: null,
            executableCandidates: new[] { "chrome.exe", "chromium.exe" },
            readJsonFromUrl: (_, _) => json);
    }
}
