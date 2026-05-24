using System;
using EasyInk.Engine.Services.Abstractions;
using EasyInk.Engine.Services.Providers;

namespace EasyInk.Engine.Models;

/// <summary>
/// 打印请求参数
/// </summary>
public class PrintRequestParams
{
    /// <summary>
    /// 打印机名称
    /// </summary>
    public string PrinterName { get; set; } = default!;

    /// <summary>
    /// PDF文件的Base64编码
    /// </summary>
    public string? PdfBase64 { get; set; }

    /// <summary>
    /// PDF文件的URL地址
    /// </summary>
    public string? PdfUrl { get; set; }

    /// <summary>
    /// PDF文件的二进制数据
    /// </summary>
    public byte[]? PdfBytes { get; set; }

    /// <summary>
    /// Render 输入来源。用于 HTML 或 EasyInk schema + data 打印。
    /// </summary>
    public RenderSourceParams? RenderSource { get; set; }

    /// <summary>
    /// Render 渲染选项。
    /// </summary>
    public RenderOptionsParams? RenderOptions { get; set; }

    /// <summary>
    /// 打印份数
    /// </summary>
    public int Copies { get; set; } = 1;

    /// <summary>
    /// 纸张尺寸
    /// </summary>
    public PaperSizeParams? PaperSize { get; set; }

    /// <summary>
    /// 是否强制把 PaperSize 传给底层打印引擎。默认由打印机驱动使用当前介质。
    /// </summary>
    public bool ForcePaperSize { get; set; }

    /// <summary>
    /// DPI（每英寸点数）
    /// </summary>
    public int Dpi { get; set; } = 600;

    /// <summary>
    /// 打印偏移
    /// </summary>
    public OffsetParams? Offset { get; set; }

    /// <summary>
    /// 用户数据（用于审计日志）
    /// </summary>
    public UserDataParams? UserData { get; set; }

    /// <summary>
    /// 是否横向打印
    /// </summary>
    public bool Landscape { get; set; }

    public bool HasPdfInput()
    {
        return !string.IsNullOrEmpty(PdfBase64) ||
            !string.IsNullOrEmpty(PdfUrl) ||
            (PdfBytes != null && PdfBytes.Length > 0);
    }

    public bool HasRenderInput()
    {
        return RenderSource != null && !string.IsNullOrWhiteSpace(RenderSource.Type);
    }

    /// <summary>
    /// 根据输入创建对应的 PdfProvider
    /// </summary>
    public IPdfProvider CreatePdfProvider()
    {
        if (!string.IsNullOrEmpty(PdfBase64))
            return new Base64PdfProvider(PdfBase64!);
        if (!string.IsNullOrEmpty(PdfUrl))
            return new UrlPdfProvider(PdfUrl!);
        if (PdfBytes != null && PdfBytes.Length > 0)
            return new BlobPdfProvider(PdfBytes);

        throw new ArgumentException("必须提供 PdfBase64、PdfUrl 或 PdfBytes 之一");
    }
}
