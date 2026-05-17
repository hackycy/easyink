using System.Drawing;
using System.Windows.Forms;

namespace EasyInk.Printer.UI.Controls;

public class SettingsSectionPanel : RoundedPanel
{
    public const int DefaultHeaderHeight = 36;
    public int HeaderHeight => DefaultHeaderHeight;
    public Panel ContentPanel { get; }

    public SettingsSectionPanel(string title)
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = UiTheme.SectionBackColor;
        BorderColor = Color.Transparent;
        Radius = 8;
        Padding = new Padding(0);

        var layout = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(0),
            Margin = new Padding(0),
            BackColor = UiTheme.SectionBackColor
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, HeaderHeight));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var titleLabel = new Label
        {
            Text = title,
            Dock = DockStyle.Fill,
            Font = UiTheme.BoldFont(9.5f),
            ForeColor = UiTheme.TextColor,
            BackColor = UiTheme.SectionBackColor,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(16, 2, 16, 0)
        };

        ContentPanel = new Panel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Fill,
            Padding = new Padding(14, 0, 14, 14),
            Margin = new Padding(0),
            BackColor = UiTheme.SectionBackColor
        };

        layout.Controls.Add(titleLabel, 0, 0);
        layout.Controls.Add(ContentPanel, 0, 1);
        Controls.Add(layout);
    }
}
