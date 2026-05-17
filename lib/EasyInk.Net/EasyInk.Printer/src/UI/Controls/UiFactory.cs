using System;
using System.Collections.Generic;
using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace EasyInk.Printer.UI.Controls;

internal static class UiFactory
{
    public static Panel CreatePagePanel(Padding padding)
    {
        return new Panel
        {
            Dock = DockStyle.Fill,
            Padding = padding,
            BackColor = UiTheme.PageBackColor
        };
    }

    public static FlowLayoutPanel CreateToolPanel(int height)
    {
        return new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = height,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 0, 0, 12),
            BackColor = UiTheme.PageBackColor
        };
    }

    public static Button CreateCommandButton(string text, int width)
    {
        return CreateRoundedButton(text, width, UiTheme.PrimaryColor, Color.White, Color.FromArgb(25, 99, 203), Color.FromArgb(29, 78, 216));
    }

    public static Button CreateSecondaryButton(string text, int width)
    {
        return CreateRoundedButton(text, width, Color.FromArgb(229, 238, 252), Color.FromArgb(30, 64, 117), Color.FromArgb(217, 229, 248), Color.FromArgb(205, 221, 245));
    }

    public static Label CreateInlineLabel(string text)
    {
        return new Label
        {
            Text = text,
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            ForeColor = UiTheme.MutedTextColor,
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(0, 0, 6, 0)
        };
    }

    public static DateTimePicker CreateInlineDatePicker(DateTime value)
    {
        return new DateTimePicker
        {
            Width = 140,
            Height = 28,
            Format = DateTimePickerFormat.Short,
            Value = value,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(0, 0, 14, 0)
        };
    }

    public static RoundedPanel CreateErrorBanner(out Label label)
    {
        var panel = new RoundedPanel
        {
            Dock = DockStyle.Top,
            Height = 0,
            Visible = false,
            BackColor = Color.FromArgb(255, 247, 237),
            BorderColor = Color.FromArgb(253, 186, 116),
            Radius = 8,
            Padding = new Padding(14, 8, 14, 8),
            Margin = new Padding(0, 0, 0, 8)
        };

        label = new Label
        {
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(154, 52, 18),
            Font = UiTheme.RegularFont()
        };
        panel.Controls.Add(label);
        return panel;
    }

    public static void SetErrorBanner(Control banner, Label label, string? message)
    {
        var hasMessage = !string.IsNullOrWhiteSpace(message);
        label.Text = message ?? string.Empty;
        banner.Height = hasMessage ? 40 : 0;
        banner.Visible = hasMessage;
    }

    public static void StyleListView(ListView listView)
    {
        listView.BorderStyle = BorderStyle.None;
        listView.BackColor = UiTheme.SurfaceColor;
        listView.ForeColor = UiTheme.TextColor;
        listView.HideSelection = false;
        listView.MultiSelect = true;
        listView.Font = UiTheme.RegularFont();
        listView.SmallImageList = new ImageList { ImageSize = new Size(1, 28) };
    }

    public static void EnableListCopy(ListView listView)
    {
        listView.KeyDown += (s, e) =>
        {
            if (e.Control && e.KeyCode == Keys.C)
            {
                CopySelectedListRows(listView);
                e.Handled = true;
            }
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add(LangManager.Get("Common_Copy"), null, (s, e) => CopySelectedListRows(listView));
        listView.ContextMenuStrip = menu;
    }

    public static SettingsSectionPanel CreateSettingsSection(string title)
    {
        return new SettingsSectionPanel(title)
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top,
            Margin = new Padding(0)
        };
    }

    public static TableLayoutPanel CreateSettingsLayoutPanel()
    {
        var layout = new TableLayoutPanel
        {
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 1,
            RowCount = 0,
            Padding = new Padding(0),
            Margin = new Padding(0),
            BackColor = UiTheme.PageBackColor
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        return layout;
    }

    public static void UpdateSettingsLayoutWidth(Panel panel, Control layout)
    {
        var verticalScrollWidth = panel.VerticalScroll.Visible ? SystemInformation.VerticalScrollBarWidth : 0;
        layout.Location = new Point(panel.Padding.Left, panel.Padding.Top);
        layout.Width = Math.Max(320, panel.ClientSize.Width - panel.Padding.Horizontal - verticalScrollWidth);
    }

    public static TableLayoutPanel CreateSettingsTable(params ColumnStyle[] columnStyles)
    {
        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = columnStyles.Length,
            RowCount = 0,
            Padding = new Padding(4, 0, 4, 4),
            Margin = new Padding(0),
            BackColor = UiTheme.SectionBackColor
        };

        foreach (var columnStyle in columnStyles)
            table.ColumnStyles.Add(columnStyle);

        table.SizeChanged += (s, e) => UpdateSettingsTableWrapping(table);
        return table;
    }

    public static void AddSettingsBlock(TableLayoutPanel layout, Control content, int bottomSpacing = 12)
    {
        var row = layout.RowCount;
        layout.RowCount++;
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        content.Dock = DockStyle.Fill;
        content.Margin = new Padding(0, 0, 0, bottomSpacing);
        layout.Controls.Add(content, 0, row);
    }

    public static void AddSettingRow(TableLayoutPanel table, string labelText, Control content)
    {
        var row = AddSettingsTableRow(table);
        PrepareSettingContent(content);
        table.Controls.Add(CreateSettingLabel(labelText), 0, row);
        table.Controls.Add(content, 1, row);
    }

    public static void AddSettingRow(TableLayoutPanel table, string labelText, Control content, Control trailingContent)
    {
        var row = AddSettingsTableRow(table);
        PrepareSettingContent(content);
        PrepareSettingTrailingContent(trailingContent);
        table.Controls.Add(CreateSettingLabel(labelText), 0, row);
        table.Controls.Add(content, 1, row);
        table.Controls.Add(trailingContent, 2, row);
    }

    public static void AddSettingControlRow(TableLayoutPanel table, Control firstContent, Control secondContent)
    {
        var row = AddSettingsTableRow(table);
        PrepareSettingContent(firstContent);
        PrepareSettingTrailingContent(secondContent);
        table.Controls.Add(firstContent, 0, row);
        table.Controls.Add(secondContent, 1, row);
    }

    public static void AddSettingWideRow(TableLayoutPanel table, Control content)
    {
        var row = AddSettingsTableRow(table);
        PrepareSettingContent(content);
        table.Controls.Add(content, 0, row);
        table.SetColumnSpan(content, table.ColumnCount);
    }

    public static void AddSettingDescriptionRow(TableLayoutPanel table, string text)
    {
        var description = new Label
        {
            Text = text,
            AutoSize = true,
            Dock = DockStyle.Top,
            ForeColor = UiTheme.MutedTextColor,
            Margin = new Padding(0, 0, 0, 8),
            Tag = "SettingsDescription"
        };
        AddSettingWideRow(table, description);
        UpdateSettingsTableWrapping(table);
    }

    public static void StyleSettingsSection(Control root)
    {
        foreach (Control child in root.Controls)
            StyleSettingsSection(child);

        if (root is SettingsSectionPanel)
            return;

        if (root is TableLayoutPanel table)
        {
            table.BackColor = UiTheme.SectionBackColor;
            table.Margin = new Padding(0);
            return;
        }

        if (root is FlowLayoutPanel flow)
        {
            flow.BackColor = UiTheme.SectionBackColor;
            return;
        }

        if (root is Label label)
        {
            label.ForeColor = Equals(label.Tag, "SettingsDescription") || label.ForeColor == SystemColors.GrayText
                ? UiTheme.MutedTextColor
                : UiTheme.TextColor;
            label.Font = new Font("Microsoft YaHei UI", 9f, label.Font.Style);
            return;
        }

        if (root is TextBox textBox)
        {
            textBox.BorderStyle = BorderStyle.FixedSingle;
            textBox.BackColor = Color.White;
            textBox.ForeColor = textBox.ForeColor == SystemColors.GrayText ? SystemColors.GrayText : UiTheme.TextColor;
            textBox.Margin = new Padding(0, 3, 0, 3);
            return;
        }

        if (root is ComboBox comboBox)
        {
            comboBox.Margin = new Padding(0, 3, 0, 3);
            return;
        }

        if (root is NumericUpDown numericUpDown)
        {
            numericUpDown.Margin = new Padding(0, 3, 0, 3);
            return;
        }

        if (root is CheckBox checkBox)
        {
            checkBox.ForeColor = UiTheme.TextColor;
            checkBox.Margin = new Padding(0, 3, 0, 3);
        }
    }

    public static void SetCardAccent(Panel card, Color color)
    {
        foreach (Control control in card.Controls)
        {
            if (Equals(control.Tag, "Accent"))
            {
                control.BackColor = color;
                return;
            }
        }
    }

    private static Button CreateRoundedButton(string text, int width, Color backColor, Color foreColor, Color hoverColor, Color downColor)
    {
        var button = new RoundedButton
        {
            Text = text,
            Height = 30,
            Width = width > 0 ? width : 120,
            Margin = new Padding(0, 0, 8, 0),
            FlatStyle = FlatStyle.Flat,
            BackColor = backColor,
            ForeColor = foreColor,
            TextAlign = ContentAlignment.MiddleCenter,
            UseVisualStyleBackColor = false,
            Radius = 8,
            HoverBackColor = hoverColor,
            DownBackColor = downColor
        };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = hoverColor;
        button.FlatAppearance.MouseDownBackColor = downColor;
        return button;
    }

    private static void CopySelectedListRows(ListView listView)
    {
        if (listView.SelectedItems.Count == 0) return;

        var rows = new List<ListViewItem>();
        foreach (ListViewItem item in listView.SelectedItems)
            rows.Add(item);
        rows.Sort((left, right) => left.Index.CompareTo(right.Index));

        var builder = new StringBuilder();
        foreach (var item in rows)
        {
            for (var i = 0; i < item.SubItems.Count; i++)
            {
                if (i > 0) builder.Append('\t');
                builder.Append(item.SubItems[i].Text);
            }
            builder.AppendLine();
        }

        try
        {
            Clipboard.SetText(builder.ToString().TrimEnd());
        }
        catch (System.Runtime.InteropServices.ExternalException)
        {
        }
    }

    private static int AddSettingsTableRow(TableLayoutPanel table)
    {
        var row = table.RowCount;
        table.RowCount++;
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        return row;
    }

    private static Label CreateSettingLabel(string text)
    {
        return new Label
        {
            Text = text,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            MinimumSize = new Size(0, UiTheme.FormRowHeight),
            Margin = new Padding(0, 3, 10, 3)
        };
    }

    private static void PrepareSettingContent(Control content)
    {
        content.Dock = DockStyle.None;
        content.Anchor = content is TextBox || content is TableLayoutPanel || content is Panel && content is not FlowLayoutPanel
            ? AnchorStyles.Left | AnchorStyles.Right
            : AnchorStyles.Left;

        if (content.Margin == Padding.Empty)
            content.Margin = new Padding(0, 3, 0, 3);
    }

    private static void PrepareSettingTrailingContent(Control content)
    {
        content.Dock = DockStyle.None;
        content.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        content.Margin = new Padding(4, 3, 0, 3);
    }

    private static void UpdateSettingsTableWrapping(TableLayoutPanel table)
    {
        var width = Math.Max(220, table.ClientSize.Width - table.Padding.Horizontal);
        foreach (Control control in table.Controls)
        {
            if (Equals(control.Tag, "SettingsDescription"))
                control.MaximumSize = new Size(width, 0);
        }
    }
}
