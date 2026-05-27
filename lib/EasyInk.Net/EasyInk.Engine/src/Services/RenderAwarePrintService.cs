using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;

namespace EasyInk.Engine.Services;

/// <summary>
/// 在进入物理打印链路前将 Render 输入转换为 PDF。
/// </summary>
public sealed class RenderAwarePrintService : IPrintService
{
    private readonly IPrintService _inner;
    private readonly IRenderPdfService _renderPdfService;

    public RenderAwarePrintService(IPrintService inner, IRenderPdfService renderPdfService)
    {
        _inner = inner;
        _renderPdfService = renderPdfService;
    }

    /// <summary>
    /// 获取内部装饰的打印服务（供测试/诊断使用）
    /// </summary>
    internal IPrintService GetInnerService() => _inner;

    public PrinterResult Print(string requestId, PrintRequestParams request, CancellationToken cancellationToken = default)
    {
        if (!request.HasRenderInput())
            return _inner.Print(requestId, request, cancellationToken);

        if (request.HasPdfInput())
            return PrinterResult.Error(requestId, ErrorCode.InvalidParams, "不能同时提供 PDF 输入和 renderSource");

        var rendered = _renderPdfService.RenderPrintPdf(requestId, request, cancellationToken);
        if (!rendered.Success || rendered.PdfBytes == null || rendered.PdfBytes.Length == 0)
        {
            return PrinterResult.Error(
                requestId,
                string.IsNullOrWhiteSpace(rendered.ErrorCode) ? ErrorCode.RenderFailed : rendered.ErrorCode!,
                string.IsNullOrWhiteSpace(rendered.ErrorMessage) ? "Render 渲染失败" : rendered.ErrorMessage!,
                rendered.ErrorDetails);
        }

        request.PdfBase64 = null;
        request.PdfUrl = null;
        request.PdfBytes = rendered.PdfBytes;
        return _inner.Print(requestId, request, cancellationToken);
    }
}