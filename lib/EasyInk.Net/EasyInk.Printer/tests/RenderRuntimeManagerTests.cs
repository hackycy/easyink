using System;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using EasyInk.Printer.Services;
using Xunit;

namespace EasyInk.Printer.Tests;

public class RenderRuntimeManagerTests
{
    [Fact]
    public void ExtractBrowserArchive_FindsChromiumChromeExe()
    {
        var tempRoot = CreateTempRoot();
        try
        {
            var archivePath = Path.Combine(tempRoot, "chrome-win.zip");
            var targetRoot = Path.Combine(tempRoot, "versions", "stable");
            CreateZip(archivePath, "chrome-win/chrome.exe", "browser");

            var browserPath = RenderRuntimeManager.ExtractBrowserArchive(
                archivePath,
                manifest: null,
                executableHints: new[] { "chrome-win/chrome.exe", "chrome.exe" },
                targetRoot: targetRoot);

            Assert.EndsWith(Path.Combine("chrome-win", "chrome.exe"), browserPath, StringComparison.OrdinalIgnoreCase);
            Assert.True(File.Exists(browserPath));
        }
        finally
        {
            DeleteTempRoot(tempRoot);
        }
    }

    [Fact]
    public void ExtractBrowserArchive_RebuildsStaleExtractedDirectoryWithoutExecutable()
    {
        var tempRoot = CreateTempRoot();
        try
        {
            var archivePath = Path.Combine(tempRoot, "chrome-win64.zip");
            var targetRoot = Path.Combine(tempRoot, "versions", "stable");
            CreateZip(archivePath, "chrome-win64/chrome.exe", "browser");

            var staleDir = Path.Combine(targetRoot, "chrome-win64-" + ComputeSha256(archivePath).Substring(0, 12));
            Directory.CreateDirectory(staleDir);
            File.WriteAllText(Path.Combine(staleDir, "partial.txt"), "partial");

            var browserPath = RenderRuntimeManager.ExtractBrowserArchive(
                archivePath,
                manifest: null,
                executableHints: new[] { "chrome-win64/chrome.exe", "chrome.exe" },
                targetRoot: targetRoot);

            Assert.True(File.Exists(browserPath));
            Assert.False(File.Exists(Path.Combine(staleDir, "partial.txt")));
        }
        finally
        {
            DeleteTempRoot(tempRoot);
        }
    }

    private static string CreateTempRoot()
    {
        var path = Path.Combine(Path.GetTempPath(), "easyink-printer-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }

    private static void CreateZip(string archivePath, string entryName, string content)
    {
        using var archive = ZipFile.Open(archivePath, ZipArchiveMode.Create);
        var entry = archive.CreateEntry(entryName);
        using var writer = new StreamWriter(entry.Open());
        writer.Write(content);
    }

    private static string ComputeSha256(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        using var sha = SHA256.Create();
        return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", string.Empty).ToLowerInvariant();
    }

    private static void DeleteTempRoot(string path)
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
}
