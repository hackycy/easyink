using System.Threading;
using EasyInk.Engine.Models;

namespace EasyInk.Engine.Services.Abstractions;

/// <summary>
/// 将非 PDF 打印输入归一化为 PDF。
/// </summary>
public interface IRenderPdfService
{
    RenderPdfResult RenderPrintPdf(string requestId, PrintRequestParams request, CancellationToken cancellationToken = default);
}