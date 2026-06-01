using System;
using System.Collections.Generic;
using System.Linq;

namespace EasyInk.Printer.Config;

internal sealed class RenderBrowserVersionOption
{
    public RenderBrowserVersionOption(string key, string displayName, string executableHint)
    {
        Key = key;
        DisplayName = displayName;
        ExecutableHint = executableHint;
    }

    public string Key { get; }
    public string DisplayName { get; }
    public string ExecutableHint { get; }

    public override string ToString()
    {
        return DisplayName;
    }
}

internal static class RenderBrowserVersionCatalog
{
    public const string StableKey = "stable";
    public const string Chromium109Key = "109";
    public const string Chromium86Key = "86";

    private static readonly RenderBrowserVersionOption[] _options =
    {
        new RenderBrowserVersionOption(StableKey, "Chromium latest", "chrome.exe"),
        new RenderBrowserVersionOption(Chromium109Key, "Chromium 109", "chrome.exe"),
        new RenderBrowserVersionOption(Chromium86Key, "Chromium 86", "chrome.exe")
    };

    public static IReadOnlyList<RenderBrowserVersionOption> Options => _options;

    public static RenderBrowserVersionOption GetOption(string? key)
    {
        var normalizedKey = NormalizeKey(key);
        return _options.First(o => string.Equals(o.Key, normalizedKey, StringComparison.OrdinalIgnoreCase));
    }

    public static string NormalizeKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return StableKey;

        var trimmed = key!.Trim();
        return _options.Any(o => string.Equals(o.Key, trimmed, StringComparison.OrdinalIgnoreCase))
            ? trimmed
            : StableKey;
    }
}
