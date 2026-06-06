using System.Drawing;
using System.Windows.Forms;

namespace EasyInk.Printer.UI.Controls;

public class SettingsSectionPanel : RoundedPanel
{
    public const int DefaultHeaderHeight = 36;
    public int HeaderHeight => DefaultHeaderHeight;
    public TableLayoutPanel ContentPanel { get; }

    public SettingsSectionPanel(string title)
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = UiTheme.SectionBackColor;
        BorderColor = Color.Transparent;
        Radius = 8;
        Padding = new Padding(0);

        ContentPanel = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top,
            ColumnCount = 1,
            Padding = new Padding(14, 0, 14, 14),
            Margin = new Padding(0),
            BackColor = UiTheme.SectionBackColor
        };
        ContentPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var titleLabel = new Label
        {
            Text = title,
            Dock = DockStyle.Top,
            Height = HeaderHeight,
            Font = UiTheme.BoldFont(9.5f),
            ForeColor = UiTheme.TextColor,
            BackColor = UiTheme.SectionBackColor,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(16, 2, 16, 0)
        };

        // Add content first so the docked header settles above it.
        Controls.Add(ContentPanel);
        Controls.Add(titleLabel);
    }
}
