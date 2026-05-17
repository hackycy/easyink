using System.Drawing;

namespace EasyInk.Printer.UI.Controls;

internal static class UiTheme
{
    public static readonly Color PageBackColor = Color.FromArgb(242, 246, 250);
    public static readonly Color SurfaceColor = Color.FromArgb(252, 254, 255);
    public static readonly Color SectionBackColor = Color.FromArgb(248, 251, 255);
    public static readonly Color BorderColor = Color.FromArgb(231, 236, 244);
    public static readonly Color TextColor = Color.FromArgb(30, 41, 59);
    public static readonly Color MutedTextColor = Color.FromArgb(100, 116, 139);
    public static readonly Color PrimaryColor = Color.FromArgb(33, 111, 219);
    public static readonly Color SuccessColor = Color.FromArgb(16, 139, 118);
    public static readonly Color WarningColor = Color.FromArgb(217, 119, 6);
    public static readonly Color ErrorColor = Color.FromArgb(220, 38, 38);
    public static readonly Color InfoColor = Color.FromArgb(79, 70, 229);

    public const int FormRowHeight = 34;

    public static Font RegularFont(float size = 9f)
    {
        return new Font("Microsoft YaHei UI", size, FontStyle.Regular);
    }

    public static Font BoldFont(float size = 9f)
    {
        return new Font("Microsoft YaHei UI", size, FontStyle.Bold);
    }
}
