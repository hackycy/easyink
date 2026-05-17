using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace EasyInk.Printer.UI.Controls;

public class RoundedPanel : Panel
{
    private Color _borderColor = Color.Transparent;
    private int _radius = 8;
    private int _regionRadius = -1;
    private Size _regionSize = Size.Empty;

    public RoundedPanel()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
    }

    public int Radius
    {
        get => _radius;
        set
        {
            var radius = Math.Max(0, value);
            if (_radius == radius) return;

            _radius = radius;
            _regionRadius = -1;
            UpdateRegion();
            Invalidate();
        }
    }

    public Color BorderColor
    {
        get => _borderColor;
        set
        {
            if (_borderColor == value) return;

            _borderColor = value;
            Invalidate();
        }
    }

    protected override void OnResize(EventArgs eventargs)
    {
        base.OnResize(eventargs);
        UpdateRegion();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (Width <= 0 || Height <= 0) return;

        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        using var path = RoundedPath.Create(new Rectangle(0, 0, Width - 1, Height - 1), Radius);
        using var pen = new Pen(BorderColor);
        if (BorderColor.A > 0)
            e.Graphics.DrawPath(pen, path);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            var region = Region;
            Region = null!;
            region?.Dispose();
        }

        base.Dispose(disposing);
    }

    private void UpdateRegion()
    {
        if (Width <= 0 || Height <= 0) return;
        if (_regionSize == ClientSize && _regionRadius == Radius) return;

        using var path = RoundedPath.Create(new Rectangle(0, 0, Width, Height), Radius);
        var oldRegion = Region;
        Region = new Region(path);
        oldRegion?.Dispose();
        _regionSize = ClientSize;
        _regionRadius = Radius;
        Invalidate();
    }
}
