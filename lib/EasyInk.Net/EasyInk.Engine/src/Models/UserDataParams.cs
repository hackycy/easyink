using Newtonsoft.Json;

namespace EasyInk.Engine.Models;

/// <summary>
/// 用户数据参数
/// </summary>
public class UserDataParams
{
    /// <summary>
    /// 用户ID
    /// </summary>
    public string? UserId { get; set; }

    /// <summary>
    /// 标签类型
    /// </summary>
    public string? LabelType { get; set; }

    /// <summary>
    /// 文档类型。兼容前端 SDK 使用的 documentType 字段，内部仍映射到审计日志的 LabelType。
    /// </summary>
    [JsonProperty("documentType")]
    public string? DocumentType
    {
        get => LabelType;
        set => LabelType = value;
    }

    public bool ShouldSerializeDocumentType()
    {
        return false;
    }
}
