using System;
using System.Linq;
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
        var context = CreateContext(RenderBrowserKindCatalog.ChromiumKey, RenderBrowserVersionCatalog.LegacyWindowsKey);

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("chromium-snapshot", download!.Source);
        Assert.Contains("/1069273/chrome-win.zip", download.Url);
        Assert.Equal("chrome-win/chrome.exe", download.Executable);
    }

    [Fact]
    public void Resolve_Chromium86_UsesChromiumSnapshot()
    {
        var context = CreateContext(RenderBrowserKindCatalog.ChromiumKey, RenderBrowserVersionCatalog.Chromium86Key);

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("chromium-snapshot", download!.Source);
        Assert.Contains("/800218/chrome-win.zip", download.Url);
        Assert.Equal("chrome-win/chrome.exe", download.Executable);
    }

    [Fact]
    public void Resolve_Auto86_UsesChromiumSnapshot()
    {
        var context = CreateContext(RenderBrowserKindCatalog.AutoKey, RenderBrowserVersionCatalog.Chromium86Key);

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("chromium-snapshot", download!.Source);
        Assert.Contains("/800218/chrome-win.zip", download.Url);
        Assert.Equal("chrome-win/chrome.exe", download.Executable);
    }

    [Fact]
    public void Resolve_ChromeStable_UsesChromeForTestingChromePackage()
    {
        var context = CreateContext(RenderBrowserKindCatalog.ChromeKey, RenderBrowserVersionCatalog.StableKey, ChromeForTestingStableJson());

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("chrome-for-testing", download!.Source);
        Assert.Contains("chrome-win64.zip", download.Url);
        Assert.Equal("chrome-win64/chrome.exe", download.Executable);
    }

    [Fact]
    public void Resolve_AutoStable_UsesChromeForTestingChromePackage()
    {
        var context = CreateContext(RenderBrowserKindCatalog.AutoKey, RenderBrowserVersionCatalog.StableKey, ChromeForTestingStableJson());

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("chrome-for-testing", download!.Source);
        Assert.Contains("chrome-win64.zip", download.Url);
        Assert.Equal("chrome-win64/chrome.exe", download.Executable);
    }

    [Fact]
    public void Resolve_ChromeForTestingStable_DoesNotFallbackToHeadlessShell()
    {
        var context = CreateContext(RenderBrowserKindCatalog.ChromeForTestingKey, RenderBrowserVersionCatalog.StableKey, ChromeForTestingHeadlessShellOnlyJson());

        Assert.Throws<InvalidOperationException>(() => RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None));
    }

    [Fact]
    public void Resolve_Edge_ReturnsNullWithoutConfiguredOrManifestDownload()
    {
        var context = CreateContext(RenderBrowserKindCatalog.EdgeKey, RenderBrowserVersionCatalog.StableKey, ChromeForTestingStableJson());

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.Null(download);
    }

    private static RenderBrowserDownloadContext CreateContext(string browserKind, string versionKey, string json = "{}")
    {
        var version = RenderBrowserVersionCatalog.GetOption(versionKey);
        return new RenderBrowserDownloadContext(
            browserKind,
            version,
            manifest: null,
            configuredUrl: null,
            executableCandidates: RenderBrowserKindCatalog.GetExecutableCandidates(browserKind).ToArray(),
            readJsonFromUrl: (_, _) => json);
    }

    private static string ChromeForTestingStableJson()
    {
        return @"{
  ""channels"": {
    ""Stable"": {
      ""version"": ""136.0.0.0"",
      ""downloads"": {
        ""chrome"": [
          { ""platform"": ""win64"", ""url"": ""https://example.test/chrome-win64.zip"" }
        ],
        ""chrome-headless-shell"": [
          { ""platform"": ""win64"", ""url"": ""https://example.test/chrome-headless-shell-win64.zip"" }
        ]
      }
    }
  }
}";
    }

    private static string ChromeForTestingHeadlessShellOnlyJson()
    {
        return @"{
  ""channels"": {
    ""Stable"": {
      ""version"": ""136.0.0.0"",
      ""downloads"": {
        ""chrome-headless-shell"": [
          { ""platform"": ""win64"", ""url"": ""https://example.test/chrome-headless-shell-win64.zip"" }
        ]
      }
    }
  }
}";
    }
}
