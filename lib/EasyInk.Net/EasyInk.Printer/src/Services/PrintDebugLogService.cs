using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Printer.Config;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EasyInk.Printer.Services;

public sealed class PrintDebugLogService : IDisposable
{
    private const string RequestFileName = "request.json";
    private const string InputPdfFileName = "input.pdf";
    private const string ManifestFileName = "manifest.json";
    private const string EngineLogFileName = "engine.log";
    private const string SubmitResultFileName = "submit-result.json";
    private const string CompletionResultFileName = "completion-result.json";
    private static readonly TimeSpan TerminalSubmitGracePeriod = TimeSpan.FromHours(1);

    private readonly bool _enabled;
    private readonly string _artifactRoot;
    private readonly int _retentionCount;
    private readonly ConcurrentDictionary<string, string> _artifactPaths = new();
    private readonly System.Threading.Timer? _cleanupTimer;

    public PrintDebugLogService(HostConfig config)
    {
        _enabled = config.PrintDebugLoggingEnabled;
        _artifactRoot = HostConfig.ResolvePrintDebugArtifactsDir(config.PrintDebugArtifactsDir!);
        _retentionCount = Math.Max(1, config.PrintDebugArtifactRetentionCount);

        if (!_enabled) return;

        try
        {
            Directory.CreateDirectory(_artifactRoot);
            CleanupExpiredArtifacts();
            _cleanupTimer = new System.Threading.Timer(
                _ => CleanupExpiredArtifactsSafe(),
                null,
                TimeSpan.FromDays(1),
                TimeSpan.FromDays(1));
        }
        catch (Exception ex)
        {
            SimpleLogger.Error("打印调试日志初始化失败", ex);
        }
    }

    public bool Enabled => _enabled;

    public void BeginPrintRequest(string requestId, string command, string? parametersJson, byte[]? pdfBytes)
    {
        if (!_enabled || string.IsNullOrWhiteSpace(requestId)) return;

        try
        {
            var directory = CreateArtifactDirectory(requestId);
            _artifactPaths[requestId] = directory;

            var requestJson = BuildRequestJson(command, parametersJson, pdfBytes, directory);
            File.WriteAllText(Path.Combine(directory, RequestFileName), requestJson);

            SavePdfBytes(directory, pdfBytes, overwrite: false);
            WriteManifest(directory, requestId, command);
            CleanupExpiredArtifacts();

            SimpleLogger.Info($"打印调试附件已创建: jobId={requestId}, path={directory}");
        }
        catch (Exception ex)
        {
            SimpleLogger.Error($"打印调试附件保存失败: jobId={requestId}", ex);
        }
    }

    public void BeginPrintRequest(string requestId, string command, JObject? parameters, byte[]? pdfBytes)
    {
        BeginPrintRequest(requestId, command, parameters?.ToString(Formatting.None), pdfBytes);
    }

    public void WriteSubmitResult(string requestId, PrinterResult result)
    {
        WriteResult(requestId, SubmitResultFileName, result);
    }

    public void WriteCompletionResult(string requestId, PrintRequestParams request, PrinterResult result)
    {
        if (!_enabled) return;

        var directory = GetArtifactDirectory(requestId);
        if (directory == null) return;

        try
        {
            var payload = new
            {
                completedAt = DateTime.Now,
                request = new
                {
                    request.PrinterName,
                    request.Copies,
                    request.Dpi,
                    request.Landscape,
                    request.PaperSize,
                    request.Offset,
                    request.UserData,
                    hasPdfBytes = request.PdfBytes != null && request.PdfBytes.Length > 0,
                    hasPdfBase64 = !string.IsNullOrEmpty(request.PdfBase64),
                    hasPdfUrl = !string.IsNullOrEmpty(request.PdfUrl),
                    request.PdfUrl
                },
                result
            };
            File.WriteAllText(
                Path.Combine(directory, CompletionResultFileName),
                JsonConvert.SerializeObject(payload, Formatting.Indented, EasyInk.Engine.JsonConfig.CamelCase));
        }
        catch (Exception ex)
        {
            SimpleLogger.Error($"打印调试完成结果保存失败: jobId={requestId}", ex);
        }
    }

    public void AppendEngineLog(string? jobId, LogLevel level, string message)
    {
        if (!_enabled || string.IsNullOrWhiteSpace(jobId)) return;

        var directory = GetArtifactDirectory(jobId!);
        if (directory == null) return;

        try
        {
            var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [{level}] {message}";
            File.AppendAllText(Path.Combine(directory, EngineLogFileName), line + Environment.NewLine);
        }
        catch (Exception ex)
        {
            SimpleLogger.Error($"打印调试引擎日志保存失败: jobId={jobId}", ex);
        }
    }

    private void WriteResult(string requestId, string fileName, PrinterResult result)
    {
        if (!_enabled) return;

        var directory = GetArtifactDirectory(requestId);
        if (directory == null) return;

        try
        {
            var payload = new { writtenAt = DateTime.Now, result };
            File.WriteAllText(
                Path.Combine(directory, fileName),
                JsonConvert.SerializeObject(payload, Formatting.Indented, EasyInk.Engine.JsonConfig.CamelCase));
        }
        catch (Exception ex)
        {
            SimpleLogger.Error($"打印调试结果保存失败: jobId={requestId}", ex);
        }
    }

    private string CreateArtifactDirectory(string requestId)
    {
        var dayDirectory = Path.Combine(_artifactRoot, DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        Directory.CreateDirectory(dayDirectory);

        var directoryName = DateTime.Now.ToString("yyyyMMdd-HHmmssfff", CultureInfo.InvariantCulture) + "_" + SanitizeFileName(requestId);
        var directory = Path.Combine(dayDirectory, directoryName);
        Directory.CreateDirectory(directory);
        return directory;
    }

    private string? GetArtifactDirectory(string requestId)
    {
        if (_artifactPaths.TryGetValue(requestId, out var directory) && Directory.Exists(directory))
            return directory;

        var found = Directory.Exists(_artifactRoot)
            ? Directory.GetDirectories(_artifactRoot, "*", SearchOption.AllDirectories)
                .Where(d => Path.GetFileName(d).EndsWith("_" + SanitizeFileName(requestId), StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(Directory.GetCreationTimeUtc)
                .FirstOrDefault()
            : null;

        if (found != null)
            _artifactPaths[requestId] = found;

        return found;
    }

    private string BuildRequestJson(string command, string? parametersJson, byte[]? pdfBytes, string directory)
    {
        JToken parameters;
        if (string.IsNullOrWhiteSpace(parametersJson))
        {
            parameters = new JObject();
        }
        else
        {
            parameters = JToken.Parse(parametersJson!);
        }

        RedactApiKey(parameters);
        ExtractPdfBase64(parameters, directory, pdfBytes != null && pdfBytes.Length > 0);

        if (pdfBytes != null && pdfBytes.Length > 0 && parameters is JObject obj)
        {
            obj["pdfBytes"] = new JObject
            {
                ["savedAs"] = InputPdfFileName,
                ["bytes"] = pdfBytes.Length,
                ["sha256"] = ComputeSha256(pdfBytes)
            };
        }

        var payload = new JObject
        {
            ["createdAt"] = DateTime.Now,
            ["command"] = command,
            ["parameters"] = parameters
        };
        return payload.ToString(Formatting.Indented);
    }

    private static void RedactApiKey(JToken token)
    {
        if (token is JObject obj)
        {
            foreach (var prop in obj.Properties().ToList())
            {
                if (string.Equals(prop.Name, "apiKey", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(prop.Name, "x-api-key", StringComparison.OrdinalIgnoreCase))
                {
                    prop.Value = "***";
                    continue;
                }

                RedactApiKey(prop.Value);
            }
        }
        else if (token is JArray array)
        {
            foreach (var item in array)
                RedactApiKey(item);
        }
    }

    private static void ExtractPdfBase64(JToken token, string directory, bool hasPdfBytes)
    {
        if (!(token is JObject obj)) return;

        var prop = obj.Properties().FirstOrDefault(p => string.Equals(p.Name, "pdfBase64", StringComparison.OrdinalIgnoreCase));
        if (prop != null && prop.Value.Type == JTokenType.String)
        {
            var value = prop.Value.ToString();
            try
            {
                var bytes = Convert.FromBase64String(value);
                if (!hasPdfBytes)
                    SavePdfBytes(directory, bytes, overwrite: true);

                prop.Value = new JObject
                {
                    ["savedAs"] = InputPdfFileName,
                    ["bytes"] = bytes.Length,
                    ["sha256"] = ComputeSha256(bytes)
                };
            }
            catch (FormatException)
            {
                prop.Value = new JObject
                {
                    ["invalidBase64"] = true,
                    ["length"] = value.Length
                };
            }
        }

        foreach (var child in obj.Properties().Select(p => p.Value).ToList())
            ExtractPdfBase64(child, directory, hasPdfBytes);
    }

    private static void SavePdfBytes(string directory, byte[]? pdfBytes, bool overwrite)
    {
        if (pdfBytes == null || pdfBytes.Length == 0) return;

        var path = Path.Combine(directory, InputPdfFileName);
        if (!overwrite && File.Exists(path)) return;
        File.WriteAllBytes(path, pdfBytes);
    }

    private static string ComputeSha256(byte[] bytes)
    {
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(bytes);
        return BitConverter.ToString(hash).Replace("-", string.Empty).ToLowerInvariant();
    }

    private static string SanitizeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var chars = value.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray();
        var sanitized = new string(chars).Trim();
        return string.IsNullOrEmpty(sanitized) ? Guid.NewGuid().ToString("N") : sanitized;
    }

    private static void WriteManifest(string directory, string requestId, string command)
    {
        var manifest = new
        {
            requestId,
            command,
            createdAt = DateTime.Now,
            path = directory
        };
        File.WriteAllText(Path.Combine(directory, ManifestFileName), JsonConvert.SerializeObject(manifest, Formatting.Indented));
    }

    private void CleanupExpiredArtifactsSafe()
    {
        try
        {
            CleanupExpiredArtifacts();
        }
        catch (Exception ex)
        {
            SimpleLogger.Error("打印调试附件清理失败", ex);
        }
    }

    private void CleanupExpiredArtifacts()
    {
        if (!Directory.Exists(_artifactRoot)) return;

        var artifactDirectories = Directory.GetFiles(_artifactRoot, ManifestFileName, SearchOption.AllDirectories)
            .Select(Path.GetDirectoryName)
            .Where(d => !string.IsNullOrEmpty(d))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(Directory.GetCreationTimeUtc)
            .ToList();

        foreach (var directory in artifactDirectories.Skip(_retentionCount))
        {
            try
            {
                if (CanDeleteArtifactDirectory(directory))
                    Directory.Delete(directory, recursive: true);
            }
            catch
            {
            }
        }

        foreach (var dayDirectory in Directory.GetDirectories(_artifactRoot))
        {
            try
            {
                if (!Directory.EnumerateFileSystemEntries(dayDirectory).Any())
                    Directory.Delete(dayDirectory);
            }
            catch
            {
            }
        }
    }

    private static bool CanDeleteArtifactDirectory(string directory)
    {
        if (File.Exists(Path.Combine(directory, CompletionResultFileName)))
            return true;

        if (!File.Exists(Path.Combine(directory, SubmitResultFileName)))
            return false;

        return Directory.GetCreationTimeUtc(directory) < DateTime.UtcNow.Subtract(TerminalSubmitGracePeriod);
    }

    public void Dispose()
    {
        _cleanupTimer?.Dispose();
    }
}