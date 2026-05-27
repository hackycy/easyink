using System.Threading;
using EasyInk.Engine.Models;

namespace EasyInk.Engine.Services.Abstractions;

/// <summary>
/// 打印测试服务接口
/// </summary>
public interface IPrintTestService
{
    /// <summary>
    /// 连通性测试 - 仅检查打印机状态，不实际打印
    /// </summary>
    PrinterTestResult TestConnectivity(string printerName);

    /// <summary>
    /// 打印测试 - 打印测试页
    /// </summary>
    PrinterTestResult TestPrint(string requestId, string printerName, PrinterTestLevel level,
        TestPageMetadata? metadata = null, CancellationToken cancellationToken = default);
}
