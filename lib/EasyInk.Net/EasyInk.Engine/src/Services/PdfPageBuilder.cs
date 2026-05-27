using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace EasyInk.Engine.Services;

/// <summary>
/// 极简多页 PDF 构建器，专为测试页等纯排版场景设计。
///
/// 坐标约定：
///   - 内部 <c>_y</c> 表示「下一条内容顶部」(top-down 思维，但实际 PDF 坐标系是 bottom-up)。
///   - 调用方按文档流（从上到下）依次调用 <see cref="Text"/>、<see cref="Section"/>、<see cref="Hr"/> 等方法，
///     不需要手动维护 y。
///   - 当剩余空间不足时自动新增一页 (<see cref="EnsureSpace"/>)。
///
/// 字体资源：
///   - <c>/F1</c> Helvetica（默认）
///   - <c>/F2</c> Courier（等宽）
/// </summary>
internal sealed class PdfPageBuilder
{
    // 字体度量约定（覆盖 Helvetica/Courier 常见情况）:
    //   ascender (cap-top → baseline)  ≈ 0.80 × size
    //   descender (baseline → 字底)     ≈ 0.20 × size
    // 因此一行实际占用约 1.0 × size，再额外留 0.35 × size 作为行距，
    // 这样上一行的 descender 与下一行/分割线之间有 ~0.15 × size 的清晰空隙。
    private const float LineLeadingRatio = 1.35f;
    private const float HrTopPad = 2f;
    private const float HrBottomPad = 4f;
    private const float DefaultBlockGap = 4f;

    private static readonly Encoding WinAnsi = Encoding.GetEncoding(1252);

    private readonly float _pageW;
    private readonly float _pageH;
    private readonly float _margin;
    private readonly float _bottomMargin;
    private readonly List<StringBuilder> _pages = new();
    private StringBuilder _stream = null!;
    private float _y;

    public PdfPageBuilder(float pageW = 595.28f, float pageH = 841.89f, float margin = 30f, float bottomMargin = 30f)
    {
        _pageW = pageW;
        _pageH = pageH;
        _margin = margin;
        _bottomMargin = bottomMargin;
        StartNewPage();
    }

    public float Left => _margin;
    public float Right => _pageW - _margin;
    public float ContentWidth => _pageW - 2 * _margin;
    public float CurrentY => _y;
    public int PageCount => _pages.Count;

    // ===== Layout primitives =====

    /// <summary>渲染一行文本；行高按 <see cref="LineLeadingRatio"/> × size 推进光标，确保 descender 不会与下一条内容重叠。</summary>
    public void Text(string text, float size = 8f, float indent = 0f, string font = "/F1")
    {
        float rowH = size * LineLeadingRatio;
        EnsureSpace(rowH);
        // 把字符顶部对齐到当前 _y：baseline = _y - ascender ≈ _y - 0.8 × size。
        float baseline = _y - size * 0.8f;
        var escaped = EscapePdfString(text);
        _stream.AppendLine($"BT {font} {F(size)} Tf {F(_margin + indent)} {F(baseline)} Td ({escaped}) Tj ET");
        _y -= rowH;
    }

    /// <summary>渲染 "Label: Value" 风格的键值对（缺值时跳过）。</summary>
    public void KeyValue(string label, string? value, float size = 8f, float indent = 6f)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        Text($"{label}: {value}", size, indent);
    }

    /// <summary>章节标题 + 细分割线（标题与分割线之间预留 descender 空间，避免重叠）。</summary>
    public void Section(string title, float size = 10f)
    {
        Spacer(6f);
        EnsureSpace(size * LineLeadingRatio + HrTopPad + 0.3f + HrBottomPad);
        Text(title, size);
        Hr(0.3f);
    }

    /// <summary>整页宽水平线（线宽 thickness），上下各留 <see cref="HrTopPad"/>/<see cref="HrBottomPad"/> 间距。</summary>
    public void Hr(float thickness = 0.5f)
    {
        float total = HrTopPad + thickness + HrBottomPad;
        EnsureSpace(total);
        float centerY = _y - HrTopPad - thickness / 2f;
        _stream.AppendLine($"{F(thickness)} w {F(Left)} {F(centerY)} m {F(Right)} {F(centerY)} l S");
        _y -= total;
    }

    /// <summary>垂直空白。</summary>
    public void Spacer(float h)
    {
        EnsureSpace(h);
        _y -= h;
    }

    // ===== Internal layout helpers =====

    private void EnsureSpace(float h)
    {
        if (_y - h < _bottomMargin)
            StartNewPage();
    }

    private void StartNewPage()
    {
        _stream = new StringBuilder();
        _pages.Add(_stream);
        _y = _pageH - _margin;
    }

    // ===== PDF document assembly =====

    /// <summary>组装多页 PDF 文档并返回字节序列。</summary>
    public byte[] Build()
    {
        // 对象编号布局:
        //   1 Catalog
        //   2 Pages
        //   3 Helvetica (/F1)
        //   4 Courier (/F2)
        //   5,6 Page+Stream（第1页）, 7,8 ...（第2页）...
        int pageCount = _pages.Count;
        var objects = new List<byte[]>();

        // Object 1: Catalog
        objects.Add(WinAnsi.GetBytes("<< /Type /Catalog /Pages 2 0 R >>"));

        // Object 2: Pages (Kids list filled after we know page-object numbers)
        var kidIds = new List<int>();
        for (int i = 0; i < pageCount; i++)
            kidIds.Add(5 + i * 2);
        var kidsStr = string.Join(" ", kidIds.ConvertAll(id => $"{id} 0 R"));
        objects.Add(WinAnsi.GetBytes($"<< /Type /Pages /Kids [{kidsStr}] /Count {pageCount} >>"));

        // Object 3: /F1 Helvetica
        objects.Add(WinAnsi.GetBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
        // Object 4: /F2 Courier
        objects.Add(WinAnsi.GetBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"));

        // Per-page: Page object + Content stream object
        for (int i = 0; i < pageCount; i++)
        {
            int pageObjId = 5 + i * 2;
            int contentObjId = pageObjId + 1;
            objects.Add(WinAnsi.GetBytes(
                $"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {F(_pageW)} {F(_pageH)}] " +
                $"/Contents {contentObjId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>"));

            var content = WinAnsi.GetBytes(_pages[i].ToString());
            var header = WinAnsi.GetBytes($"<< /Length {content.Length} >>\nstream\n");
            var footer = WinAnsi.GetBytes("\nendstream");
            var streamObj = new byte[header.Length + content.Length + footer.Length];
            Buffer.BlockCopy(header, 0, streamObj, 0, header.Length);
            Buffer.BlockCopy(content, 0, streamObj, header.Length, content.Length);
            Buffer.BlockCopy(footer, 0, streamObj, header.Length + content.Length, footer.Length);
            objects.Add(streamObj);
        }

        // Serialize
        var output = new List<byte>(4096);
        var offsets = new List<int>();
        AppendAscii(output, "%PDF-1.4\n");

        for (int i = 0; i < objects.Count; i++)
        {
            offsets.Add(output.Count);
            AppendAscii(output, $"{i + 1} 0 obj\n");
            output.AddRange(objects[i]);
            AppendAscii(output, "\nendobj\n");
        }

        int xrefOffset = output.Count;
        var xref = new StringBuilder();
        xref.Append($"xref\n0 {objects.Count + 1}\n");
        xref.Append("0000000000 65535 f \n");
        foreach (var off in offsets)
            xref.Append($"{off:D10} 00000 n \n");
        xref.Append($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xrefOffset}\n%%EOF");
        AppendAscii(output, xref.ToString());

        return output.ToArray();
    }

    private static void AppendAscii(List<byte> buffer, string s)
    {
        buffer.AddRange(WinAnsi.GetBytes(s));
    }

    private static string EscapePdfString(string text)
    {
        var result = new StringBuilder(text.Length);
        foreach (var ch in text)
        {
            if (ch > 255) { result.Append('?'); continue; }
            switch (ch)
            {
                case '\\': result.Append("\\\\"); break;
                case '(': result.Append("\\("); break;
                case ')': result.Append("\\)"); break;
                default: result.Append(ch); break;
            }
        }
        return result.ToString();
    }

    private static string F(float v) => v.ToString("F2", CultureInfo.InvariantCulture);
}
