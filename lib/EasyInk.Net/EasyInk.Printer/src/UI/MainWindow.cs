using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyInk.Printer.UI.Controls;
using EasyInk.Printer.UI.Views;

namespace EasyInk.Printer.UI;

internal class MainWindow : Form
{
    private const int WmSetRedraw = 0x000B;

    [DllImport("user32.dll")]
    private static extern int SendMessage(IntPtr hWnd, int msg, bool wParam, int lParam);

    private readonly IReadOnlyList<IActivatableTab> _pages;
    private readonly SettingsView _settingsView;
    private TabControl _tabs = null!;
    private bool _prewarmed;

    public event Action? OnRestart;

    public MainWindow(
        DashboardView dashboardView,
        PrintersView printersView,
        JobsView jobsView,
        LogsView logsView,
        SettingsView settingsView)
    {
        _settingsView = settingsView;
        _settingsView.RestartRequested += OnSettingsRestartRequested;
        _pages = new IActivatableTab[]
        {
            dashboardView,
            printersView,
            jobsView,
            logsView,
            settingsView
        };

        InitializeComponent();
    }

    private void InitializeComponent()
    {
        Text = LangManager.Get("Window_Title");
        Icon = TrayIcon.LoadAppIcon();
        Size = new Size(980, 700);
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(780, 560);
        Font = UiTheme.RegularFont();
        BackColor = UiTheme.PageBackColor;

        _tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Padding = new Point(16, 6),
            Font = UiTheme.RegularFont(),
            HotTrack = true
        };

        foreach (var page in _pages)
            _tabs.TabPages.Add(CreateTabPage(page));

        Controls.Add(_tabs);
        _tabs.SelectedIndexChanged += OnTabChanged;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _tabs.SelectedIndexChanged -= OnTabChanged;
            _settingsView.RestartRequested -= OnSettingsRestartRequested;
            foreach (var page in _pages)
                page.Dispose();
        }

        base.Dispose(disposing);
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);

        if (_pages.Count > 0)
            await ActivatePageAsync(_pages[0]);

        if (!_prewarmed)
        {
            _prewarmed = true;
            BeginInvoke(new Action(PrewarmTabLayouts));
        }
    }

    // Forces the first-time layout of every tab page off the user's click path.
    // WinForms only lays out the selected TabControl page, deferring the heavy
    // first layout/paint of other pages (notably the large Settings page) until
    // first selected. Cycling once at idle pays that cost up front. Redraw is
    // locked to avoid flicker and tab-change activation is suppressed so list
    // pages don't trigger their data loads here.
    private void PrewarmTabLayouts()
    {
        if (IsDisposed || !IsHandleCreated || _tabs.TabPages.Count == 0) return;

        var original = _tabs.SelectedIndex;
        _tabs.SelectedIndexChanged -= OnTabChanged;
        SendMessage(_tabs.Handle, WmSetRedraw, false, 0);
        try
        {
            for (var i = 0; i < _tabs.TabPages.Count; i++)
            {
                if (i == original) continue;

                _tabs.SelectedIndex = i;
                _tabs.TabPages[i].PerformLayout();
            }

            if (original >= 0)
                _tabs.SelectedIndex = original;
        }
        finally
        {
            SendMessage(_tabs.Handle, WmSetRedraw, true, 0);
            _tabs.SelectedIndexChanged += OnTabChanged;
            _tabs.Invalidate(true);
        }
    }

    private static TabPage CreateTabPage(IActivatableTab page)
    {
        var tabPage = new TabPage(page.Title);
        page.View.Dock = DockStyle.Fill;
        tabPage.Controls.Add(page.View);
        return tabPage;
    }

    private async void OnTabChanged(object sender, EventArgs e)
    {
        var selectedIndex = _tabs.SelectedIndex;
        if (selectedIndex < 0 || selectedIndex >= _pages.Count) return;

        await ActivatePageAsync(_pages[selectedIndex]);
    }

    private static async Task ActivatePageAsync(IActivatableTab page)
    {
        try
        {
            await page.ActivateAsync();
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private void OnSettingsRestartRequested()
    {
        OnRestart?.Invoke();
    }
}
