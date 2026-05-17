using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace EasyInk.Printer.UI.Controls;

public class RoundedButton : Button
{
    private bool _hovered;
    private bool _pressed;

    public int Radius { get; set; } = 8;
    public Color HoverBackColor { get; set; }
    public Color DownBackColor { get; set; }

    protected override bool ShowFocusCues => false;

    protected override void OnMouseEnter(EventArgs e)
    {
        _hovered = true;
        base.OnMouseEnter(e);
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        _hovered = false;
        _pressed = false;
        base.OnMouseLeave(e);
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs mevent)
    {
        _pressed = true;
        base.OnMouseDown(mevent);
        Invalidate();
    }

    protected override void OnMouseUp(MouseEventArgs mevent)
    {
        _pressed = false;
        base.OnMouseUp(mevent);
        Invalidate();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        UpdateRegion();
    }

    protected override void OnPaint(PaintEventArgs pevent)
    {
        pevent.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var fillColor = _pressed ? DownBackColor : (_hovered ? HoverBackColor : BackColor);
        pevent.Graphics.Clear(Parent?.BackColor ?? BackColor);

        using var path = RoundedPath.Create(new Rectangle(0, 0, Width - 1, Height - 1), Radius);
        using var brush = new SolidBrush(fillColor);
        pevent.Graphics.FillPath(brush, path);

        TextRenderer.DrawText(
            pevent.Graphics,
            Text,
            Font,
            ClientRectangle,
            ForeColor,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis);
    }

    private void UpdateRegion()
    {
        if (Width <= 0 || Height <= 0) return;

        using var path = RoundedPath.Create(new Rectangle(0, 0, Width, Height), Radius);
        Region = new Region(path);
    }
}
