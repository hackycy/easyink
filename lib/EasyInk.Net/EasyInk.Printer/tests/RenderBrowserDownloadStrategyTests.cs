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
    public void Resolve_HeadlessShellStable_UsesChromeForTestingHeadlessShellPackage()
    {
        var context = CreateContext(RenderBrowserKindCatalog.HeadlessShellKey, RenderBrowserVersionCatalog.StableKey, ChromeForTestingStableJson());

        var download = RenderBrowserDownloadResolver.Resolve(context, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("chrome-for-testing", download!.Source);
        Assert.Contains("chrome-headless-shell-win64.zip", download.Url);
        Assert.Equal("chrome-headless-shell-win64/chrome-headless-shell.exe", download.Executable);
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
}
