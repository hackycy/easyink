using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyInk.Printer.UI.Controls;
using EasyInk.Printer.UI.Presenters;

namespace EasyInk.Printer.UI.Views;

internal sealed class LogsView : UserControl, ILogsView, IActivatableTab
{
    private readonly LogsPresenter _presenter;
    private readonly Button _queryButton;
    private readonly ListView _listView;
    private readonly DateTimePicker _dtpFrom;
    private readonly DateTimePicker _dtpTo;
    private readonly Control _errorBanner;
    private readonly Label _errorLabel;

    public LogsView(LogsPresenter presenter)
    {
        _presenter = presenter;
        Title = LangManager.Get("Logs_Tab");
        Dock = DockStyle.Fill;
        BackColor = UiTheme.PageBackColor;

        var panel = UiFactory.CreatePagePanel(new Padding(16));

        var filterPanel = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Height = 58,
            BackColor = UiTheme.SectionBackColor,
            BorderColor = System.Drawing.Color.Transparent,
            Radius = 8,
            Padding = new Padding(14, 12, 14, 10),
            Margin = new Padding(0, 0, 0, 12)
        };

        var filterLayout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 5,
            RowCount = 1,
            Padding = new Padding(0),
            Margin = new Padding(0),
            BackColor = UiTheme.SectionBackColor
        };
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 154));
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 154));
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 82));
        filterLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        _dtpFrom = UiFactory.CreateInlineDatePicker(DateTime.Today.AddDays(-7));
        _dtpTo = UiFactory.CreateInlineDatePicker(DateTime.Now);
        _queryButton = UiFactory.CreateCommandButton(LangManager.Get("Common_Query"), 78);
        _queryButton.Anchor = AnchorStyles.Left;
        _queryButton.Margin = new Padding(0);
        _queryButton.Click += async (s, e) => await RefreshAsync();

        filterLayout.Controls.Add(UiFactory.CreateInlineLabel(LangManager.Get("Logs_From")), 0, 0);
        filterLayout.Controls.Add(_dtpFrom, 1, 0);
        filterLayout.Controls.Add(UiFactory.CreateInlineLabel(LangManager.Get("Logs_To")), 2, 0);
        filterLayout.Controls.Add(_dtpTo, 3, 0);
        filterLayout.Controls.Add(_queryButton, 4, 0);
        filterPanel.Controls.Add(filterLayout);

        var filterHost = new Panel
        {
            Dock = DockStyle.Top,
            Height = 72,
            Padding = new Padding(0, 0, 0, 14),
            BackColor = UiTheme.PageBackColor
        };
        filterPanel.Dock = DockStyle.Fill;
        filterHost.Controls.Add(filterPanel);

        _errorBanner = UiFactory.CreateErrorBanner(out _errorLabel);

        _listView = new ListView
        {
            Dock = DockStyle.Fill,
            View = System.Windows.Forms.View.Details,
            FullRowSelect = true,
            GridLines = false
        };
        UiFactory.StyleListView(_listView);
        UiFactory.EnableListCopy(_listView);
        _listView.Columns.Add(LangManager.Get("Logs_ColTime"), 150);
        _listView.Columns.Add(LangManager.Get("Logs_ColPrinter"), 150);
        _listView.Columns.Add(LangManager.Get("Logs_ColStatus"), 80);
        _listView.Columns.Add(LangManager.Get("Logs_ColUser"), 100);
        _listView.Columns.Add(LangManager.Get("Logs_ColLabelType"), 120);
        _listView.Columns.Add(LangManager.Get("Logs_ColJobId"), 200);
        _listView.Columns.Add(LangManager.Get("Logs_ColError"), 200);

        panel.Controls.Add(_listView);
        panel.Controls.Add(_errorBanner);
        panel.Controls.Add(filterHost);
        Controls.Add(panel);

        _presenter.Attach(this);
    }

    public string Title { get; }
    public Control View => this;

    public Task ActivateAsync()
    {
        return _presenter.RefreshDefaultAsync();
    }

    public void RunOnUiThread(Action action)
    {
        if (IsDisposed || Disposing) return;

        try
        {
            if (InvokeRequired && IsHandleCreated)
                BeginInvoke(action);
            else
                action();
        }
        catch (ObjectDisposedException)
        {
        }
        catch (InvalidOperationException)
        {
        }
    }

    public void SetBusy(bool busy)
    {
        _queryButton.Enabled = !busy;
    }

    public void SetError(string? message)
    {
        UiFactory.SetErrorBanner(_errorBanner, _errorLabel, message);
    }

    public void SetRows(IReadOnlyList<ListViewRow> rows)
    {
        _listView.BeginUpdate();
        try
        {
            _listView.Items.Clear();
            foreach (var row in rows)
            {
                if (row.Values.Count == 0) continue;

                var item = new ListViewItem(row.Values[0]);
                for (var i = 1; i < row.Values.Count; i++)
                    item.SubItems.Add(row.Values[i]);
                _listView.Items.Add(item);
            }
        }
        finally
        {
            _listView.EndUpdate();
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            _presenter.Dispose();

        base.Dispose(disposing);
    }

    private Task RefreshAsync()
    {
        return _presenter.RefreshAsync(_dtpFrom.Value, _dtpTo.Value);
    }
}
