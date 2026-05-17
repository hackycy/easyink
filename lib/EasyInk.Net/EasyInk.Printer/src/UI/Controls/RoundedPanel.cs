using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace EasyInk.Printer.UI.Controls;

public class RoundedPanel : Panel
{
    public int Radius { get; set; } = 8;
    public Color BorderColor { get; set; } = Color.Transparent;

    protected override void OnResize(EventArgs eventargs)
    {
        base.OnResize(eventargs);
        UpdateRegion();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        using var path = RoundedPath.Create(new Rectangle(0, 0, Width - 1, Height - 1), Radius);
        using var pen = new Pen(BorderColor);
        if (BorderColor.A > 0)
            e.Graphics.DrawPath(pen, path);
    }

    private void UpdateRegion()
    {
        if (Width <= 0 || Height <= 0) return;

        using var path = RoundedPath.Create(new Rectangle(0, 0, Width, Height), Radius);
        Region = new Region(path);
        Invalidate();
    }
}
