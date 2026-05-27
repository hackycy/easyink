using System;

namespace EasyInk.Engine.Models;

/// <summary>
/// 打印测试结果
/// </summary>
public class PrinterTestResult
{
    /// <summary>打印机名称</summary>
    public string PrinterName { get; set; } = default!;

    /// <summary>测试级别</summary>
    public PrinterTestLevel Level { get; set; }

    /// <summary>是否成功</summary>
    public bool Success { get; set; }

    /// <summary>错误信息</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>实际使用的打印路径: GDI / Raw / SumatraPDF</summary>
    public string? ResolvedPrintPath { get; set; }

    /// <summary>打印机状态是否就绪</summary>
    public bool PrinterStatusReady { get; set; }

    /// <summary>打印机状态详情</summary>
    public string? PrinterStatusDetail { get; set; }

    /// <summary>匹配到的纸张规格</summary>
    public string? PaperSizeMatched { get; set; }

    /// <summary>测试时间</summary>
    public DateTime Timestamp { get; set; }

    public static PrinterTestResult Ok(string printerName, PrinterTestLevel level, string? printPath = null)
    {
        return new PrinterTestResult
        {
            PrinterName = printerName,
            Level = level,
            Success = true,
            ResolvedPrintPath = printPath,
            Timestamp = DateTime.UtcNow
        };
    }

    public static PrinterTestResult Fail(string printerName, PrinterTestLevel level, string errorMessage, string? printPath = null)
    {
        return new PrinterTestResult
        {
            PrinterName = printerName,
            Level = level,
            Success = false,
            ErrorMessage = errorMessage,
            ResolvedPrintPath = printPath,
            Timestamp = DateTime.UtcNow
        };
    }
}
