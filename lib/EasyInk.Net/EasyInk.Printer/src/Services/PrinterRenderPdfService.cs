using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;

namespace EasyInk.Printer.Services;

internal sealed class PrinterRenderPdfService : IRenderPdfService
{
    private readonly RenderRuntimeManager _runtimeManager;
    private readonly RenderClient _client;
    private readonly PrintDebugLogService _debugLogService;

    public PrinterRenderPdfService(RenderRuntimeManager runtimeManager, RenderClient client, PrintDebugLogService debugLogService)
    {
        _runtimeManager = runtimeManager;
        _client = client;
        _debugLogService = debugLogService;
    }

    public RenderPdfResult RenderPrintPdf(string requestId, PrintRequestParams request, CancellationToken cancellationToken = default)
    {
        try
        {
            var runtime = _runtimeManager.ResolveOptions(cancellationToken);
            var response = _client.RenderPrintPdf(runtime, requestId, request, cancellationToken);
            _debugLogService.WriteRenderArtifacts(
                requestId,
                response.RequestJson,
                response.ExitCode,
                response.DiagnosticsId,
                response.DurationMs,
                response.PdfBytes,
                response.ErrorJson);
            return response.Result;
        }
        catch (OperationCanceledException)
        {
            return RenderPdfResult.Error(ErrorCode.PrintTimeout, "Render 请求已取消");
        }
        catch (Exception ex) when (ex is InvalidOperationException || ex is IOException || ex is InvalidDataException || ex is TimeoutException || ex is UnauthorizedAccessException || ex is HttpRequestException || ex is UriFormatException || ex is System.ComponentModel.Win32Exception)
        {
            return RenderPdfResult.Error(ErrorCode.RenderFailed, ex.Message, ex.ToString());
        }
    }
}