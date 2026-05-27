using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyInk.Printer.UI.Controls;
using EasyInk.Printer.UI.Presenters;

namespace EasyInk.Printer.UI.Views;

internal abstract class ListPageViewBase<TPresenter> : UserControl, IListPageView, IActivatableTab
    where TPresenter : ListPagePresenter
{
    private readonly TPresenter _presenter;
    private readonly Button _refreshButton;
    private readonly ListView _listView;
    private readonly Control _errorBanner;
    private readonly Label _errorLabel;
    private readonly FlowLayoutPanel _toolPanel;

    protected ListPageViewBase(TPresenter presenter, string title, IEnumerable<ListColumn> columns)
    {
        _presenter = presenter;
        Title = title;
        Dock = DockStyle.Fill;
        BackColor = UiTheme.PageBackColor;

        var panel = UiFactory.CreatePagePanel(new Padding(16));

        _listView = new ListView
        {
            Dock = DockStyle.Fill,
            View = System.Windows.Forms.View.Details,
            FullRowSelect = true,
            GridLines = false
        };
        UiFactory.StyleListView(_listView);
        UiFactory.EnableListCopy(_listView);
        foreach (var column in columns)
            _listView.Columns.Add(column.Header, column.Width);

        _toolPanel = UiFactory.CreateToolPanel(46);
        _refreshButton = UiFactory.CreateCommandButton(LangManager.Get("Common_Refresh"), 84);
        _refreshButton.Click += async (s, e) => await RefreshAsync();
        _toolPanel.Controls.Add(_refreshButton);

        _errorBanner = UiFactory.CreateErrorBanner(out _errorLabel);

        panel.Controls.Add(_listView);
        panel.Controls.Add(_errorBanner);
        panel.Controls.Add(_toolPanel);
        Controls.Add(panel);

        _presenter.Attach(this);
    }

    public string Title { get; }
    public Control View => this;
    protected FlowLayoutPanel ToolPanel => _toolPanel;

    public Task ActivateAsync()
    {
        return RefreshAsync();
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
        _refreshButton.Enabled = !busy;
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
        return _presenter.RefreshAsync();
    }
}
