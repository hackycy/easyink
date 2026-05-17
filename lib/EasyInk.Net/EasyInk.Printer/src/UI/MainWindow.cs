using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
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
        Size = new Size(900, 640);
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(700, 500);
        Font = new Font("Microsoft YaHei UI", 9f);

        _tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Padding = new Point(12, 4)
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
                var printersLv = printersTab.Controls.OfType<ListView>().FirstOrDefault();
                if (printersLv != null) RefreshPrinters(printersLv);
                break;
            case 2: // 任务
                _loadedTabs.Add(idx);
                var jobsTab = _tabs.TabPages[idx];
                var jobsLv = jobsTab.Controls.OfType<ListView>().FirstOrDefault();
                if (jobsLv != null) RefreshJobs(jobsLv);
                break;
            case 3: // 日志
                _loadedTabs.Add(idx);
                var logsTab = _tabs.TabPages[idx];
                var logsLv = logsTab.Controls.OfType<ListView>().FirstOrDefault();
                if (logsLv != null) RefreshLogs(logsLv, DateTime.Today.AddDays(-7), DateTime.Now);
                break;
        }
    }

    private TabPage CreateDashboardTab()
    {
        var tab = new TabPage(LangManager.Get("Dashboard_Tab"));
        var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };

        var titleFont = new Font("Microsoft YaHei UI", 9f);
        var valueFont = new Font("Microsoft YaHei UI", 18f, FontStyle.Bold);
        var cardSize = new Size(180, 90);

        var colorRunning = Color.FromArgb(56, 142, 142);
        var colorError = Color.FromArgb(211, 47, 47);
        var colorPort = Color.FromArgb(63, 81, 181);
        var colorWs = Color.FromArgb(255, 152, 0);
        var colorIdle = Color.FromArgb(56, 142, 142);
        var colorBusy = Color.FromArgb(255, 111, 0);

        var hasError = !_server.IsRunning && _server.LastError != null;
        var statusColor = hasError ? colorError : colorRunning;
        var statusText = _server.IsRunning ? LangManager.Get("Dashboard_Status_Running") : (hasError ? LangManager.Get("Dashboard_Status_Error") : LangManager.Get("Dashboard_Status_Stopped"));

        // -- 状态卡片 --
        var cardsPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 118,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 0, 0, 8),
            AutoSize = false
        };

        Label lblStatusVal, lblPortVal, lblWsVal, lblQueueVal;
        var cardStatus = CreateCardPanel(cardSize, statusColor, LangManager.Get("Dashboard_ServiceStatus"),
            statusText, valueFont, statusColor, titleFont, out lblStatusVal);
        var cardPort = CreateCardPanel(cardSize, colorPort, LangManager.Get("Dashboard_Port"),
            _server.Port.ToString(), valueFont, colorPort, titleFont, out lblPortVal);
        var cardWs = CreateCardPanel(cardSize, colorWs, LangManager.Get("Dashboard_WebSocket"),
            _wsHandler.ConnectionCount.ToString(), valueFont, colorWs, titleFont, out lblWsVal);
        var cardQueue = CreateCardPanel(cardSize, colorIdle, LangManager.Get("Dashboard_PrintQueue"),
            LangManager.Get("Dashboard_Status_Idle"), valueFont, colorIdle, titleFont, out lblQueueVal);

        cardsPanel.Controls.AddRange(new Control[] { cardStatus, cardPort, cardWs, cardQueue });

        _wsHandler.ConnectionCountChanged += () =>
        {
            if (IsDisposed) return;
            if (InvokeRequired)
                BeginInvoke(new Action(() => lblWsVal.Text = _wsHandler.ConnectionCount.ToString()));
            else
                lblWsVal.Text = _wsHandler.ConnectionCount.ToString();
        };

        // -- 设备信息区域 --
        var infoPanel = new Panel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            BackColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle,
            Padding = new Padding(16, 12, 16, 12),
            Margin = new Padding(0, 0, 0, 12)
        };

        var infoTitleFont = new Font("Microsoft YaHei UI", 10f, FontStyle.Bold);
        var infoKeyFont = new Font("Microsoft YaHei UI", 9f);
        var infoValFont = new Font("Microsoft YaHei UI", 9f, FontStyle.Bold);
        var rowHeight = 24;

        var lblInfoTitle = new Label
        {
            Text = LangManager.Get("Dashboard_DeviceInfo"),
            Font = infoTitleFont,
            ForeColor = Color.FromArgb(50, 50, 50),
            Dock = DockStyle.Top,
            Height = 28
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

        foreach (var row in infoRows.Reverse())
        {
            var rowPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = rowHeight,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                Padding = new Padding(0),
                Margin = new Padding(0, 0, 0, 4)
            };

            var lblKey = new Label
            {
                Text = row.Key,
                Font = infoKeyFont,
                ForeColor = Color.FromArgb(128, 128, 128),
                AutoSize = true,
                Margin = new Padding(0, 3, 8, 0)
            };

            var lblVal = new Label
            {
                Text = row.Value,
                Font = infoValFont,
                ForeColor = Color.FromArgb(50, 50, 50),
                AutoSize = true,
                MaximumSize = new Size(600, 0),
                Margin = new Padding(0, 3, 0, 0)
            };

            rowPanel.Controls.Add(lblKey);
            rowPanel.Controls.Add(lblVal);
            infoPanel.Controls.Add(rowPanel);
        }

        infoPanel.Controls.Add(lblInfoTitle);

        // -- 错误提示区域 --
        var errorPanel = new Panel
        {
            Dock = DockStyle.Top,
            Height = 0,
            Visible = false,
            BackColor = Color.FromArgb(255, 243, 224),
            Padding = new Padding(12),
            Margin = new Padding(0, 0, 0, 8)
        };
        var lblError = new Label
        {
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(191, 63, 0),
            Font = new Font("Microsoft YaHei UI", 9f)
        };
        errorPanel.Controls.Add(lblError);

        if (hasError)
        {
            lblError.Text = LangManager.Get("Dashboard_StartupError", _server.LastError!);
            errorPanel.Height = 40;
            errorPanel.Visible = true;
        }

        // -- 刷新按钮 --
        var btnRefresh = new Button
        {
            Text = LangManager.Get("Common_Refresh"),
            Size = new Size(72, 28),
            Margin = new Padding(0)
        };
        var btnBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 36,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 4, 0, 0)
        };
        btnBar.Controls.Add(btnRefresh);

        btnRefresh.Click += (s, e) =>
        {
            // 刷新服务状态卡片
            var err = !_server.IsRunning && _server.LastError != null;
            lblStatusVal.Text = _server.IsRunning ? LangManager.Get("Dashboard_Status_Running") : (err ? LangManager.Get("Dashboard_Status_Error") : LangManager.Get("Dashboard_Status_Stopped"));
            lblStatusVal.ForeColor = err ? colorError : colorRunning;
            cardStatus.Controls[1].BackColor = err ? colorError : colorRunning;
            lblPortVal.Text = _server.Port.ToString();
            lblWsVal.Text = _wsHandler.ConnectionCount.ToString();

            // 刷新打印队列状态
            RefreshQueueStatus(lblQueueVal, cardQueue, colorIdle, colorBusy);

            // 刷新错误区域
            if (err)
            {
                lblError.Text = LangManager.Get("Dashboard_StartupError", _server.LastError!);
                errorPanel.Height = 40;
                errorPanel.Visible = true;
            }
            else
            {
                errorPanel.Height = 0;
                errorPanel.Visible = false;
            }
        };

        // 添加顺序决定 Dock.Top 的视觉排列（后添加的更靠上）
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
            cardQueue.Controls[1].BackColor = hasActive ? colorBusy : colorIdle;
        }
        catch
        {
            lblQueueVal.Text = LangManager.Get("Dashboard_Status_Unknown");
            lblQueueVal.ForeColor = colorIdle;
        }
    }

    private Panel CreateCardPanel(Size size, Color accentColor, string title, string value, Font valueFont, Color valueColor, Font titleFont, out Label valueLabel)
    {
        var card = new Panel
        {
            BackColor = Color.White,
            Size = size,
            Margin = new Padding(0, 0, 12, 0),
            Padding = new Padding(0),
            BorderStyle = BorderStyle.FixedSingle
        };

        var accentBar = new Panel
        {
            Dock = DockStyle.Top,
            Height = 3,
            BackColor = accentColor
        };

        var contentPanel = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(8, 12, 8, 8)
        };

        var lblTitle = new Label
        {
            Text = title,
            Font = titleFont,
            ForeColor = Color.FromArgb(128, 128, 128),
            Dock = DockStyle.Top,
            TextAlign = ContentAlignment.MiddleCenter,
            Height = 20,
            Margin = new Padding(0)
        };

        valueLabel = new Label
        {
            Text = value,
            Font = valueFont,
            ForeColor = valueColor,
            Dock = DockStyle.Top,
            TextAlign = ContentAlignment.MiddleCenter,
            Height = 40,
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

        var listView = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            GridLines = true
        };
        listView.Columns.Add(LangManager.Get("Printers_ColName"), 250);
        listView.Columns.Add(LangManager.Get("Printers_ColDefault"), 50);
        listView.Columns.Add(LangManager.Get("Printers_ColStatus"), 100);
        listView.Columns.Add(LangManager.Get("Printers_ColOnline"), 60);
        listView.Columns.Add(LangManager.Get("Printers_ColPaper"), 60);

        var toolPanel = new Panel
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(8)
        };

        var btnRefresh = new Button
        {
            Text = LangManager.Get("Common_Refresh"),
            Dock = DockStyle.Left,
            Width = 80
        };
        btnRefresh.Click += (s, e) => RefreshPrinters(listView);

        toolPanel.Controls.Add(btnRefresh);

        tab.Controls.Add(listView);
        tab.Controls.Add(toolPanel);
        return tab;
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

        var listView = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            GridLines = true
        };
        listView.Columns.Add(LangManager.Get("Jobs_ColJobId"), 200);
        listView.Columns.Add(LangManager.Get("Jobs_ColPrinter"), 150);
        listView.Columns.Add(LangManager.Get("Jobs_ColStatus"), 100);
        listView.Columns.Add(LangManager.Get("Jobs_ColCreatedTime"), 150);
        listView.Columns.Add(LangManager.Get("Jobs_ColError"), 200);

        var toolPanel = new Panel
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(8)
        };

        var btnRefresh = new Button
        {
            Text = LangManager.Get("Common_Refresh"),
            Dock = DockStyle.Left,
            Width = 80
        };
        btnRefresh.Click += (s, e) => RefreshJobs(listView);

        toolPanel.Controls.Add(btnRefresh);

        tab.Controls.Add(listView);
        tab.Controls.Add(toolPanel);
        return tab;
    }

    private TabPage CreateLogsTab()
    {
        var tab = new TabPage(LangManager.Get("Logs_Tab"));

        var filterPanel = new Panel
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(8)
        };

        var flowLayout = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            AutoSize = false,
            Padding = new Padding(0)
        };

        var lblFrom = new Label { Text = LangManager.Get("Logs_From"), AutoSize = true, Margin = new Padding(0, 4, 4, 0) };
        var dtpFrom = new DateTimePicker { Width = 140, Format = DateTimePickerFormat.Short, Margin = new Padding(0, 0, 12, 0), Value = DateTime.Today.AddDays(-7) };
        var lblTo = new Label { Text = LangManager.Get("Logs_To"), AutoSize = true, Margin = new Padding(0, 4, 4, 0) };
        var dtpTo = new DateTimePicker { Width = 140, Format = DateTimePickerFormat.Short, Margin = new Padding(0, 0, 12, 0), Value = DateTime.Now };
        var btnQuery = new Button { Text = LangManager.Get("Common_Query"), Width = 70, Margin = new Padding(0) };

        flowLayout.Controls.AddRange(new Control[] { lblFrom, dtpFrom, lblTo, dtpTo, btnQuery });
        filterPanel.Controls.Add(flowLayout);

        var listView = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            GridLines = true
        };
        listView.Columns.Add(LangManager.Get("Logs_ColTime"), 150);
        listView.Columns.Add(LangManager.Get("Logs_ColPrinter"), 150);
        listView.Columns.Add(LangManager.Get("Logs_ColStatus"), 80);
        listView.Columns.Add(LangManager.Get("Logs_ColUser"), 100);
        listView.Columns.Add(LangManager.Get("Logs_ColJobId"), 200);
        listView.Columns.Add(LangManager.Get("Logs_ColError"), 200);

        btnQuery.Click += (s, e) => RefreshLogs(listView, dtpFrom.Value, dtpTo.Value);

        tab.Controls.Add(listView);
        tab.Controls.Add(filterPanel);
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

        var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16), AutoScroll = true };

        // 基本设置组
        var grpBasic = new GroupBox
        {
            Text = LangManager.Get("Settings_Basic"),
            Dock = DockStyle.Top,
            Height = 100,
            Padding = new Padding(12, 8, 12, 12)
        };

        var basicPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 2,
            Padding = new Padding(4)
        };
        basicPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        basicPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        basicPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        basicPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));

        var lblPort = new Label { Text = LangManager.Get("Settings_HttpPort"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var numPort = new NumericUpDown
        {
            Width = 120,
            Minimum = 1024,
            Maximum = 65535,
            Value = _config.HttpPort,
            Anchor = AnchorStyles.Left
        };

        var lblAutoStart = new Label { Text = LangManager.Get("Settings_AutoStart"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var chkAutoStart = new CheckBox
        {
            Text = "",
            Anchor = AnchorStyles.Left,
            Checked = HostConfig.GetAutoStartRegistry()
        };

        basicPanel.Controls.Add(lblPort, 0, 0);
        basicPanel.Controls.Add(numPort, 1, 0);
        basicPanel.Controls.Add(lblAutoStart, 0, 1);
        basicPanel.Controls.Add(chkAutoStart, 1, 1);
        grpBasic.Controls.Add(basicPanel);

        // 显示设置组
        var grpDisplay = new GroupBox
        {
            Text = LangManager.Get("Settings_Display"),
            Dock = DockStyle.Top,
            Height = 136,
            Padding = new Padding(12, 8, 12, 12)
        };

        var displayPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 3,
            Padding = new Padding(4)
        };
        displayPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        displayPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        displayPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        displayPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        displayPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));

        var chkMinimizeToTray = new CheckBox
        {
            Text = LangManager.Get("Settings_MinimizeToTray"),
            Anchor = AnchorStyles.Left,
            AutoSize = true,
            Checked = _config.MinimizeToTray
        };

        var chkStartMinimized = new CheckBox
        {
            Text = LangManager.Get("Settings_StartMinimized"),
            Anchor = AnchorStyles.Left,
            AutoSize = true,
            Checked = _config.StartMinimized
        };

        var lblLang = new Label { Text = LangManager.Get("Settings_Language"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var cmbLang = new ComboBox
        {
            Width = 120,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Anchor = AnchorStyles.Left
        };
        cmbLang.Items.Add(LangManager.Get("Settings_LanguageChinese"));
        cmbLang.Items.Add(LangManager.Get("Settings_LanguageEnglish"));
        cmbLang.SelectedIndex = _config.Language == "en-US" ? 1 : 0;

        displayPanel.Controls.Add(chkMinimizeToTray, 0, 0);
        displayPanel.SetColumnSpan(chkMinimizeToTray, 2);
        displayPanel.Controls.Add(chkStartMinimized, 0, 1);
        displayPanel.SetColumnSpan(chkStartMinimized, 2);
        displayPanel.Controls.Add(lblLang, 0, 2);
        displayPanel.Controls.Add(cmbLang, 1, 2);
        grpDisplay.Controls.Add(displayPanel);

        // 安全设置组
        var grpSecurity = new GroupBox
        {
            Text = LangManager.Get("Settings_Security"),
            Dock = DockStyle.Top,
            Height = 114,
            Padding = new Padding(12, 8, 12, 12)
        };

        var securityPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 2,
            Padding = new Padding(4)
        };
        securityPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        securityPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        securityPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        securityPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));

        var chkTrustAllOrigins = new CheckBox
        {
            Text = LangManager.Get("Settings_TrustAllOrigins"),
            Anchor = AnchorStyles.Left,
            AutoSize = true,
            Checked = _config.TrustAllOrigins
        };

        var lblApiKey = new Label { Text = LangManager.Get("Settings_ApiKey"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
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

        securityPanel.Controls.Add(chkTrustAllOrigins, 0, 0);
        securityPanel.SetColumnSpan(chkTrustAllOrigins, 2);
        securityPanel.Controls.Add(lblApiKey, 0, 1);
        securityPanel.Controls.Add(txtApiKey, 1, 1);
        grpSecurity.Controls.Add(securityPanel);

        // 打印兼容性设置组
        var grpPrinterCompat = new GroupBox
        {
            Text = LangManager.Get("Settings_PrinterCompat"),
            Dock = DockStyle.Top,
            Height = 404,
            Padding = new Padding(12, 8, 12, 12)
        };

        var compatPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 8,
            Padding = new Padding(4)
        };
        compatPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        compatPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        compatPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));  // low dpi enhancement label
        compatPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));  // low dpi enhancement description
        compatPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));  // raw printer label
        compatPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));  // raw printer description
        compatPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));  // Sumatra path
        compatPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));  // Sumatra printers
        compatPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));  // Sumatra settings
        compatPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 86));  // Sumatra description

        var lblLowDpiEnhancement = new Label { Text = LangManager.Get("Settings_LowDpiEnhancementLabel"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
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

        var lblLowDpiEnhancementDesc = new Label
        {
            Text = LangManager.Get("Settings_LowDpiEnhancementDescription"),
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.TopLeft,
            ForeColor = System.Drawing.SystemColors.GrayText
        };

        // Raw printer names row
        var lblRawPrinters = new Label { Text = LangManager.Get("Settings_RawPrinterLabel"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var txtRawPrinters = new TextBox
        {
            Dock = DockStyle.Fill,
            Text = string.Join(", ", _config.RawPrinterNames)
        };
        var lblRawPrintersDesc = new Label
        {
            Text = LangManager.Get("Settings_RawPrinterDescription"),
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.TopLeft,
            ForeColor = System.Drawing.SystemColors.GrayText
        };

        var lblSumatraPath = new Label { Text = LangManager.Get("Settings_SumatraPathLabel"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var pnlSumatraPath = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            Margin = new Padding(0)
        };
        pnlSumatraPath.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        pnlSumatraPath.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 64));
        var txtSumatraPath = new TextBox
        {
            Dock = DockStyle.Fill,
            Text = string.IsNullOrWhiteSpace(_config.SumatraPdfPath)
                ? HostConfig.DefaultSumatraPdfPath
                : _config.SumatraPdfPath
        };
        var btnBrowseSumatra = new Button
        {
            Text = LangManager.Get("Common_Browse"),
            Dock = DockStyle.Fill
        };
        btnBrowseSumatra.Click += (s, e) =>
        {
            using var dlg = new OpenFileDialog
            {
                Title = LangManager.Get("Dialog_SumatraPdfPath"),
                Filter = LangManager.Get("Dialog_ExeFileFilter"),
                FileName = "SumatraPDF.exe",
                InitialDirectory = string.IsNullOrWhiteSpace(txtSumatraPath.Text)
                    ? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
                    : Path.GetDirectoryName(txtSumatraPath.Text)
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                txtSumatraPath.Text = dlg.FileName;
        };
        pnlSumatraPath.Controls.Add(txtSumatraPath, 0, 0);
        pnlSumatraPath.Controls.Add(btnBrowseSumatra, 1, 0);

        var lblSumatraPrinters = new Label { Text = LangManager.Get("Settings_SumatraPrintersLabel"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var txtSumatraPrinters = new TextBox
        {
            Dock = DockStyle.Fill,
            Text = string.Join(", ", _config.SumatraPrinterNames)
        };

        var lblSumatraSettings = new Label { Text = LangManager.Get("Settings_SumatraSettingsLabel"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var pnlSumatraSettings = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
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

        var lblSumatraDesc = new Label
        {
            Text = LangManager.Get("Settings_SumatraDescription"),
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.TopLeft,
            ForeColor = System.Drawing.SystemColors.GrayText
        };

        compatPanel.Controls.Add(lblLowDpiEnhancement, 0, 0);
        compatPanel.Controls.Add(cmbLowDpiEnhancement, 1, 0);
        compatPanel.Controls.Add(lblLowDpiEnhancementDesc, 0, 1);
        compatPanel.SetColumnSpan(lblLowDpiEnhancementDesc, 2);
        compatPanel.Controls.Add(lblRawPrinters, 0, 2);
        compatPanel.Controls.Add(txtRawPrinters, 1, 2);
        compatPanel.Controls.Add(lblRawPrintersDesc, 0, 3);
        compatPanel.SetColumnSpan(lblRawPrintersDesc, 2);
        compatPanel.Controls.Add(lblSumatraPath, 0, 4);
        compatPanel.Controls.Add(pnlSumatraPath, 1, 4);
        compatPanel.Controls.Add(lblSumatraPrinters, 0, 5);
        compatPanel.Controls.Add(txtSumatraPrinters, 1, 5);
        compatPanel.Controls.Add(lblSumatraSettings, 0, 6);
        compatPanel.Controls.Add(pnlSumatraSettings, 1, 6);
        compatPanel.Controls.Add(lblSumatraDesc, 0, 7);
        compatPanel.SetColumnSpan(lblSumatraDesc, 2);
        grpPrinterCompat.Controls.Add(compatPanel);

        // 路径设置组
        var grpPath = new GroupBox
        {
            Text = LangManager.Get("Settings_Path"),
            Dock = DockStyle.Top,
            Height = 190,
            Padding = new Padding(12, 8, 12, 12)
        };

        var pathPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 3,
            Padding = new Padding(4)
        };
        pathPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        pathPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        pathPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 60));
        pathPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        pathPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        pathPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));

        var lblDbPath = new Label { Text = LangManager.Get("Settings_DbPath"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var txtDbPath = new TextBox
        {
            Text = string.IsNullOrWhiteSpace(_config.DbPath) ? HostConfig.DefaultDbPath : _config.DbPath,
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };
        var btnBrowseDb = new Button
        {
            Text = LangManager.Get("Common_Browse"),
            Width = 52,
            Anchor = AnchorStyles.Left
        };
        btnBrowseDb.Click += (s, e) =>
        {
            using var dlg = new SaveFileDialog
            {
                Title = LangManager.Get("Dialog_DbFileLocation"),
                Filter = LangManager.Get("Dialog_DbFileFilter"),
                FileName = "audit.db",
                InitialDirectory = Path.GetDirectoryName(txtDbPath.Text)
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                txtDbPath.Text = dlg.FileName;
        };

        var lblCrashDir = new Label { Text = LangManager.Get("Settings_CrashLogDir"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var txtCrashDir = new TextBox
        {
            Text = string.IsNullOrWhiteSpace(_config.CrashLogDir) ? HostConfig.DefaultCrashLogDir : _config.CrashLogDir,
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };
        var btnBrowseCrash = new Button
        {
            Text = LangManager.Get("Common_Browse"),
            Width = 52,
            Anchor = AnchorStyles.Left
        };
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

        var lblSumatraTempDir = new Label { Text = LangManager.Get("Settings_SumatraTempDir"), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        var txtSumatraTempDir = new TextBox
        {
            Text = string.IsNullOrWhiteSpace(_config.SumatraTempDir)
                ? HostConfig.DefaultSumatraTempDir
                : _config.SumatraTempDir,
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };
        var btnBrowseSumatraTemp = new Button
        {
            Text = LangManager.Get("Common_Browse"),
            Width = 52,
            Anchor = AnchorStyles.Left
        };
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

        pathPanel.Controls.Add(lblDbPath, 0, 0);
        pathPanel.Controls.Add(txtDbPath, 1, 0);
        pathPanel.Controls.Add(btnBrowseDb, 2, 0);
        pathPanel.Controls.Add(lblCrashDir, 0, 1);
        pathPanel.Controls.Add(txtCrashDir, 1, 1);
        pathPanel.Controls.Add(btnBrowseCrash, 2, 1);
        pathPanel.Controls.Add(lblSumatraTempDir, 0, 2);
        pathPanel.Controls.Add(txtSumatraTempDir, 1, 2);
        pathPanel.Controls.Add(btnBrowseSumatraTemp, 2, 2);
        grpPath.Controls.Add(pathPanel);

        // 保存按钮
        var btnSave = new Button
        {
            Text = LangManager.Get("Common_Save"),
            Dock = DockStyle.Top,
            Height = 32,
            Margin = new Padding(0, 12, 0, 0)
        };
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
                : txtSumatraPath.Text.Trim();
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

        panel.Controls.Add(btnSave);
        panel.Controls.Add(grpPath);
        panel.Controls.Add(grpPrinterCompat);
        panel.Controls.Add(grpSecurity);
        panel.Controls.Add(grpDisplay);
        panel.Controls.Add(grpBasic);
        tab.Controls.Add(panel);
        return tab;
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
