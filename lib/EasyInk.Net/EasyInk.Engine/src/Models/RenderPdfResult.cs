namespace EasyInk.Engine.Models;

/// <summary>
/// Render 服务输出的 PDF 结果。
/// </summary>
public sealed class RenderPdfResult
{
    public bool Success { get; private set; }
    public byte[]? PdfBytes { get; private set; }
    public string? ErrorCode { get; private set; }
    public string? ErrorMessage { get; private set; }
    public string? ErrorDetails { get; private set; }
    public string? DiagnosticsId { get; private set; }
    public int? PageCount { get; private set; }

    public static RenderPdfResult Ok(byte[] pdfBytes, string? diagnosticsId = null, int? pageCount = null)
    {
        return new RenderPdfResult
        {
            Success = true,
            PdfBytes = pdfBytes,
            DiagnosticsId = diagnosticsId,
            PageCount = pageCount
        };
    }

    public static RenderPdfResult Error(string code, string message, string? details = null, string? diagnosticsId = null)
    {
        return new RenderPdfResult
        {
            Success = false,
            ErrorCode = code,
            ErrorMessage = message,
            ErrorDetails = details,
            DiagnosticsId = diagnosticsId
        };
    }
}