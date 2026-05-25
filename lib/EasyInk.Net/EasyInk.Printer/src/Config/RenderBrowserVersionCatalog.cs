using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;

namespace EasyInk.Printer.Config;

internal sealed class RenderBrowserVersionOption
{
    public RenderBrowserVersionOption(string key, string displayName, string? chromeForTestingMilestone, string executableHint, bool supportsAutomaticDownload, bool supportsLegacyWindows)
    {
        Key = key;
        DisplayName = displayName;
        ChromeForTestingMilestone = chromeForTestingMilestone;
        ExecutableHint = executableHint;
        SupportsAutomaticDownload = supportsAutomaticDownload;
        SupportsLegacyWindows = supportsLegacyWindows;
    }

    public string Key { get; }
    public string DisplayName { get; }
    public string? ChromeForTestingMilestone { get; }
    public string ExecutableHint { get; }
    public bool SupportsAutomaticDownload { get; }
    public bool SupportsLegacyWindows { get; }

    public override string ToString()
    {
        return DisplayName;
    }
}

internal static class RenderBrowserVersionCatalog
{
    public const string AutoKey = "auto";
    public const string StableKey = "stable";
    public const string Chromium86Key = "86";
    public const string LegacyWindowsKey = "109";

    private static readonly RenderBrowserVersionOption[] _options =
    {
        new RenderBrowserVersionOption(AutoKey, "Auto", null, "chrome.exe", true, true),
        new RenderBrowserVersionOption(StableKey, "Chrome Stable", null, "chrome.exe", true, false),
        new RenderBrowserVersionOption("136", "Chrome 136", "136", "chrome.exe", true, false),
        new RenderBrowserVersionOption("131", "Chrome 131", "131", "chrome.exe", true, false),
        new RenderBrowserVersionOption("126", "Chrome 126", "126", "chrome.exe", true, false),
        new RenderBrowserVersionOption("120", "Chrome 120", "120", "chrome.exe", true, false),
        new RenderBrowserVersionOption("114", "Chrome 114", "114", "chrome.exe", true, false),
        new RenderBrowserVersionOption(LegacyWindowsKey, "Chromium 109 (Windows 7/8.1)", null, "chrome.exe", true, true),
        new RenderBrowserVersionOption(Chromium86Key, "Chromium 86", null, "chrome.exe", true, true)
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
            return AutoKey;

        var trimmed = key!.Trim();
        return _options.Any(o => string.Equals(o.Key, trimmed, StringComparison.OrdinalIgnoreCase))
            ? trimmed
            : AutoKey;
    }

    public static string ResolveEffectiveKey(string? key)
    {
        var normalizedKey = NormalizeKey(key);
        return string.Equals(normalizedKey, AutoKey, StringComparison.OrdinalIgnoreCase)
            ? GetRecommendedKey()
            : normalizedKey;
    }

    public static string GetRecommendedKey()
    {
        return IsLegacyWindows() ? LegacyWindowsKey : StableKey;
    }

    public static bool IsLegacyWindows()
    {
        return Environment.OSVersion.Platform == PlatformID.Win32NT && GetWindowsMajorVersion() < 10;
    }

    private static int GetWindowsMajorVersion()
    {
        try
        {
            var versionInfo = new OsVersionInfoEx { OSVersionInfoSize = Marshal.SizeOf(typeof(OsVersionInfoEx)) };
            if (RtlGetVersion(ref versionInfo) == 0 && versionInfo.MajorVersion > 0)
                return versionInfo.MajorVersion;
        }
        catch
        {
        }

        return Environment.OSVersion.Version.Major;
    }

    [DllImport("ntdll.dll")]
    private static extern int RtlGetVersion(ref OsVersionInfoEx versionInfo);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct OsVersionInfoEx
    {
        public int OSVersionInfoSize;
        public int MajorVersion;
        public int MinorVersion;
        public int BuildNumber;
        public int PlatformId;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string CSDVersion;
        public ushort ServicePackMajor;
        public ushort ServicePackMinor;
        public ushort SuiteMask;
        public byte ProductType;
        public byte Reserved;
    }
}
