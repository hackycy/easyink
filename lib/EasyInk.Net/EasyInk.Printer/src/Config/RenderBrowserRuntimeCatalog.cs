using System;
using System.Collections.Generic;
using System.Linq;

namespace EasyInk.Printer.Config;

internal sealed class RenderBrowserKindOption
{
    public RenderBrowserKindOption(string key, string displayName, params string[] executableCandidates)
    {
        Key = key;
        DisplayName = displayName;
        ExecutableCandidates = executableCandidates;
    }

    public string Key { get; }
    public string DisplayName { get; }
    public IReadOnlyList<string> ExecutableCandidates { get; }

    public override string ToString()
    {
        return DisplayName;
    }
}

internal static class RenderBrowserKindCatalog
{
    public const string AutoKey = "auto";
    public const string ChromeForTestingKey = "chrome-for-testing";
    public const string HeadlessShellKey = "headless-shell";
    public const string ChromiumKey = "chromium";
    public const string ChromeKey = "chrome";
    public const string EdgeKey = "edge";
    public const string CustomKey = "custom";

    private static readonly RenderBrowserKindOption[] _options =
    {
        new RenderBrowserKindOption(AutoKey, "Auto", "chrome-headless-shell.exe", "chrome.exe", "msedge.exe", "chromium.exe", "headless-shell.exe"),
        new RenderBrowserKindOption(ChromeForTestingKey, "Chrome for Testing", "chrome-headless-shell.exe", "chrome.exe"),
        new RenderBrowserKindOption(HeadlessShellKey, "Headless Shell", "chrome-headless-shell.exe", "headless-shell.exe"),
        new RenderBrowserKindOption(ChromiumKey, "Chromium", "chromium.exe", "chrome.exe"),
        new RenderBrowserKindOption(ChromeKey, "Chrome", "chrome.exe"),
        new RenderBrowserKindOption(EdgeKey, "Microsoft Edge", "msedge.exe"),
        new RenderBrowserKindOption(CustomKey, "Custom", "chrome-headless-shell.exe", "chrome.exe", "msedge.exe", "chromium.exe", "headless-shell.exe")
    };

    public static IReadOnlyList<RenderBrowserKindOption> Options => _options;

    public static RenderBrowserKindOption GetOption(string? key)
    {
        var normalizedKey = NormalizeKey(key);
        return _options.First(o => string.Equals(o.Key, normalizedKey, StringComparison.OrdinalIgnoreCase));
    }

    public static string NormalizeKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return AutoKey;

        var trimmed = key!.Trim();
        return _options.Any(o => string.Equals(o.Key, trimmed, StringComparison.OrdinalIgnoreCase))
            ? trimmed
            : AutoKey;
    }

    public static IReadOnlyList<string> GetExecutableCandidates(string? key)
    {
        return GetOption(key).ExecutableCandidates;
    }
}

internal sealed class RenderHeadlessModeOption
{
    public RenderHeadlessModeOption(string key, string displayName)
    {
        Key = key;
        DisplayName = displayName;
    }

    public string Key { get; }
    public string DisplayName { get; }

    public override string ToString()
    {
        return DisplayName;
    }
}

internal static class RenderHeadlessModeCatalog
{
    public const string AutoKey = "auto";

    private static readonly RenderHeadlessModeOption[] _options =
    {
        new RenderHeadlessModeOption(AutoKey, "Auto"),
        new RenderHeadlessModeOption("new", "New headless"),
        new RenderHeadlessModeOption("old", "Old headless"),
        new RenderHeadlessModeOption("shell", "Shell"),
        new RenderHeadlessModeOption("none", "None")
    };

    public static IReadOnlyList<RenderHeadlessModeOption> Options => _options;

    public static string NormalizeKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return AutoKey;

        var trimmed = key!.Trim();
        return _options.Any(o => string.Equals(o.Key, trimmed, StringComparison.OrdinalIgnoreCase))
            ? trimmed
            : AutoKey;
    }
}
