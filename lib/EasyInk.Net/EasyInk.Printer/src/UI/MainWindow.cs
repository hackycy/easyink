using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Printer.Api;
using EasyInk.Printer.Config;
using EasyInk.Printer.Server;
using EasyInk.Printer.Services.Abstractions;
using EasyInk.Printer.Utils;

namespace EasyInk.Printer.UI;

/// <summary>
/// 主管理窗口
/// </summary>
public class MainWindow : Form
{
    private readonly HttpServer _server;
    private readonly WebSocketHandler _wsHandler;
    private readonly EngineApi _api;
    private readonly IAuditService _auditService;
    private readonly HostConfig _config;
    private TabControl _tabs = null!;
    private readonly HashSet<int> _loadedTabs = new();
    private readonly HashSet<int> _refreshingTabs = new();

    private static readonly Color PageBackColor = Color.FromArgb(242, 246, 250);
    private static readonly Color SurfaceColor = Color.FromArgb(252, 254, 255);
    private static readonly Color SectionBackColor = Color.FromArgb(248, 251, 255);
    private static readonly Color InputBackColor = Color.FromArgb(247, 249, 252);
    private static readonly Color BorderColor = Color.FromArgb(231, 236, 244);
    private static readonly Color SoftBorderColor = Color.FromArgb(238, 242, 248);
    private static readonly Color TextColor = Color.FromArgb(30, 41, 59);
    private static readonly Color MutedTextColor = Color.FromArgb(100, 116, 139);
    private static readonly Color PrimaryColor = Color.FromArgb(33, 111, 219);
    private static readonly Color SuccessColor = Color.FromArgb(16, 139, 118);
    private static readonly Color WarningColor = Color.FromArgb(217, 119, 6);
    private static readonly Color ErrorColor = Color.FromArgb(220, 38, 38);
    private static readonly Color InfoColor = Color.FromArgb(79, 70, 229);
    private const int FormRowHeight = 34;

    public event Action? OnRestart;

    public MainWindow(HttpServer server, WebSocketHandler wsHandler, EngineApi api, HostConfig config, IAuditService auditService)
    {
        _server = server;
        _wsHandler = wsHandler;
        _api = api;
        _auditService = auditService;
        _config = config;

        InitializeComponent();
    }

    private void InitializeComponent()
    {
        Text = LangManager.Get("Window_Title");
        Icon = TrayIcon.LoadAppIcon();
        Size = new Size(980, 700);
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(780, 560);
        Font = new Font("Microsoft YaHei UI", 9f);
        BackColor = PageBackColor;

        _tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Padding = new Point(16, 6),
            Font = new Font("Microsoft YaHei UI", 9f),
            HotTrack = true
        };

        _tabs.TabPages.Add(CreateDashboardTab());
        _tabs.TabPages.Add(CreatePrintersTab());
        _tabs.TabPages.Add(CreateJobsTab());
        _tabs.TabPages.Add(CreateLogsTab());
        _tabs.TabPages.Add(CreateSettingsTab());

        Controls.Add(_tabs);

        _tabs.SelectedIndexChanged += OnTabChanged;
    }

    private void OnTabChanged(object sender, EventArgs e)
    {
        var idx = _tabs.SelectedIndex;
        if (_loadedTabs.Contains(idx)) return;

        switch (idx)
        {
            case 1: // 打印机
                _loadedTabs.Add(idx);
                var printersTab = _tabs.TabPages[idx];
                var printersLv = FindListView(printersTab);
                if (printersLv != null) RefreshPrinters(printersLv);
                break;
            case 2: // 任务
                _loadedTabs.Add(idx);
                var jobsTab = _tabs.TabPages[idx];
                var jobsLv = FindListView(jobsTab);
                if (jobsLv != null) RefreshJobs(jobsLv);
                break;
            case 3: // 日志
                _loadedTabs.Add(idx);
                var logsTab = _tabs.TabPages[idx];
                var logsLv = FindListView(logsTab);
                if (logsLv != null) RefreshLogs(logsLv, DateTime.Today.AddDays(-7), DateTime.Now);
                break;
        }
    }

    private static ListView? FindListView(Control root)
    {
        foreach (Control child in root.Controls)
        {
            if (child is ListView listView)
                return listView;

            var nested = FindListView(child);
            if (nested != null)
                return nested;
        }

        return null;
    }

    private TabPage CreateDashboardTab()
    {
        var tab = new TabPage(LangManager.Get("Dashboard_Tab"));
        var panel = CreatePagePanel(new Padding(18));

        var titleFont = new Font("Microsoft YaHei UI", 9f, FontStyle.Regular);
        var valueFont = new Font("Microsoft YaHei UI", 18f, FontStyle.Bold);

        var hasError = !_server.IsRunning && _server.LastError != null;
        var statusColor = hasError ? ErrorColor : SuccessColor;
        var statusText = _server.IsRunning ? LangManager.Get("Dashboard_Status_Running") : (hasError ? LangManager.Get("Dashboard_Status_Error") : LangManager.Get("Dashboard_Status_Stopped"));

        var cardsPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 118,
            ColumnCount = 4,
            RowCount = 1,
            Padding = new Padding(0, 0, 0, 14),
            BackColor = PageBackColor
        };
        for (var i = 0; i < 4; i++)
            cardsPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        cardsPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        Label lblStatusVal, lblPortVal, lblWsVal, lblQueueVal;
        var cardStatus = CreateCardPanel(statusColor, LangManager.Get("Dashboard_ServiceStatus"),
            statusText, valueFont, statusColor, titleFont, out lblStatusVal);
        var cardPort = CreateCardPanel(InfoColor, LangManager.Get("Dashboard_Port"),
            _server.Port.ToString(), valueFont, InfoColor, titleFont, out lblPortVal);
        var cardWs = CreateCardPanel(WarningColor, LangManager.Get("Dashboard_WebSocket"),
            _wsHandler.ConnectionCount.ToString(), valueFont, WarningColor, titleFont, out lblWsVal);
        var cardQueue = CreateCardPanel(SuccessColor, LangManager.Get("Dashboard_PrintQueue"),
            LangManager.Get("Dashboard_Status_Idle"), valueFont, SuccessColor, titleFont, out lblQueueVal);

        cardsPanel.Controls.Add(cardStatus, 0, 0);
        cardsPanel.Controls.Add(cardPort, 1, 0);
        cardsPanel.Controls.Add(cardWs, 2, 0);
        cardsPanel.Controls.Add(cardQueue, 3, 0);

        _wsHandler.ConnectionCountChanged += () =>
        {
            if (IsDisposed) return;
            if (InvokeRequired)
                BeginInvoke(new Action(() => lblWsVal.Text = _wsHandler.ConnectionCount.ToString()));
            else
                lblWsVal.Text = _wsHandler.ConnectionCount.ToString();
        };

        var infoPanel = new RoundedPanel
        {
            Dock = DockStyle.Top,
            Height = 178,
            BackColor = SurfaceColor,
            BorderColor = BorderColor,
            Radius = 8,
            Padding = new Padding(18, 16, 18, 16),
            Margin = new Padding(0, 0, 0, 12)
        };

        var infoTitleFont = new Font("Microsoft YaHei UI", 10f, FontStyle.Bold);
        var infoKeyFont = new Font("Microsoft YaHei UI", 9f, FontStyle.Regular);
        var infoValFont = new Font("Microsoft YaHei UI", 9f, FontStyle.Bold);

        var lblInfoTitle = new Label
        {
            Text = LangManager.Get("Dashboard_DeviceInfo"),
            Font = infoTitleFont,
            ForeColor = TextColor,
            Dock = DockStyle.Top,
            Height = 30,
            TextAlign = ContentAlignment.MiddleLeft
        };

        var lanIps = NetworkHelper.GetLanIpv4Addresses();
        var addresses = lanIps.Count > 0
            ? string.Join("  ", lanIps.Select(ip => $"http://{ip}:{_server.Port}"))
            : $"http://localhost:{_server.Port}";

        var deviceNumber = NetworkHelper.GenerateDeviceNumber();
        var appVersion = VersionHelper.GetDisplayVersion(typeof(StatusController).Assembly);
        var macs = NetworkHelper.GetActivePhysicalMacs();
        var macText = macs.Count > 0 ? string.Join("  /  ", macs) : LangManager.Get("Dashboard_MacNotDetected");

        var infoRows = new[]
        {
            new { Key = LangManager.Get("Dashboard_ServiceAddress"), Value = addresses },
            new { Key = LangManager.Get("Dashboard_DeviceNumber"), Value = deviceNumber },
            new { Key = LangManager.Get("Dashboard_AppVersion"), Value = appVersion },
            new { Key = LangManager.Get("Dashboard_MacAddress"), Value = macText }
        };

        var infoGrid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = infoRows.Length,
            Padding = new Padding(0, 6, 0, 0),
            BackColor = SurfaceColor
        };
        infoGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        infoGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (var i = 0; i < infoRows.Length; i++)
            infoGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));

        for (var i = 0; i < infoRows.Length; i++)
        {
            var row = infoRows[i];
            var lblKey = new Label
            {
                Text = row.Key,
                Font = infoKeyFont,
                ForeColor = MutedTextColor,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                Margin = new Padding(0)
            };

            var txtVal = new TextBox
            {
                Text = row.Value,
                Font = infoValFont,
                ForeColor = TextColor,
                BackColor = SurfaceColor,
                BorderStyle = BorderStyle.None,
                ReadOnly = true,
                Dock = DockStyle.Fill,
                Margin = new Padding(0, 6, 0, 0)
            };
            infoGrid.Controls.Add(lblKey, 0, i);
            infoGrid.Controls.Add(txtVal, 1, i);
        }

        infoPanel.Controls.Add(infoGrid);
        infoPanel.Controls.Add(lblInfoTitle);

        var errorPanel = new RoundedPanel
        {
            Dock = DockStyle.Top,
            Height = 0,
            Visible = false,
            BackColor = Color.FromArgb(255, 247, 237),
            BorderColor = Color.FromArgb(253, 186, 116),
            Radius = 8,
            Padding = new Padding(14, 10, 14, 10),
            Margin = new Padding(0, 0, 0, 8)
        };
        var lblError = new Label
        {
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(154, 52, 18),
            Font = new Font("Microsoft YaHei UI", 9f)
        };
        errorPanel.Controls.Add(lblError);

        if (hasError)
        {
            lblError.Text = LangManager.Get("Dashboard_StartupError", _server.LastError!);
            errorPanel.Height = 48;
            errorPanel.Visible = true;
        }

        var btnRefresh = CreateCommandButton(LangManager.Get("Common_Refresh"), 84);
        var btnBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 42,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 8, 0, 0),
            BackColor = PageBackColor
        };
        btnBar.Controls.Add(btnRefresh);

        btnRefresh.Click += (s, e) =>
        {
            // 刷新服务状态卡片
            var err = !_server.IsRunning && _server.LastError != null;
            lblStatusVal.Text = _server.IsRunning ? LangManager.Get("Dashboard_Status_Running") : (err ? LangManager.Get("Dashboard_Status_Error") : LangManager.Get("Dashboard_Status_Stopped"));
            lblStatusVal.ForeColor = err ? ErrorColor : SuccessColor;
            SetCardAccent(cardStatus, err ? ErrorColor : SuccessColor);
            lblPortVal.Text = _server.Port.ToString();
            lblWsVal.Text = _wsHandler.ConnectionCount.ToString();

            RefreshQueueStatus(lblQueueVal, cardQueue, SuccessColor, WarningColor);

            if (err)
            {
                lblError.Text = LangManager.Get("Dashboard_StartupError", _server.LastError!);
                errorPanel.Height = 48;
                errorPanel.Visible = true;
            }
            else
            {
                errorPanel.Height = 0;
                errorPanel.Visible = false;
            }
        };

        panel.Controls.Add(btnBar);
        panel.Controls.Add(errorPanel);
        panel.Controls.Add(infoPanel);
        panel.Controls.Add(cardsPanel);
        tab.Controls.Add(panel);
        return tab;
    }

    private void RefreshQueueStatus(Label lblQueueVal, Panel cardQueue, Color colorIdle, Color colorBusy)
    {
        try
        {
            var result = _api.GetAllJobs();
            var hasActive = result.Success && result.Data is List<PrintJob> jobs
                && jobs.Any(j => j.Status == JobStatus.Printing || j.Status == JobStatus.Queued);

            lblQueueVal.Text = hasActive ? LangManager.Get("Dashboard_Status_Busy") : LangManager.Get("Dashboard_Status_Idle");
            lblQueueVal.ForeColor = hasActive ? colorBusy : colorIdle;
            SetCardAccent(cardQueue, hasActive ? colorBusy : colorIdle);
        }
        catch
        {
            lblQueueVal.Text = LangManager.Get("Dashboard_Status_Unknown");
            lblQueueVal.ForeColor = colorIdle;
        }
    }

    private Panel CreateCardPanel(Color accentColor, string title, string value, Font valueFont, Color valueColor, Font titleFont, out Label valueLabel)
    {
        var card = new RoundedPanel
        {
            BackColor = SurfaceColor,
            BorderColor = BorderColor,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 0, 12, 0),
            Padding = new Padding(0),
            Radius = 8
        };

        var accentBar = new Panel
        {
            Dock = DockStyle.Top,
            Height = 4,
            BackColor = accentColor,
            Tag = "Accent"
        };

        var contentPanel = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12, 14, 12, 10),
            BackColor = SurfaceColor
        };

        var lblTitle = new Label
        {
            Text = title,
            Font = titleFont,
            ForeColor = MutedTextColor,
            Dock = DockStyle.Top,
            TextAlign = ContentAlignment.MiddleCenter,
            Height = 24,
            Margin = new Padding(0)
        };

        valueLabel = new Label
        {
            Text = value,
            Font = valueFont,
            ForeColor = valueColor,
            Dock = DockStyle.Top,
            TextAlign = ContentAlignment.MiddleCenter,
            Height = 44,
            Margin = new Padding(0)
        };

        contentPanel.Controls.Add(valueLabel);
        contentPanel.Controls.Add(lblTitle);

        card.Controls.Add(contentPanel);
        card.Controls.Add(accentBar);
        return card;
    }

    private TabPage CreatePrintersTab()
    {
        var tab = new TabPage(LangManager.Get("Printers_Tab"));
        var panel = CreatePagePanel(new Padding(16));

        var listView = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            GridLines = false
        };
        StyleListView(listView);
        EnableListCopy(listView);
        listView.Columns.Add(LangManager.Get("Printers_ColName"), 250);
        listView.Columns.Add(LangManager.Get("Printers_ColDefault"), 50);
        listView.Columns.Add(LangManager.Get("Printers_ColStatus"), 100);
        listView.Columns.Add(LangManager.Get("Printers_ColOnline"), 60);
        listView.Columns.Add(LangManager.Get("Printers_ColPaper"), 60);

        var toolPanel = CreateToolPanel(46);

        var btnRefresh = CreateCommandButton(LangManager.Get("Common_Refresh"), 84);
        btnRefresh.Click += (s, e) => RefreshPrinters(listView);

        toolPanel.Controls.Add(btnRefresh);

        panel.Controls.Add(listView);
        panel.Controls.Add(toolPanel);
        tab.Controls.Add(panel);
        return tab;
    }

    private FlowLayoutPanel CreateToolPanel(int height)
    {
        return new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = height,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 0, 0, 12),
            BackColor = PageBackColor
        };
    }

    private bool TryBeginRefresh(int tabIndex)
    {
        return _refreshingTabs.Add(tabIndex);
    }

    private void EndRefresh(int tabIndex)
    {
        _refreshingTabs.Remove(tabIndex);
    }

    private async Task RefreshListViewAsync<T>(ListView listView, int tabIndex, string operationName, Func<PrinterResult> dataFetcher, Action<ListView, List<T>> rowMapper)
    {
        if (!TryBeginRefresh(tabIndex)) return;
        try
        {
            listView.Items.Clear();
            var result = await Task.Run(dataFetcher);
            if (result.Success && result.Data is List<T> data)
                rowMapper(listView, data);
        }
        catch (ObjectDisposedException) { }
        catch (Exception ex)
        {
            try { MessageBox.Show(LangManager.Get(operationName, ex.Message), LangManager.Get("Common_Error"), MessageBoxButtons.OK, MessageBoxIcon.Error); }
            catch (ObjectDisposedException) { }
        }
        finally
        {
            EndRefresh(tabIndex);
        }
    }

    private async void RefreshPrinters(ListView listView)
    {
        await RefreshListViewAsync<PrinterInfo>(listView, 1, "Error_GetPrinters", () => _api.GetPrinters(),
            (listViewCtrl, data) =>
            {
                foreach (var p in data)
                {
                    var item = new ListViewItem(p.Name);
                    item.SubItems.Add(p.IsDefault ? LangManager.Get("Common_Yes") : "");
                    item.SubItems.Add(p.Status?.Message ?? "");
                    item.SubItems.Add(p.Status?.IsOnline == true ? LangManager.Get("Common_Yes") : LangManager.Get("Common_No"));
                    item.SubItems.Add(p.Status?.HasPaper == true ? LangManager.Get("Common_Yes") : LangManager.Get("Common_No"));
                    listViewCtrl.Items.Add(item);
                }
            });
    }

    private async void RefreshJobs(ListView listView)
    {
        await RefreshListViewAsync<PrintJob>(listView, 2, "Error_GetJobs", () => _api.GetAllJobs(),
            (listViewCtrl, data) =>
            {
                foreach (var job in data)
                {
                    var item = new ListViewItem(job.JobId);
                    item.SubItems.Add(job.PrinterName);
                    item.SubItems.Add(job.Status.ToString());
                    item.SubItems.Add(job.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"));
                    item.SubItems.Add(job.ErrorMessage);
                    listViewCtrl.Items.Add(item);
                }
            });
    }

    private TabPage CreateJobsTab()
    {
        var tab = new TabPage(LangManager.Get("Jobs_Tab"));
        var panel = CreatePagePanel(new Padding(16));

        var listView = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            GridLines = false
        };
        StyleListView(listView);
        EnableListCopy(listView);
        listView.Columns.Add(LangManager.Get("Jobs_ColJobId"), 200);
        listView.Columns.Add(LangManager.Get("Jobs_ColPrinter"), 150);
        listView.Columns.Add(LangManager.Get("Jobs_ColStatus"), 100);
        listView.Columns.Add(LangManager.Get("Jobs_ColCreatedTime"), 150);
        listView.Columns.Add(LangManager.Get("Jobs_ColError"), 200);

        var toolPanel = CreateToolPanel(46);
        var btnRefresh = CreateCommandButton(LangManager.Get("Common_Refresh"), 84);
        btnRefresh.Click += (s, e) => RefreshJobs(listView);

        toolPanel.Controls.Add(btnRefresh);

        panel.Controls.Add(listView);
        panel.Controls.Add(toolPanel);
        tab.Controls.Add(panel);
        return tab;
    }

    private TabPage CreateLogsTab()
    {
        var tab = new TabPage(LangManager.Get("Logs_Tab"));
        var panel = CreatePagePanel(new Padding(16));

        var filterPanel = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Height = 58,
            BackColor = SectionBackColor,
            BorderColor = Color.Transparent,
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
            BackColor = SectionBackColor
        };
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 154));
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 154));
        filterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 82));
        filterLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var lblFrom = CreateInlineLabel(LangManager.Get("Logs_From"));
        var dtpFrom = CreateInlineDatePicker(DateTime.Today.AddDays(-7));
        var lblTo = CreateInlineLabel(LangManager.Get("Logs_To"));
        var dtpTo = CreateInlineDatePicker(DateTime.Now);
        var btnQuery = CreateCommandButton(LangManager.Get("Common_Query"), 78);
        btnQuery.Anchor = AnchorStyles.Left;
        btnQuery.Margin = new Padding(0);

        filterLayout.Controls.Add(lblFrom, 0, 0);
        filterLayout.Controls.Add(dtpFrom, 1, 0);
        filterLayout.Controls.Add(lblTo, 2, 0);
        filterLayout.Controls.Add(dtpTo, 3, 0);
        filterLayout.Controls.Add(btnQuery, 4, 0);
        filterPanel.Controls.Add(filterLayout);

        var listView = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            GridLines = false
        };
        StyleListView(listView);
        EnableListCopy(listView);
        listView.Columns.Add(LangManager.Get("Logs_ColTime"), 150);
        listView.Columns.Add(LangManager.Get("Logs_ColPrinter"), 150);
        listView.Columns.Add(LangManager.Get("Logs_ColStatus"), 80);
        listView.Columns.Add(LangManager.Get("Logs_ColUser"), 100);
        listView.Columns.Add(LangManager.Get("Logs_ColJobId"), 200);
        listView.Columns.Add(LangManager.Get("Logs_ColError"), 200);

        btnQuery.Click += (s, e) => RefreshLogs(listView, dtpFrom.Value, dtpTo.Value);

        var filterHost = CreateSectionHost(filterPanel, 14);
        ResizePlainSection(filterHost, 58);

        panel.Controls.Add(listView);
        panel.Controls.Add(filterHost);
        tab.Controls.Add(panel);
        return tab;
    }

    private async void RefreshLogs(ListView listView, DateTime from, DateTime to)
    {
        if (!TryBeginRefresh(3)) return;
        try
        {
            listView.Items.Clear();
            var logs = await Task.Run(() => _auditService.QueryLogs(from, to, limit: 200));
            foreach (var log in logs)
            {
                var item = new ListViewItem(log.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"));
                item.SubItems.Add(log.PrinterName);
                item.SubItems.Add(log.Status);
                item.SubItems.Add(log.UserId ?? "");
                item.SubItems.Add(log.JobId ?? "");
                item.SubItems.Add(log.ErrorMessage ?? "");
                listView.Items.Add(item);
            }
        }
        catch (ObjectDisposedException) { }
        catch (Exception ex)
        {
            try { MessageBox.Show(LangManager.Get("Error_QueryLogs", ex.Message), LangManager.Get("Common_Error"), MessageBoxButtons.OK, MessageBoxIcon.Error); }
            catch (ObjectDisposedException) { }
        }
        finally
        {
            EndRefresh(3);
        }
    }

    private TabPage CreateSettingsTab()
    {
        var tab = new TabPage(LangManager.Get("Settings_Tab"));

        var panel = CreatePagePanel(new Padding(16));
        panel.AutoScroll = true;
        var settingsLayout = CreateSettingsLayoutPanel();
        panel.Controls.Add(settingsLayout);
        UpdateSettingsLayoutWidth(panel, settingsLayout);
        panel.Resize += (s, e) => UpdateSettingsLayoutWidth(panel, settingsLayout);

        // 基本设置组
        var grpBasic = CreateSettingsSection(LangManager.Get("Settings_Basic"));

        var basicPanel = CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100));
        var numPort = new NumericUpDown
        {
            Width = 120,
            Minimum = 1024,
            Maximum = 65535,
            Value = _config.HttpPort,
            Anchor = AnchorStyles.Left
        };

        var chkAutoStart = new NoFocusCheckBox
        {
            Text = "",
            Anchor = AnchorStyles.Left,
            Checked = HostConfig.GetAutoStartRegistry()
        };

        AddSettingRow(basicPanel, LangManager.Get("Settings_HttpPort"), numPort);
        AddSettingRow(basicPanel, LangManager.Get("Settings_AutoStart"), chkAutoStart);
        grpBasic.ContentPanel.Controls.Add(basicPanel);

        // 显示设置组
        var grpDisplay = CreateSettingsSection(LangManager.Get("Settings_Display"));

        var displayPanel = CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100));

        var chkMinimizeToTray = new NoFocusCheckBox
        {
            Text = LangManager.Get("Settings_MinimizeToTray"),
            Anchor = AnchorStyles.Left,
            AutoSize = true,
            Checked = _config.MinimizeToTray
        };

        var chkStartMinimized = new NoFocusCheckBox
        {
            Text = LangManager.Get("Settings_StartMinimized"),
            Anchor = AnchorStyles.Left,
            AutoSize = true,
            Checked = _config.StartMinimized
        };

        var cmbLang = new ComboBox
        {
            Width = 120,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Anchor = AnchorStyles.Left
        };
        cmbLang.Items.Add(LangManager.Get("Settings_LanguageChinese"));
        cmbLang.Items.Add(LangManager.Get("Settings_LanguageEnglish"));
        cmbLang.SelectedIndex = _config.Language == "en-US" ? 1 : 0;

        AddSettingWideRow(displayPanel, chkMinimizeToTray);
        AddSettingWideRow(displayPanel, chkStartMinimized);
        AddSettingRow(displayPanel, LangManager.Get("Settings_Language"), cmbLang);
        grpDisplay.ContentPanel.Controls.Add(displayPanel);

        // 安全设置组
        var grpSecurity = CreateSettingsSection(LangManager.Get("Settings_Security"));

        var securityPanel = CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100));

        var chkTrustAllOrigins = new NoFocusCheckBox
        {
            Text = LangManager.Get("Settings_TrustAllOrigins"),
            Anchor = AnchorStyles.Left,
            AutoSize = true,
            Checked = _config.TrustAllOrigins
        };

        var txtApiKey = new TextBox
        {
            Text = _config.ApiKey ?? "",
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };

        var placeholderText = LangManager.Get("Settings_ApiKeyPlaceholder");
        var isPlaceholder = string.IsNullOrEmpty(_config.ApiKey);
        if (isPlaceholder)
        {
            txtApiKey.Text = placeholderText;
            txtApiKey.ForeColor = SystemColors.GrayText;
        }

        txtApiKey.GotFocus += (s, e) =>
        {
            if (txtApiKey.Text == placeholderText && txtApiKey.ForeColor == SystemColors.GrayText)
            {
                txtApiKey.Text = "";
                txtApiKey.ForeColor = SystemColors.WindowText;
            }
        };
        txtApiKey.LostFocus += (s, e) =>
        {
            if (string.IsNullOrWhiteSpace(txtApiKey.Text))
            {
                txtApiKey.Text = placeholderText;
                txtApiKey.ForeColor = SystemColors.GrayText;
            }
        };

        AddSettingWideRow(securityPanel, chkTrustAllOrigins);
        AddSettingRow(securityPanel, LangManager.Get("Settings_ApiKey"), txtApiKey);
        grpSecurity.ContentPanel.Controls.Add(securityPanel);

        // 打印兼容性设置组
        var grpPrinterCompat = CreateSettingsSection(LangManager.Get("Settings_PrinterCompat"));

        var compatPanel = CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100));
        var cmbLowDpiEnhancement = new ComboBox
        {
            Width = 180,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Anchor = AnchorStyles.Left
        };
        cmbLowDpiEnhancement.Items.Add(LangManager.Get("Settings_LowDpiEnhancementNormal"));
        cmbLowDpiEnhancement.Items.Add(LangManager.Get("Settings_LowDpiEnhancementBoost"));
        cmbLowDpiEnhancement.Items.Add(LangManager.Get("Settings_LowDpiEnhancementMonochrome"));
        cmbLowDpiEnhancement.SelectedIndex = GetLowDpiEnhancementSelectedIndex(_config.LowDpiPrintEnhancement);

        // Raw printer names row
        var txtRawPrinters = new TextBox
        {
            Dock = DockStyle.Fill,
            Text = string.Join(", ", _config.RawPrinterNames)
        };

        var pnlSumatraPath = CreateSettingsTable(
            new ColumnStyle(SizeType.Percent, 100),
            new ColumnStyle(SizeType.Absolute, 68));
        pnlSumatraPath.Padding = new Padding(0);
        var txtSumatraPath = new TextBox
        {
            Dock = DockStyle.Fill,
            Text = string.IsNullOrWhiteSpace(_config.SumatraPdfPath)
                ? HostConfig.DefaultSumatraPdfPath
                : _config.SumatraPdfPath
        };
        var btnBrowseSumatra = CreateSecondaryButton(LangManager.Get("Common_Browse"), 64);
        btnBrowseSumatra.Dock = DockStyle.Fill;
        btnBrowseSumatra.Click += (s, e) =>
        {
            using var dlg = new OpenFileDialog
            {
                Title = LangManager.Get("Dialog_SumatraPdfPath"),
                Filter = LangManager.Get("Dialog_ExeFileFilter"),
                FileName = "SumatraPDF.exe",
                InitialDirectory = string.IsNullOrWhiteSpace(txtSumatraPath.Text)
                    ? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
                    : Path.GetDirectoryName(txtSumatraPath.Text) ?? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                txtSumatraPath.Text = dlg.FileName;
        };
        AddSettingControlRow(pnlSumatraPath, txtSumatraPath, btnBrowseSumatra);

        var txtSumatraPrinters = new TextBox
        {
            Dock = DockStyle.Fill,
            Text = string.Join(", ", _config.SumatraPrinterNames)
        };

        var pnlSumatraSettings = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Margin = new Padding(0)
        };
        var txtSumatraSettings = new TextBox
        {
            Width = 180,
            Text = string.IsNullOrWhiteSpace(_config.SumatraPrintSettings) ? "fit" : _config.SumatraPrintSettings
        };
        var lblSumatraTimeout = new Label
        {
            Text = LangManager.Get("Settings_SumatraTimeoutLabel"),
            AutoSize = true,
            Margin = new Padding(12, 6, 4, 0)
        };
        var numSumatraTimeout = new NumericUpDown
        {
            Width = 70,
            Minimum = 5,
            Maximum = 300,
            Value = Math.Max(5, Math.Min(300, _config.SumatraTimeoutSeconds)),
            Anchor = AnchorStyles.Left
        };
        pnlSumatraSettings.Controls.Add(txtSumatraSettings);
        pnlSumatraSettings.Controls.Add(lblSumatraTimeout);
        pnlSumatraSettings.Controls.Add(numSumatraTimeout);

        AddSettingRow(compatPanel, LangManager.Get("Settings_LowDpiEnhancementLabel"), cmbLowDpiEnhancement);
        AddSettingDescriptionRow(compatPanel, LangManager.Get("Settings_LowDpiEnhancementDescription"));
        AddSettingRow(compatPanel, LangManager.Get("Settings_RawPrinterLabel"), txtRawPrinters);
        AddSettingDescriptionRow(compatPanel, LangManager.Get("Settings_RawPrinterDescription"));
        AddSettingRow(compatPanel, LangManager.Get("Settings_SumatraPathLabel"), pnlSumatraPath);
        AddSettingRow(compatPanel, LangManager.Get("Settings_SumatraPrintersLabel"), txtSumatraPrinters);
        AddSettingRow(compatPanel, LangManager.Get("Settings_SumatraSettingsLabel"), pnlSumatraSettings);
        AddSettingDescriptionRow(compatPanel, LangManager.Get("Settings_SumatraDescription"));
        grpPrinterCompat.ContentPanel.Controls.Add(compatPanel);

        // 路径设置组
        var grpPath = CreateSettingsSection(LangManager.Get("Settings_Path"));

        var pathPanel = CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100),
            new ColumnStyle(SizeType.Absolute, 64));
        var txtDbPath = new TextBox
        {
            Text = string.IsNullOrWhiteSpace(_config.DbPath) ? HostConfig.DefaultDbPath : _config.DbPath,
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };
        var btnBrowseDb = CreateSecondaryButton(LangManager.Get("Common_Browse"), 56);
        btnBrowseDb.Anchor = AnchorStyles.Left;
        btnBrowseDb.Click += (s, e) =>
        {
            using var dlg = new SaveFileDialog
            {
                Title = LangManager.Get("Dialog_DbFileLocation"),
                Filter = LangManager.Get("Dialog_DbFileFilter"),
                FileName = "audit.db",
                InitialDirectory = Path.GetDirectoryName(txtDbPath.Text) ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                txtDbPath.Text = dlg.FileName;
        };

        var txtCrashDir = new TextBox
        {
            Text = string.IsNullOrWhiteSpace(_config.CrashLogDir) ? HostConfig.DefaultCrashLogDir : _config.CrashLogDir,
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };
        var btnBrowseCrash = CreateSecondaryButton(LangManager.Get("Common_Browse"), 56);
        btnBrowseCrash.Anchor = AnchorStyles.Left;
        btnBrowseCrash.Click += (s, e) =>
        {
            using var dlg = new FolderBrowserDialog
            {
                Description = LangManager.Get("Dialog_CrashLogDir"),
                SelectedPath = txtCrashDir.Text
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                txtCrashDir.Text = dlg.SelectedPath;
        };

        var txtSumatraTempDir = new TextBox
        {
            Text = string.IsNullOrWhiteSpace(_config.SumatraTempDir)
                ? HostConfig.DefaultSumatraTempDir
                : _config.SumatraTempDir,
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };
        var btnBrowseSumatraTemp = CreateSecondaryButton(LangManager.Get("Common_Browse"), 56);
        btnBrowseSumatraTemp.Anchor = AnchorStyles.Left;
        btnBrowseSumatraTemp.Click += (s, e) =>
        {
            using var dlg = new FolderBrowserDialog
            {
                Description = LangManager.Get("Dialog_SumatraTempDir"),
                SelectedPath = txtSumatraTempDir.Text
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                txtSumatraTempDir.Text = dlg.SelectedPath;
        };

        AddSettingRow(pathPanel, LangManager.Get("Settings_DbPath"), txtDbPath, btnBrowseDb);
        AddSettingRow(pathPanel, LangManager.Get("Settings_CrashLogDir"), txtCrashDir, btnBrowseCrash);
        AddSettingRow(pathPanel, LangManager.Get("Settings_SumatraTempDir"), txtSumatraTempDir, btnBrowseSumatraTemp);
        grpPath.ContentPanel.Controls.Add(pathPanel);

        // 保存按钮
        var btnSave = CreateCommandButton(LangManager.Get("Common_Save"), 84);
        btnSave.Margin = new Padding(0);
        var saveBar = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(0),
            BackColor = PageBackColor
        };
        saveBar.Controls.Add(btnSave);
        btnSave.Click += (s, e) =>
        {
            // 路径校验
            var dbPathValue = (txtDbPath.Text ?? "").Trim();
            if (!HostConfig.IsValidFilePath(dbPathValue, out var dbError))
            {
                MessageBox.Show(LangManager.Get("Error_DbPathInvalid", dbError!), LangManager.Get("Common_Error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtDbPath.Focus();
                return;
            }

            var crashDirValue = (txtCrashDir.Text ?? "").Trim();
            if (!HostConfig.IsValidFilePath(crashDirValue + Path.DirectorySeparatorChar, out var crashError))
            {
                MessageBox.Show(LangManager.Get("Error_CrashLogDirInvalid", crashError!), LangManager.Get("Common_Error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtCrashDir.Focus();
                return;
            }

            var sumatraTempDirValue = (txtSumatraTempDir.Text ?? "").Trim();
            if (!HostConfig.IsValidFilePath(sumatraTempDirValue + Path.DirectorySeparatorChar, out var sumatraTempError))
            {
                MessageBox.Show(LangManager.Get("Error_SumatraTempDirInvalid", sumatraTempError!), LangManager.Get("Common_Error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtSumatraTempDir.Focus();
                return;
            }

            _config.LowDpiPrintEnhancement = GetLowDpiEnhancementValue(cmbLowDpiEnhancement.SelectedIndex);
            _config.RawPrinterNames = (txtRawPrinters.Text ?? "")
                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim())
                .Where(s => s.Length > 0)
                .ToList();
            _config.SumatraPdfPath = string.IsNullOrWhiteSpace(txtSumatraPath.Text)
                ? HostConfig.DefaultSumatraPdfPath
                : txtSumatraPath.Text?.Trim() ?? HostConfig.DefaultSumatraPdfPath;
            _config.SumatraPrinterNames = (txtSumatraPrinters.Text ?? "")
                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim())
                .Where(s => s.Length > 0)
                .ToList();
            _config.SumatraPrintSettings = string.IsNullOrWhiteSpace(txtSumatraSettings.Text)
                ? "fit"
                : txtSumatraSettings.Text.Trim();
            _config.SumatraTimeoutSeconds = (int)numSumatraTimeout.Value;
            _config.HttpPort = (int)numPort.Value;
            _config.AutoStart = chkAutoStart.Checked;
            _config.MinimizeToTray = chkMinimizeToTray.Checked;
            _config.StartMinimized = chkStartMinimized.Checked;
            _config.TrustAllOrigins = chkTrustAllOrigins.Checked;
            _config.Language = cmbLang.SelectedIndex == 1 ? "en-US" : "";
            var apiKeyValue = (txtApiKey.ForeColor == SystemColors.GrayText || string.IsNullOrWhiteSpace(txtApiKey.Text))
                ? null : txtApiKey.Text.Trim();
            _config.ApiKey = apiKeyValue;

            _config.DbPath = string.Equals(dbPathValue, HostConfig.DefaultDbPath, StringComparison.OrdinalIgnoreCase)
                ? null : dbPathValue;
            _config.CrashLogDir = string.Equals(crashDirValue, HostConfig.DefaultCrashLogDir, StringComparison.OrdinalIgnoreCase)
                ? null : crashDirValue;
            _config.SumatraTempDir = string.Equals(sumatraTempDirValue, HostConfig.DefaultSumatraTempDir, StringComparison.OrdinalIgnoreCase)
                ? null : sumatraTempDirValue;

            try
            {
                _config.Save();
            }
            catch (Exception ex)
            {
                MessageBox.Show(LangManager.Get("Error_ConfigSaveFailed", ex.Message), LangManager.Get("Common_Error"), MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            HostConfig.SetAutoStartRegistry(chkAutoStart.Checked);

            var result = MessageBox.Show(
                LangManager.Get("Prompt_SavedRestart"),
                LangManager.Get("Common_Confirm"),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (result == DialogResult.Yes)
            {
                OnRestart?.Invoke();
            }
            else
            {
                MessageBox.Show(LangManager.Get("Prompt_DelayedApply"), LangManager.Get("Common_Info"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        };

        StyleSettingsSection(grpBasic);
        StyleSettingsSection(grpDisplay);
        StyleSettingsSection(grpSecurity);
        StyleSettingsSection(grpPrinterCompat);
        StyleSettingsSection(grpPath);

        AddSettingsBlock(settingsLayout, grpBasic);
        AddSettingsBlock(settingsLayout, grpDisplay);
        AddSettingsBlock(settingsLayout, grpSecurity);
        AddSettingsBlock(settingsLayout, grpPrinterCompat);
        AddSettingsBlock(settingsLayout, grpPath);
        AddSettingsBlock(settingsLayout, saveBar, 0);
        tab.Controls.Add(panel);
        return tab;
    }

    private static Panel CreatePagePanel(Padding padding)
    {
        return new Panel
        {
            Dock = DockStyle.Fill,
            Padding = padding,
            BackColor = PageBackColor
        };
    }

    private static Button CreateCommandButton(string text, int width)
    {
        return CreateRoundedButton(text, width, PrimaryColor, Color.White, Color.FromArgb(25, 99, 203), Color.FromArgb(29, 78, 216));
    }

    private static Button CreateSecondaryButton(string text, int width)
    {
        return CreateRoundedButton(text, width, Color.FromArgb(229, 238, 252), Color.FromArgb(30, 64, 117), Color.FromArgb(217, 229, 248), Color.FromArgb(205, 221, 245));
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

    private static Label CreateInlineLabel(string text)
    {
        return new Label
        {
            Text = text,
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            ForeColor = MutedTextColor,
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(0, 0, 6, 0)
        };
    }

    private static DateTimePicker CreateInlineDatePicker(DateTime value)
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

    private static void StyleListView(ListView listView)
    {
        listView.BorderStyle = BorderStyle.None;
        listView.BackColor = SurfaceColor;
        listView.ForeColor = TextColor;
        listView.HideSelection = false;
        listView.MultiSelect = true;
        listView.Font = new Font("Microsoft YaHei UI", 9f);
        listView.SmallImageList = new ImageList { ImageSize = new Size(1, 28) };
    }

    private static void EnableListCopy(ListView listView)
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

    private static SettingsSectionPanel CreateSettingsSection(string title)
    {
        return new SettingsSectionPanel(title)
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top,
            Margin = new Padding(0)
        };
    }

    private static TableLayoutPanel CreateSettingsLayoutPanel()
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
            BackColor = PageBackColor
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        return layout;
    }

    private static void UpdateSettingsLayoutWidth(Panel panel, Control layout)
    {
        var verticalScrollWidth = panel.VerticalScroll.Visible ? SystemInformation.VerticalScrollBarWidth : 0;
        layout.Location = new Point(panel.Padding.Left, panel.Padding.Top);
        layout.Width = Math.Max(320, panel.ClientSize.Width - panel.Padding.Horizontal - verticalScrollWidth);
    }

    private static TableLayoutPanel CreateSettingsTable(params ColumnStyle[] columnStyles)
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
            BackColor = SectionBackColor
        };

        foreach (var columnStyle in columnStyles)
            table.ColumnStyles.Add(columnStyle);

        table.SizeChanged += (s, e) => UpdateSettingsTableWrapping(table);
        return table;
    }

    private static void AddSettingsBlock(TableLayoutPanel layout, Control content, int bottomSpacing = 12)
    {
        var row = layout.RowCount;
        layout.RowCount++;
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        content.Dock = DockStyle.Fill;
        content.Margin = new Padding(0, 0, 0, bottomSpacing);
        layout.Controls.Add(content, 0, row);
    }

    private static void AddSettingRow(TableLayoutPanel table, string labelText, Control content)
    {
        var row = AddSettingsTableRow(table);
        PrepareSettingContent(content);
        table.Controls.Add(CreateSettingLabel(labelText), 0, row);
        table.Controls.Add(content, 1, row);
    }

    private static void AddSettingRow(TableLayoutPanel table, string labelText, Control content, Control trailingContent)
    {
        var row = AddSettingsTableRow(table);
        PrepareSettingContent(content);
        PrepareSettingTrailingContent(trailingContent);
        table.Controls.Add(CreateSettingLabel(labelText), 0, row);
        table.Controls.Add(content, 1, row);
        table.Controls.Add(trailingContent, 2, row);
    }

    private static void AddSettingControlRow(TableLayoutPanel table, Control firstContent, Control secondContent)
    {
        var row = AddSettingsTableRow(table);
        PrepareSettingContent(firstContent);
        PrepareSettingTrailingContent(secondContent);
        table.Controls.Add(firstContent, 0, row);
        table.Controls.Add(secondContent, 1, row);
    }

    private static void AddSettingWideRow(TableLayoutPanel table, Control content)
    {
        var row = AddSettingsTableRow(table);
        PrepareSettingContent(content);
        table.Controls.Add(content, 0, row);
        table.SetColumnSpan(content, table.ColumnCount);
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

    private static void AddSettingDescriptionRow(TableLayoutPanel table, string text)
    {
        var description = new Label
        {
            Text = text,
            AutoSize = true,
            Dock = DockStyle.Top,
            ForeColor = MutedTextColor,
            Margin = new Padding(0, 0, 0, 8),
            Tag = "SettingsDescription"
        };
        AddSettingWideRow(table, description);
        UpdateSettingsTableWrapping(table);
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
            MinimumSize = new Size(0, FormRowHeight),
            Margin = new Padding(0, 3, 10, 3)
        };
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

    private static Panel CreateSectionHost(Control content, int bottomPadding = 12)
    {
        var host = new Panel
        {
            Dock = DockStyle.Top,
            Padding = new Padding(0, 0, 0, bottomPadding),
            BackColor = PageBackColor
        };
        content.Dock = DockStyle.Fill;
        host.Controls.Add(content);
        return host;
    }

    private static void ResizePlainSection(Panel host, int contentHeight)
    {
        host.Height = contentHeight + host.Padding.Vertical;
    }

    private static void StyleSettingsSection(Control root)
    {
        foreach (Control child in root.Controls)
            StyleSettingsSection(child);

        if (root is SettingsSectionPanel)
        {
            return;
        }

        if (root is TableLayoutPanel table)
        {
            table.BackColor = SectionBackColor;
            table.Margin = new Padding(0);
            return;
        }

        if (root is FlowLayoutPanel flow)
        {
            flow.BackColor = SectionBackColor;
            return;
        }

        if (root is Label label)
        {
            label.ForeColor = label.ForeColor == SystemColors.GrayText ? MutedTextColor : TextColor;
            label.Font = new Font("Microsoft YaHei UI", 9f, label.Font.Style);
            return;
        }

        if (root is TextBox textBox)
        {
            textBox.BorderStyle = BorderStyle.FixedSingle;
            textBox.BackColor = Color.White;
            textBox.ForeColor = textBox.ForeColor == SystemColors.GrayText ? SystemColors.GrayText : TextColor;
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
            checkBox.ForeColor = TextColor;
            checkBox.Margin = new Padding(0, 3, 0, 3);
        }
    }

    private static void SetCardAccent(Panel card, Color color)
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

    private static GraphicsPath CreateRoundPath(Rectangle bounds, int radius)
    {
        var path = new GraphicsPath();
        var diameter = Math.Max(1, Math.Min(radius * 2, Math.Min(bounds.Width, bounds.Height)));
        var arc = new Rectangle(bounds.Location, new Size(diameter, diameter));

        path.AddArc(arc, 180, 90);
        arc.X = bounds.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = bounds.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = bounds.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();
        return path;
    }

    private class RoundedButton : Button
    {
        private bool _hovered;
        private bool _pressed;

        public int Radius { get; set; } = 8;
        public Color HoverBackColor { get; set; }
        public Color DownBackColor { get; set; }

        protected override bool ShowFocusCues => false;

        protected override void OnMouseEnter(EventArgs e)
        {
            _hovered = true;
            base.OnMouseEnter(e);
            Invalidate();
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            _hovered = false;
            _pressed = false;
            base.OnMouseLeave(e);
            Invalidate();
        }

        protected override void OnMouseDown(MouseEventArgs mevent)
        {
            _pressed = true;
            base.OnMouseDown(mevent);
            Invalidate();
        }

        protected override void OnMouseUp(MouseEventArgs mevent)
        {
            _pressed = false;
            base.OnMouseUp(mevent);
            Invalidate();
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            UpdateRegion();
        }

        protected override void OnPaint(PaintEventArgs pevent)
        {
            pevent.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var fillColor = _pressed ? DownBackColor : (_hovered ? HoverBackColor : BackColor);
            pevent.Graphics.Clear(Parent?.BackColor ?? BackColor);

            using var path = CreateRoundPath(new Rectangle(0, 0, Width - 1, Height - 1), Radius);
            using var brush = new SolidBrush(fillColor);
            pevent.Graphics.FillPath(brush, path);

            TextRenderer.DrawText(
                pevent.Graphics,
                Text,
                Font,
                ClientRectangle,
                ForeColor,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis);
        }

        private void UpdateRegion()
        {
            if (Width <= 0 || Height <= 0) return;

            using var path = CreateRoundPath(new Rectangle(0, 0, Width, Height), Radius);
            Region = new Region(path);
        }
    }

    private class NoFocusCheckBox : CheckBox
    {
        protected override bool ShowFocusCues => false;
    }

    private class SettingsSectionPanel : RoundedPanel
    {
        public const int DefaultHeaderHeight = 36;
        public int HeaderHeight => DefaultHeaderHeight;
        public Panel ContentPanel { get; }

        public SettingsSectionPanel(string title)
        {
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            BackColor = SectionBackColor;
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
                BackColor = SectionBackColor
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, HeaderHeight));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            var titleLabel = new Label
            {
                Text = title,
                Dock = DockStyle.Fill,
                Font = new Font("Microsoft YaHei UI", 9.5f, FontStyle.Bold),
                ForeColor = TextColor,
                BackColor = SectionBackColor,
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
                BackColor = SectionBackColor
            };

            layout.Controls.Add(titleLabel, 0, 0);
            layout.Controls.Add(ContentPanel, 0, 1);
            Controls.Add(layout);
        }
    }

    private class RoundedPanel : Panel
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

            using var path = MainWindow.CreateRoundPath(new Rectangle(0, 0, Width - 1, Height - 1), Radius);
            using var pen = new Pen(BorderColor);
            if (BorderColor.A > 0)
                e.Graphics.DrawPath(pen, path);
        }

        private void UpdateRegion()
        {
            if (Width <= 0 || Height <= 0) return;

            using var path = MainWindow.CreateRoundPath(new Rectangle(0, 0, Width, Height), Radius);
            Region = new Region(path);
            Invalidate();
        }
    }

    private static int GetLowDpiEnhancementSelectedIndex(string? value)
    {
        if (string.Equals(value, "normal", StringComparison.OrdinalIgnoreCase))
            return 0;
        if (string.Equals(value, "monochrome", StringComparison.OrdinalIgnoreCase))
            return 2;
        return 1;
    }

    private static string GetLowDpiEnhancementValue(int selectedIndex)
    {
        switch (selectedIndex)
        {
            case 0:
                return "normal";
            case 2:
                return "monochrome";
            default:
                return "boost";
        }
    }
}
