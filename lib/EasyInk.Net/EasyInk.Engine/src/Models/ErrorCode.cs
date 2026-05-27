namespace EasyInk.Engine.Models;

/// <summary>
/// 错误码常量
/// </summary>
public static class ErrorCode
{
    /// <summary>参数校验失败</summary>
    public const string InvalidParams = "INVALID_PARAMS";
    /// <summary>JSON 解析失败</summary>
    public const string InvalidJson = "INVALID_JSON";

    /// <summary>未知命令</summary>
    public const string UnknownCommand = "UNKNOWN_COMMAND";

    /// <summary>任务不存在</summary>
    public const string JobNotFound = "JOB_NOT_FOUND";
    /// <summary>队列已满</summary>
    public const string QueueFull = "QUEUE_FULL";

    /// <summary>打印失败</summary>
    public const string PrintFailed = "PRINT_FAILED";
    /// <summary>打印超时</summary>
    public const string PrintTimeout = "PRINT_TIMEOUT";
    /// <summary>Render 渲染失败</summary>
    public const string RenderFailed = "RENDER_FAILED";
    /// <summary>打印测试失败</summary>
    public const string PrintTestFailed = "PRINT_TEST_FAILED";
    /// <summary>PDF 来源无效</summary>
    public const string InvalidPdfSource = "INVALID_PDF_SOURCE";

    /// <summary>PDF 切片过大</summary>
    public const string ChunkTooLarge = "CHUNK_TOO_LARGE";
    /// <summary>PDF 文件过大</summary>
    public const string PdfTooLarge = "PDF_TOO_LARGE";
    /// <summary>切片无效</summary>
    public const string InvalidChunk = "INVALID_CHUNK";
    /// <summary>上传不存在或已过期</summary>
    public const string UploadNotFound = "UPLOAD_NOT_FOUND";
    /// <summary>上传未完成</summary>
    public const string UploadIncomplete = "UPLOAD_INCOMPLETE";
    /// <summary>消息过大</summary>
    public const string MessageTooLarge = "MESSAGE_TOO_LARGE";
    /// <summary>消息格式无效</summary>
    public const string InvalidMessage = "INVALID_MESSAGE";

    /// <summary>内部错误</summary>
    public const string InternalError = "INTERNAL_ERROR";
    /// <summary>未授权</summary>
    public const string Unauthorized = "UNAUTHORIZED";
    /// <summary>路由不存在</summary>
    public const string NotFound = "NOT_FOUND";
}
