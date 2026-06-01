using System;
using System.Collections.Generic;
using System.Linq;

namespace EasyInk.Printer.Config;

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
