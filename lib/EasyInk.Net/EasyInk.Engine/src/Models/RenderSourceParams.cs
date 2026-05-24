using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace EasyInk.Engine.Models;

/// <summary>
/// Render 输入来源。
/// </summary>
public sealed class RenderSourceParams
{
    public string Type { get; set; } = string.Empty;
    public string? Html { get; set; }
    public string? BaseUrl { get; set; }
    public string? PdfBase64 { get; set; }
    public string? FileName { get; set; }
    public JToken? Schema { get; set; }
    public JToken? Data { get; set; }
    public List<RenderResourceParams>? Resources { get; set; }
    public List<RenderFontResourceParams>? Fonts { get; set; }
}

public class RenderResourceParams
{
    public string Url { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string Base64 { get; set; } = string.Empty;
}

public sealed class RenderFontResourceParams : RenderResourceParams
{
    public string Family { get; set; } = string.Empty;
    public string? Weight { get; set; }
    public string? Style { get; set; }
}

public sealed class RenderOptionsParams
{
    public RenderPdfOptionsParams? Pdf { get; set; }
    public RenderWaitOptionsParams? Wait { get; set; }
    public RenderSecurityOptionsParams? Security { get; set; }
    public RenderDiagnosticsOptionsParams? Diagnostics { get; set; }
}

public sealed class RenderPdfOptionsParams
{
    public double? PaperWidthMm { get; set; }
    public double? PaperHeightMm { get; set; }
    public bool? PrintBackground { get; set; }
    public bool? Landscape { get; set; }
    public RenderMarginMmParams? MarginMm { get; set; }
}

public sealed class RenderMarginMmParams
{
    public double Top { get; set; }
    public double Right { get; set; }
    public double Bottom { get; set; }
    public double Left { get; set; }
}

public sealed class RenderWaitOptionsParams
{
    public string? Until { get; set; }
    public string? Selector { get; set; }
    public int? TimeoutMs { get; set; }
}

public sealed class RenderSecurityOptionsParams
{
    public bool? AllowFileAccess { get; set; }
    public List<string>? AllowedOrigins { get; set; }
    public long? MaxInputBytes { get; set; }
}

public sealed class RenderDiagnosticsOptionsParams
{
    public bool? IncludeHtmlSnapshot { get; set; }
    public bool? IncludeScreenshot { get; set; }
    public bool? IncludeRequestHeaders { get; set; }
}