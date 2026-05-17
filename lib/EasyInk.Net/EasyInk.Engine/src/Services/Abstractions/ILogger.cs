using System;

namespace EasyInk.Engine.Services.Abstractions;

/// <summary>
/// 日志接口
/// </summary>
public interface ILogger
{
    /// <summary>
    /// 记录指定级别的日志
    /// </summary>
    void Log(LogLevel level, string message, string? jobId = null);
}

internal sealed class NullLogger : ILogger
{
    public void Log(LogLevel level, string message, string? jobId = null) { }
}
