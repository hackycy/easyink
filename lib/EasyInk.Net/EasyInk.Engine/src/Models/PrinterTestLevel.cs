namespace EasyInk.Engine.Models;

/// <summary>
/// 打印测试级别
/// </summary>
public enum PrinterTestLevel
{
    /// <summary>连通性测试 - 仅检查打印机状态，不实际打印</summary>
    Connectivity,
    /// <summary>快速测试 - 打印最小化测试页</summary>
    Quick,
    /// <summary>完整测试 - 打印包含诊断信息的测试页</summary>
    Full
}
