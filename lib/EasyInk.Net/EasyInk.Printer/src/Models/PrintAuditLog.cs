using System;

namespace EasyInk.Printer.Models;

/// <summary>
/// 打印审计日志
/// </summary>
public class PrintAuditLog
{
    /// <summary>
    /// 主键ID
    /// </summary>
    public long Id { get; set; }

    /// <summary>
    /// 打印时间
    /// </summary>
    public DateTime Timestamp { get; set; }

    /// <summary>
    /// 打印机名称
    /// </summary>
    public string PrinterName { get; set; } = default!;

    /// <summary>
    /// 纸张宽度
    /// </summary>
    public double? PaperWidth { get; set; }

    /// <summary>
    /// 纸张高度
    /// </summary>
    public double? PaperHeight { get; set; }

    /// <summary>
    /// 纸张尺寸单位
    /// </summary>
    public string PaperUnit { get; set; } = default!;

    /// <summary>
    /// 打印份数
    /// </summary>
    public int Copies { get; set; } = 1;

    /// <summary>
    /// DPI
    /// </summary>
    public int? Dpi { get; set; }

    /// <summary>
    /// 用户ID
    /// </summary>
    public string? UserId { get; set; }

    /// <summary>
    /// 文档类型
    /// </summary>
    public string? DocumentType { get; set; }

    /// <summary>
    /// 打印状态
    /// </summary>
    public string Status { get; set; } = default!;

    /// <summary>
    /// 错误信息
    /// </summary>
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// 任务ID
    /// </summary>
    public string? JobId { get; set; }

    /// <summary>
    /// 记录创建时间
    /// </summary>
    public DateTime CreatedAt { get; set; }
}
