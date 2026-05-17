using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyInk.Printer.UI.Controls;
using EasyInk.Printer.UI.Views;

namespace EasyInk.Printer.UI;

internal class MainWindow : Form
{
    private readonly IReadOnlyList<IActivatableTab> _pages;
    private readonly SettingsView _settingsView;
    private readonly HashSet<int> _loadedTabs = new() { 0 };
    private TabControl _tabs = null!;

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
        if (!_loadedTabs.Add(selectedIndex)) return;

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
