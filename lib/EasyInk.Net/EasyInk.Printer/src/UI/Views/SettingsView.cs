using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyInk.Printer.Config;
using EasyInk.Printer.Services;
using EasyInk.Printer.UI.Controls;
using EasyInk.Printer.UI.Presenters;

namespace EasyInk.Printer.UI.Views;

internal sealed class SettingsView : UserControl, ISettingsView, IActivatableTab
{
    private readonly SettingsPresenter _presenter;
    private readonly NumericUpDown _numPort;
    private readonly NoFocusCheckBox _chkAutoStart;
    private readonly NoFocusCheckBox _chkMinimizeToTray;
    private readonly NoFocusCheckBox _chkStartMinimized;
    private readonly ComboBox _cmbLang;
    private readonly NoFocusCheckBox _chkTrustAllOrigins;
    private readonly TextBox _txtApiKey;
    private readonly ComboBox _cmbLowDpiEnhancement;
    private readonly TextBox _txtRawPrinters;
    private readonly TextBox _txtSumatraPath;
    private readonly TextBox _txtSumatraPrinters;
    private readonly TextBox _txtSumatraSettings;
    private readonly NumericUpDown _numSumatraTimeout;
    private readonly NoFocusCheckBox _chkRenderEnabled;
    private readonly TextBox _txtRenderHostPath;
    private readonly Label _lblRenderHostVersion;
    private readonly ComboBox _cmbRenderBrowserVersion;
    private readonly Button _btnRenderBrowserDownload;
    private readonly ComboBox _cmbRenderHeadlessMode;
    private readonly TextBox _txtRenderBrowserDir;
    private readonly NumericUpDown _numRenderTimeout;
    private readonly NumericUpDown _numRenderIdleTimeout;
    private readonly NumericUpDown _numRenderMaxConcurrency;
    private readonly NumericUpDown _numRenderMaxQueueSize;
    private readonly TextBox _txtRenderLogDir;
    private readonly Button _btnRenderDaemonStart;
    private readonly Button _btnRenderDaemonStop;
    private readonly NoFocusCheckBox _chkRenderDiagnostics;
    private readonly TextBox _txtDbPath;
    private readonly TextBox _txtCrashDir;
    private readonly TextBox _txtSumatraTempDir;
    private readonly NoFocusCheckBox _chkPrintDebugLogging;
    private readonly NumericUpDown _numAuditLogRetentionDays;
    private readonly NumericUpDown _numFileLogRetentionDays;
    private readonly NumericUpDown _numPrintDebugArtifactRetentionCount;
    private readonly TextBox _txtPrintDebugArtifactsDir;
    private readonly string _apiKeyPlaceholder;

    public event Action? RestartRequested;

    public SettingsView(SettingsPresenter presenter)
    {
        _presenter = presenter;
        _apiKeyPlaceholder = LangManager.Get("Settings_ApiKeyPlaceholder");
        Title = LangManager.Get("Settings_Tab");
        Dock = DockStyle.Fill;
        BackColor = UiTheme.PageBackColor;

        SuspendLayout();
        var panel = UiFactory.CreatePagePanel(new Padding(16));
        panel.SuspendLayout();
        panel.AutoScroll = true;

        var settingsLayout = UiFactory.CreateSettingsLayoutPanel();
        settingsLayout.SuspendLayout();
        panel.Controls.Add(settingsLayout);

        var grpBasic = UiFactory.CreateSettingsSection(LangManager.Get("Settings_Basic"));
        var basicPanel = UiFactory.CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100));
        _numPort = new NumericUpDown
        {
            Width = 120,
            Minimum = 1024,
            Maximum = 65535,
            Anchor = AnchorStyles.Left
        };
        _chkAutoStart = new NoFocusCheckBox
        {
            Text = string.Empty,
            Anchor = AnchorStyles.Left
        };
        UiFactory.AddSettingRow(basicPanel, LangManager.Get("Settings_HttpPort"), _numPort);
        UiFactory.AddSettingRow(basicPanel, LangManager.Get("Settings_AutoStart"), _chkAutoStart);
        grpBasic.ContentPanel.Controls.Add(basicPanel);

        var grpDisplay = UiFactory.CreateSettingsSection(LangManager.Get("Settings_Display"));
        var displayPanel = UiFactory.CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100));
        _chkMinimizeToTray = new NoFocusCheckBox
        {
            Text = LangManager.Get("Settings_MinimizeToTray"),
            Anchor = AnchorStyles.Left,
            AutoSize = true
        };
        _chkStartMinimized = new NoFocusCheckBox
        {
            Text = LangManager.Get("Settings_StartMinimized"),
            Anchor = AnchorStyles.Left,
            AutoSize = true
        };
        _cmbLang = new ComboBox
        {
            Width = 120,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Anchor = AnchorStyles.Left
        };
        _cmbLang.Items.Add(LangManager.Get("Settings_LanguageChinese"));
        _cmbLang.Items.Add(LangManager.Get("Settings_LanguageEnglish"));
        UiFactory.AddSettingWideRow(displayPanel, _chkMinimizeToTray);
        UiFactory.AddSettingWideRow(displayPanel, _chkStartMinimized);
        UiFactory.AddSettingRow(displayPanel, LangManager.Get("Settings_Language"), _cmbLang);
        grpDisplay.ContentPanel.Controls.Add(displayPanel);

        var grpSecurity = UiFactory.CreateSettingsSection(LangManager.Get("Settings_Security"));
        var securityPanel = UiFactory.CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100));
        _chkTrustAllOrigins = new NoFocusCheckBox
        {
            Text = LangManager.Get("Settings_TrustAllOrigins"),
            Anchor = AnchorStyles.Left,
            AutoSize = true
        };
        _txtApiKey = new TextBox
        {
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };
        _txtApiKey.GotFocus += (s, e) => ClearApiKeyPlaceholder();
        _txtApiKey.LostFocus += (s, e) => ApplyApiKeyPlaceholderIfEmpty();
        UiFactory.AddSettingWideRow(securityPanel, _chkTrustAllOrigins);
        UiFactory.AddSettingRow(securityPanel, LangManager.Get("Settings_ApiKey"), _txtApiKey);
        grpSecurity.ContentPanel.Controls.Add(securityPanel);

        var grpPrinterCompat = UiFactory.CreateSettingsSection(LangManager.Get("Settings_PrinterCompat"));
        var compatPanel = UiFactory.CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100));
        _cmbLowDpiEnhancement = new ComboBox
        {
            Width = 180,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Anchor = AnchorStyles.Left
        };
        _cmbLowDpiEnhancement.Items.Add(LangManager.Get("Settings_LowDpiEnhancementNormal"));
        _cmbLowDpiEnhancement.Items.Add(LangManager.Get("Settings_LowDpiEnhancementBoost"));
        _cmbLowDpiEnhancement.Items.Add(LangManager.Get("Settings_LowDpiEnhancementMonochrome"));

        _txtRawPrinters = new TextBox { Dock = DockStyle.Fill };

        var pnlSumatraPath = UiFactory.CreateSettingsTable(
            new ColumnStyle(SizeType.Percent, 100),
            new ColumnStyle(SizeType.Absolute, 68));
        pnlSumatraPath.Padding = new Padding(0);
        _txtSumatraPath = new TextBox { Dock = DockStyle.Fill };
        var btnBrowseSumatra = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Browse"), 64);
        btnBrowseSumatra.Dock = DockStyle.Fill;
        btnBrowseSumatra.Click += (s, e) => BrowseSumatraPath();
        UiFactory.AddSettingControlRow(pnlSumatraPath, _txtSumatraPath, btnBrowseSumatra);

        _txtSumatraPrinters = new TextBox { Dock = DockStyle.Fill };

        var pnlSumatraSettings = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Margin = new Padding(0)
        };
        _txtSumatraSettings = new TextBox { Width = 180 };
        var lblSumatraTimeout = new Label
        {
            Text = LangManager.Get("Settings_SumatraTimeoutLabel"),
            AutoSize = true,
            Margin = new Padding(12, 6, 4, 0)
        };
        _numSumatraTimeout = new NumericUpDown
        {
            Width = 70,
            Minimum = 5,
            Maximum = 300,
            Anchor = AnchorStyles.Left
        };
        pnlSumatraSettings.Controls.Add(_txtSumatraSettings);
        pnlSumatraSettings.Controls.Add(lblSumatraTimeout);
        pnlSumatraSettings.Controls.Add(_numSumatraTimeout);

        UiFactory.AddSettingRow(compatPanel, LangManager.Get("Settings_LowDpiEnhancementLabel"), _cmbLowDpiEnhancement);
        UiFactory.AddSettingDescriptionRow(compatPanel, LangManager.Get("Settings_LowDpiEnhancementDescription"));
        UiFactory.AddSettingRow(compatPanel, LangManager.Get("Settings_RawPrinterLabel"), _txtRawPrinters);
        UiFactory.AddSettingDescriptionRow(compatPanel, LangManager.Get("Settings_RawPrinterDescription"));
        UiFactory.AddSettingRow(compatPanel, LangManager.Get("Settings_SumatraPathLabel"), pnlSumatraPath);
        UiFactory.AddSettingRow(compatPanel, LangManager.Get("Settings_SumatraPrintersLabel"), _txtSumatraPrinters);
        UiFactory.AddSettingRow(compatPanel, LangManager.Get("Settings_SumatraSettingsLabel"), pnlSumatraSettings);
        UiFactory.AddSettingDescriptionRow(compatPanel, LangManager.Get("Settings_SumatraDescription"));
        grpPrinterCompat.ContentPanel.Controls.Add(compatPanel);

        var grpRender = UiFactory.CreateSettingsSection(LangManager.Get("Settings_Render"));
        var renderPanel = UiFactory.CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 140),
            new ColumnStyle(SizeType.Percent, 100),
            new ColumnStyle(SizeType.Absolute, 72));
        _chkRenderEnabled = new NoFocusCheckBox
        {
            Text = LangManager.Get("Settings_RenderEnabled"),
            Anchor = AnchorStyles.Left,
            AutoSize = true
        };
        var pnlRenderHostPath = UiFactory.CreateSettingsTable(
            new ColumnStyle(SizeType.Percent, 100),
            new ColumnStyle(SizeType.Absolute, 68));
        pnlRenderHostPath.Padding = new Padding(0);
        _txtRenderHostPath = new TextBox
        {
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };
        _txtRenderHostPath.Leave += (s, e) => RefreshRenderHostVersion();
        var btnBrowseRenderHost = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Browse"), 64);
        btnBrowseRenderHost.Dock = DockStyle.Fill;
        btnBrowseRenderHost.Click += (s, e) => BrowseRenderHostPath();
        UiFactory.AddSettingControlRow(pnlRenderHostPath, _txtRenderHostPath, btnBrowseRenderHost);
        _lblRenderHostVersion = new Label
        {
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(0, 6, 0, 0)
        };
        _cmbRenderBrowserVersion = new ComboBox
        {
            Width = 260,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Anchor = AnchorStyles.Left
        };
        foreach (var option in RenderBrowserVersionCatalog.Options)
            _cmbRenderBrowserVersion.Items.Add(option);
        _btnRenderBrowserDownload = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Download"), 68);
        _btnRenderBrowserDownload.Anchor = AnchorStyles.Left;
        _btnRenderBrowserDownload.Click += async (s, e) => await DownloadRenderBrowser();
        _cmbRenderHeadlessMode = new ComboBox
        {
            Width = 180,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Anchor = AnchorStyles.Left
        };
        foreach (var option in RenderHeadlessModeCatalog.Options)
            _cmbRenderHeadlessMode.Items.Add(option);
        _txtRenderBrowserDir = new TextBox
        {
            Dock = DockStyle.Fill,
            Anchor = AnchorStyles.Left | AnchorStyles.Right
        };
        var btnBrowseRenderBrowserDir = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Browse"), 68);
        btnBrowseRenderBrowserDir.Anchor = AnchorStyles.Left;
        btnBrowseRenderBrowserDir.Click += (s, e) => BrowseRenderBrowserDir();

        var pnlRenderLimits = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Margin = new Padding(0)
        };
        _numRenderTimeout = new NumericUpDown { Width = 90, Minimum = 1000, Maximum = 600000, Increment = 1000, Anchor = AnchorStyles.Left };
        _numRenderIdleTimeout = new NumericUpDown { Width = 90, Minimum = 0, Maximum = 3600000, Increment = 1000, Anchor = AnchorStyles.Left };
        _numRenderMaxConcurrency = new NumericUpDown { Width = 60, Minimum = 1, Maximum = 32, Anchor = AnchorStyles.Left };
        _numRenderMaxQueueSize = new NumericUpDown { Width = 60, Minimum = 0, Maximum = 10000, Anchor = AnchorStyles.Left };
        pnlRenderLimits.Controls.Add(CreateInlineLabel(LangManager.Get("Settings_RenderTimeoutLabel")));
        pnlRenderLimits.Controls.Add(_numRenderTimeout);
        pnlRenderLimits.Controls.Add(CreateInlineLabel(LangManager.Get("Settings_RenderIdleTimeoutLabel")));
        pnlRenderLimits.Controls.Add(_numRenderIdleTimeout);
        pnlRenderLimits.Controls.Add(CreateInlineLabel(LangManager.Get("Settings_RenderConcurrencyLabel")));
        pnlRenderLimits.Controls.Add(_numRenderMaxConcurrency);
        pnlRenderLimits.Controls.Add(CreateInlineLabel(LangManager.Get("Settings_RenderQueueLabel")));
        pnlRenderLimits.Controls.Add(_numRenderMaxQueueSize);

        _txtRenderLogDir = new TextBox { Dock = DockStyle.Fill, Anchor = AnchorStyles.Left | AnchorStyles.Right };
        var btnBrowseRenderLogDir = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Browse"), 56);
        btnBrowseRenderLogDir.Anchor = AnchorStyles.Left;
        btnBrowseRenderLogDir.Click += (s, e) => BrowseRenderLogDir();
        var pnlRenderDaemonControls = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Margin = new Padding(0)
        };
        _btnRenderDaemonStart = UiFactory.CreateSecondaryButton(LangManager.Get("Settings_RenderDaemonStart"), 76);
        _btnRenderDaemonStart.Click += async (s, e) => await StartRenderDaemon();
        _btnRenderDaemonStop = UiFactory.CreateSecondaryButton(LangManager.Get("Settings_RenderDaemonStop"), 76);
        _btnRenderDaemonStop.Margin = new Padding(8, 0, 0, 0);
        _btnRenderDaemonStop.Click += async (s, e) => await StopRenderDaemon();
        pnlRenderDaemonControls.Controls.Add(_btnRenderDaemonStart);
        pnlRenderDaemonControls.Controls.Add(_btnRenderDaemonStop);
        _chkRenderDiagnostics = new NoFocusCheckBox
        {
            Text = LangManager.Get("Settings_RenderDiagnostics"),
            Anchor = AnchorStyles.Left,
            AutoSize = true
        };

        UiFactory.AddSettingWideRow(renderPanel, _chkRenderEnabled);
        UiFactory.AddSettingRow(renderPanel, LangManager.Get("Settings_RenderHostPath"), pnlRenderHostPath);
        UiFactory.AddSettingRow(renderPanel, LangManager.Get("Settings_RenderHostVersion"), _lblRenderHostVersion);
        UiFactory.AddSettingRow(renderPanel, LangManager.Get("Settings_RenderBrowserVersion"), _cmbRenderBrowserVersion, _btnRenderBrowserDownload);
        UiFactory.AddSettingRow(renderPanel, LangManager.Get("Settings_RenderHeadlessMode"), _cmbRenderHeadlessMode);
        UiFactory.AddSettingRow(renderPanel, LangManager.Get("Settings_RenderBrowserDir"), _txtRenderBrowserDir, btnBrowseRenderBrowserDir);
        UiFactory.AddSettingRow(renderPanel, LangManager.Get("Settings_RenderLimitsLabel"), pnlRenderLimits);
        UiFactory.AddSettingRow(renderPanel, LangManager.Get("Settings_RenderLogDir"), _txtRenderLogDir, btnBrowseRenderLogDir);
        UiFactory.AddSettingRow(renderPanel, LangManager.Get("Settings_RenderDaemonControls"), pnlRenderDaemonControls);
        UiFactory.AddSettingWideRow(renderPanel, _chkRenderDiagnostics);
        UiFactory.AddSettingDescriptionRow(renderPanel, LangManager.Get("Settings_RenderDescription"));
        grpRender.ContentPanel.Controls.Add(renderPanel);

        var grpPath = UiFactory.CreateSettingsSection(LangManager.Get("Settings_Path"));
        var pathPanel = UiFactory.CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 110),
            new ColumnStyle(SizeType.Percent, 100),
            new ColumnStyle(SizeType.Absolute, 64));
        _txtDbPath = new TextBox { Dock = DockStyle.Fill, Anchor = AnchorStyles.Left | AnchorStyles.Right };
        var btnBrowseDb = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Browse"), 56);
        btnBrowseDb.Anchor = AnchorStyles.Left;
        btnBrowseDb.Click += (s, e) => BrowseDbPath();
        _txtCrashDir = new TextBox { Dock = DockStyle.Fill, Anchor = AnchorStyles.Left | AnchorStyles.Right };
        var btnBrowseCrash = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Browse"), 56);
        btnBrowseCrash.Anchor = AnchorStyles.Left;
        btnBrowseCrash.Click += (s, e) => BrowseCrashDir();
        _txtSumatraTempDir = new TextBox { Dock = DockStyle.Fill, Anchor = AnchorStyles.Left | AnchorStyles.Right };
        var btnBrowseSumatraTemp = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Browse"), 56);
        btnBrowseSumatraTemp.Anchor = AnchorStyles.Left;
        btnBrowseSumatraTemp.Click += (s, e) => BrowseSumatraTempDir();

        UiFactory.AddSettingRow(pathPanel, LangManager.Get("Settings_DbPath"), _txtDbPath, btnBrowseDb);
        UiFactory.AddSettingRow(pathPanel, LangManager.Get("Settings_CrashLogDir"), _txtCrashDir, btnBrowseCrash);
        UiFactory.AddSettingRow(pathPanel, LangManager.Get("Settings_SumatraTempDir"), _txtSumatraTempDir, btnBrowseSumatraTemp);
        grpPath.ContentPanel.Controls.Add(pathPanel);

        var grpLogging = UiFactory.CreateSettingsSection(LangManager.Get("Settings_Logging"));
        var loggingPanel = UiFactory.CreateSettingsTable(
            new ColumnStyle(SizeType.Absolute, 140),
            new ColumnStyle(SizeType.Percent, 100),
            new ColumnStyle(SizeType.Absolute, 64));
        _chkPrintDebugLogging = new NoFocusCheckBox
        {
            Text = LangManager.Get("Settings_PrintDebugLogging"),
            Anchor = AnchorStyles.Left,
            AutoSize = true
        };
        _numAuditLogRetentionDays = new NumericUpDown
        {
            Width = 90,
            Minimum = 1,
            Maximum = 3650,
            Anchor = AnchorStyles.Left
        };
        _numFileLogRetentionDays = new NumericUpDown
        {
            Width = 90,
            Minimum = 1,
            Maximum = 3650,
            Anchor = AnchorStyles.Left
        };
        _numPrintDebugArtifactRetentionCount = new NumericUpDown
        {
            Width = 90,
            Minimum = 1,
            Maximum = 10000,
            Anchor = AnchorStyles.Left
        };
        _txtPrintDebugArtifactsDir = new TextBox { Dock = DockStyle.Fill, Anchor = AnchorStyles.Left | AnchorStyles.Right };
        var btnBrowsePrintDebugArtifacts = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Browse"), 56);
        btnBrowsePrintDebugArtifacts.Anchor = AnchorStyles.Left;
        btnBrowsePrintDebugArtifacts.Click += (s, e) => BrowsePrintDebugArtifactsDir();

        UiFactory.AddSettingWideRow(loggingPanel, _chkPrintDebugLogging);
        UiFactory.AddSettingDescriptionRow(loggingPanel, LangManager.Get("Settings_PrintDebugLoggingDescription"));
        UiFactory.AddSettingRow(loggingPanel, LangManager.Get("Settings_AuditRetentionDays"), _numAuditLogRetentionDays);
        UiFactory.AddSettingRow(loggingPanel, LangManager.Get("Settings_FileLogRetentionDays"), _numFileLogRetentionDays);
        UiFactory.AddSettingRow(loggingPanel, LangManager.Get("Settings_PrintDebugArtifactRetentionCount"), _numPrintDebugArtifactRetentionCount);
        UiFactory.AddSettingRow(loggingPanel, LangManager.Get("Settings_PrintDebugArtifactsDir"), _txtPrintDebugArtifactsDir, btnBrowsePrintDebugArtifacts);
        grpLogging.ContentPanel.Controls.Add(loggingPanel);

        var btnSave = UiFactory.CreateCommandButton(LangManager.Get("Common_Save"), 84);
        btnSave.Margin = new Padding(0);
        btnSave.Click += (s, e) => _presenter.Save();
        var saveBar = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(0),
            BackColor = UiTheme.PageBackColor
        };
        saveBar.Controls.Add(btnSave);

        UiFactory.StyleSettingsSection(grpBasic);
        UiFactory.StyleSettingsSection(grpDisplay);
        UiFactory.StyleSettingsSection(grpSecurity);
        UiFactory.StyleSettingsSection(grpPrinterCompat);
        UiFactory.StyleSettingsSection(grpRender);
        UiFactory.StyleSettingsSection(grpPath);
        UiFactory.StyleSettingsSection(grpLogging);

        UiFactory.AddSettingsBlock(settingsLayout, grpBasic);
        UiFactory.AddSettingsBlock(settingsLayout, grpDisplay);
        UiFactory.AddSettingsBlock(settingsLayout, grpSecurity);
        UiFactory.AddSettingsBlock(settingsLayout, grpPrinterCompat);
        UiFactory.AddSettingsBlock(settingsLayout, grpRender);
        UiFactory.AddSettingsBlock(settingsLayout, grpPath);
        UiFactory.AddSettingsBlock(settingsLayout, grpLogging);
        UiFactory.AddSettingsBlock(settingsLayout, saveBar, 0);
        Controls.Add(panel);

        _presenter.Attach(this);

        settingsLayout.ResumeLayout(false);
        panel.ResumeLayout(false);
        ResumeLayout(false);
    }

    public string Title { get; }
    public Control View => this;

    public System.Threading.Tasks.Task ActivateAsync()
    {
        return System.Threading.Tasks.Task.CompletedTask;
    }

    public void SetModel(SettingsFormModel model)
    {
        _numPort.Value = model.HttpPort;
        _chkAutoStart.Checked = model.AutoStart;
        _chkMinimizeToTray.Checked = model.MinimizeToTray;
        _chkStartMinimized.Checked = model.StartMinimized;
        _chkTrustAllOrigins.Checked = model.TrustAllOrigins;
        _cmbLang.SelectedIndex = model.Language == "en-US" ? 1 : 0;
        _cmbLowDpiEnhancement.SelectedIndex = model.LowDpiEnhancementIndex;
        _txtRawPrinters.Text = model.RawPrinterNamesText;
        _txtSumatraPath.Text = model.SumatraPdfPath;
        _txtSumatraPrinters.Text = model.SumatraPrinterNamesText;
        _txtSumatraSettings.Text = model.SumatraPrintSettings;
        _numSumatraTimeout.Value = model.SumatraTimeoutSeconds;
        _txtDbPath.Text = model.DbPath;
        _txtCrashDir.Text = model.CrashLogDir;
        _txtSumatraTempDir.Text = model.SumatraTempDir;
        _chkPrintDebugLogging.Checked = model.PrintDebugLoggingEnabled;
        _numAuditLogRetentionDays.Value = model.AuditLogRetentionDays;
        _numFileLogRetentionDays.Value = model.FileLogRetentionDays;
        _numPrintDebugArtifactRetentionCount.Value = model.PrintDebugArtifactRetentionCount;
        _txtPrintDebugArtifactsDir.Text = model.PrintDebugArtifactsDir;
        _chkRenderEnabled.Checked = model.RenderEnabled;
        _txtRenderHostPath.Text = model.RenderHostPath;
        _lblRenderHostVersion.Text = model.RenderHostVersion;
        SelectRenderBrowserVersion(model.RenderBrowserVersion);
        _txtRenderBrowserDir.Text = model.RenderBrowserDir;
        SelectRenderHeadlessMode(model.RenderBrowserHeadlessMode);
        _numRenderTimeout.Value = model.RenderRequestTimeoutMs;
        _numRenderIdleTimeout.Value = model.RenderIdleTimeoutMs;
        _numRenderMaxConcurrency.Value = model.RenderMaxConcurrency;
        _numRenderMaxQueueSize.Value = model.RenderMaxQueueSize;
        _txtRenderLogDir.Text = model.RenderLogDir;
        _chkRenderDiagnostics.Checked = model.RenderDiagnosticsEnabled;
        SetApiKey(model.ApiKey);
    }

    public SettingsFormModel GetModel()
    {
        return new SettingsFormModel
        {
            HttpPort = (int)_numPort.Value,
            AutoStart = _chkAutoStart.Checked,
            MinimizeToTray = _chkMinimizeToTray.Checked,
            StartMinimized = _chkStartMinimized.Checked,
            TrustAllOrigins = _chkTrustAllOrigins.Checked,
            ApiKey = GetApiKeyValue(),
            Language = _cmbLang.SelectedIndex == 1 ? "en-US" : string.Empty,
            LowDpiEnhancementIndex = _cmbLowDpiEnhancement.SelectedIndex,
            RawPrinterNamesText = _txtRawPrinters.Text ?? string.Empty,
            SumatraPdfPath = _txtSumatraPath.Text ?? string.Empty,
            SumatraPrinterNamesText = _txtSumatraPrinters.Text ?? string.Empty,
            SumatraPrintSettings = _txtSumatraSettings.Text ?? string.Empty,
            SumatraTimeoutSeconds = (int)_numSumatraTimeout.Value,
            DbPath = _txtDbPath.Text ?? string.Empty,
            CrashLogDir = _txtCrashDir.Text ?? string.Empty,
            SumatraTempDir = _txtSumatraTempDir.Text ?? string.Empty,
            PrintDebugLoggingEnabled = _chkPrintDebugLogging.Checked,
            AuditLogRetentionDays = (int)_numAuditLogRetentionDays.Value,
            FileLogRetentionDays = (int)_numFileLogRetentionDays.Value,
            PrintDebugArtifactRetentionCount = (int)_numPrintDebugArtifactRetentionCount.Value,
            PrintDebugArtifactsDir = _txtPrintDebugArtifactsDir.Text ?? string.Empty,
            RenderEnabled = _chkRenderEnabled.Checked,
            RenderHostPath = _txtRenderHostPath.Text ?? string.Empty,
            RenderBrowserVersion = GetSelectedRenderBrowserVersionKey(),
            RenderBrowserDir = _txtRenderBrowserDir.Text ?? string.Empty,
            RenderBrowserHeadlessMode = GetSelectedRenderHeadlessModeKey(),
            RenderRequestTimeoutMs = (int)_numRenderTimeout.Value,
            RenderIdleTimeoutMs = (int)_numRenderIdleTimeout.Value,
            RenderMaxConcurrency = (int)_numRenderMaxConcurrency.Value,
            RenderMaxQueueSize = (int)_numRenderMaxQueueSize.Value,
            RenderLogDir = _txtRenderLogDir.Text ?? string.Empty,
            RenderDiagnosticsEnabled = _chkRenderDiagnostics.Checked
        };
    }

    public void ShowValidationError(SettingsField field, string message)
    {
        MessageBox.Show(message, LangManager.Get("Common_Error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
        FocusField(field);
    }

    public void ShowSaveError(string message)
    {
        MessageBox.Show(message, LangManager.Get("Common_Error"), MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    public bool ConfirmRestart()
    {
        var result = MessageBox.Show(
            LangManager.Get("Prompt_SavedRestart"),
            LangManager.Get("Common_Confirm"),
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);
        return result == DialogResult.Yes;
    }

    public void ShowDelayedApply()
    {
        MessageBox.Show(LangManager.Get("Prompt_DelayedApply"), LangManager.Get("Common_Info"), MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    public void RequestRestart()
    {
        RestartRequested?.Invoke();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            _presenter.Dispose();

        base.Dispose(disposing);
    }

    private void SetApiKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            _txtApiKey.Text = _apiKeyPlaceholder;
            _txtApiKey.ForeColor = System.Drawing.SystemColors.GrayText;
            return;
        }

        _txtApiKey.Text = value;
        _txtApiKey.ForeColor = System.Drawing.SystemColors.WindowText;
    }

    private string? GetApiKeyValue()
    {
        return _txtApiKey.ForeColor == System.Drawing.SystemColors.GrayText || string.IsNullOrWhiteSpace(_txtApiKey.Text)
            ? null
            : _txtApiKey.Text.Trim();
    }

    private void ClearApiKeyPlaceholder()
    {
        if (_txtApiKey.Text == _apiKeyPlaceholder && _txtApiKey.ForeColor == System.Drawing.SystemColors.GrayText)
        {
            _txtApiKey.Text = string.Empty;
            _txtApiKey.ForeColor = System.Drawing.SystemColors.WindowText;
        }
    }

    private void ApplyApiKeyPlaceholderIfEmpty()
    {
        if (string.IsNullOrWhiteSpace(_txtApiKey.Text))
            SetApiKey(null);
    }

    private void FocusField(SettingsField field)
    {
        switch (field)
        {
            case SettingsField.DbPath:
                _txtDbPath.Focus();
                break;
            case SettingsField.CrashLogDir:
                _txtCrashDir.Focus();
                break;
            case SettingsField.SumatraTempDir:
                _txtSumatraTempDir.Focus();
                break;
            case SettingsField.PrintDebugArtifactsDir:
                _txtPrintDebugArtifactsDir.Focus();
                break;
            case SettingsField.RenderHostPath:
                _txtRenderHostPath.Focus();
                break;
            case SettingsField.RenderBrowserVersion:
                _cmbRenderBrowserVersion.Focus();
                break;
            case SettingsField.RenderBrowserDir:
                _txtRenderBrowserDir.Focus();
                break;
            case SettingsField.RenderLogDir:
                _txtRenderLogDir.Focus();
                break;
        }
    }

    private static Label CreateInlineLabel(string text)
    {
        return new Label
        {
            Text = text,
            AutoSize = true,
            Margin = new Padding(12, 6, 4, 0)
        };
    }

    private void BrowseSumatraPath()
    {
        using var dlg = new OpenFileDialog
        {
            Title = LangManager.Get("Dialog_SumatraPdfPath"),
            Filter = LangManager.Get("Dialog_ExeFileFilter"),
            FileName = "SumatraPDF.exe",
            InitialDirectory = GetFileDialogInitialDirectory(_txtSumatraPath.Text, HostConfig.DefaultSumatraPdfPath)
        };
        if (dlg.ShowDialog() == DialogResult.OK)
            _txtSumatraPath.Text = dlg.FileName;
    }

    private void BrowseRenderHostPath()
    {
        using var dlg = new OpenFileDialog
        {
            Title = LangManager.Get("Dialog_RenderHostPath"),
            Filter = LangManager.Get("Dialog_ExeFileFilter"),
            FileName = "easyink-render.exe",
            InitialDirectory = GetFileDialogInitialDirectory(_txtRenderHostPath.Text, HostConfig.DefaultRenderHostPath)
        };
        if (dlg.ShowDialog() == DialogResult.OK)
        {
            _txtRenderHostPath.Text = dlg.FileName;
            RefreshRenderHostVersion();
        }
    }

    private void RefreshRenderHostVersion()
    {
        _lblRenderHostVersion.Text = _presenter.GetRenderCliVersion(_txtRenderHostPath.Text);
    }

    private static string GetFileDialogInitialDirectory(string? currentPath, string defaultPath)
    {
        var path = string.IsNullOrWhiteSpace(currentPath) ? defaultPath : currentPath;
        return Path.GetDirectoryName(path) ?? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
    }

    private void BrowseDbPath()
    {
        using var dlg = new SaveFileDialog
        {
            Title = LangManager.Get("Dialog_DbFileLocation"),
            Filter = LangManager.Get("Dialog_DbFileFilter"),
            FileName = "audit.db",
            InitialDirectory = Path.GetDirectoryName(_txtDbPath.Text) ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        };
        if (dlg.ShowDialog() == DialogResult.OK)
            _txtDbPath.Text = dlg.FileName;
    }

    private void BrowseCrashDir()
    {
        using var dlg = new FolderBrowserDialog
        {
            Description = LangManager.Get("Dialog_CrashLogDir"),
            SelectedPath = _txtCrashDir.Text
        };
        if (dlg.ShowDialog() == DialogResult.OK)
            _txtCrashDir.Text = dlg.SelectedPath;
    }

    private void BrowseSumatraTempDir()
    {
        using var dlg = new FolderBrowserDialog
        {
            Description = LangManager.Get("Dialog_SumatraTempDir"),
            SelectedPath = _txtSumatraTempDir.Text
        };
        if (dlg.ShowDialog() == DialogResult.OK)
            _txtSumatraTempDir.Text = dlg.SelectedPath;
    }

    private void BrowsePrintDebugArtifactsDir()
    {
        using var dlg = new FolderBrowserDialog
        {
            Description = LangManager.Get("Dialog_PrintDebugArtifactsDir"),
            SelectedPath = _txtPrintDebugArtifactsDir.Text
        };
        if (dlg.ShowDialog() == DialogResult.OK)
            _txtPrintDebugArtifactsDir.Text = dlg.SelectedPath;
    }

    private void BrowseRenderLogDir()
    {
        using var dlg = new FolderBrowserDialog
        {
            Description = LangManager.Get("Dialog_RenderLogDir"),
            SelectedPath = _txtRenderLogDir.Text
        };
        if (dlg.ShowDialog() == DialogResult.OK)
            _txtRenderLogDir.Text = dlg.SelectedPath;
    }

    private void BrowseRenderBrowserDir()
    {
        using var dlg = new FolderBrowserDialog
        {
            Description = LangManager.Get("Dialog_RenderBrowserDir"),
            SelectedPath = string.IsNullOrWhiteSpace(_txtRenderBrowserDir.Text)
                ? HostConfig.DefaultRenderBrowserCacheDir
                : _txtRenderBrowserDir.Text
        };
        if (dlg.ShowDialog() == DialogResult.OK)
            _txtRenderBrowserDir.Text = dlg.SelectedPath;
    }

    private async Task DownloadRenderBrowser()
    {
        RenderBrowserDownloadProgressDialog? progressDialog = null;

        _btnRenderBrowserDownload.Enabled = false;
        _btnRenderBrowserDownload.Text = LangManager.Get("Common_Downloading");
        try
        {
            var model = GetModel();
            progressDialog = new RenderBrowserDownloadProgressDialog();
            var owner = FindForm();
            if (owner == null)
                progressDialog.Show();
            else
                progressDialog.Show(owner);
            var progress = new Progress<RenderBrowserInstallProgress>(p => progressDialog.UpdateProgress(p));
            var installedPath = await Task.Run(() => _presenter.InstallRenderBrowser(model, progress));
            progressDialog.UpdateProgress(new RenderBrowserInstallProgress(RenderBrowserInstallStage.Completed, installedPath));
        }
        catch (Exception ex)
        {
            progressDialog?.MarkFailed();
            MessageBox.Show(
                LangManager.Get("Error_RenderBrowserDownloadFailed", ex.Message),
                LangManager.Get("Common_Error"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        finally
        {
            _btnRenderBrowserDownload.Enabled = true;
            _btnRenderBrowserDownload.Text = LangManager.Get("Common_Download");
        }
    }

    private async Task StartRenderDaemon()
    {
        await RunRenderDaemonCommand(
            () => _presenter.StartRenderDaemon(),
            LangManager.Get("Settings_RenderDaemonStarted"));
    }

    private async Task StopRenderDaemon()
    {
        await RunRenderDaemonCommand(
            () => _presenter.StopRenderDaemon(),
            LangManager.Get("Settings_RenderDaemonStopped"));
    }

    private async Task RunRenderDaemonCommand(Action command, string successMessage)
    {
        _btnRenderDaemonStart.Enabled = false;
        _btnRenderDaemonStop.Enabled = false;
        try
        {
            await Task.Run(command);
            MessageBox.Show(successMessage, LangManager.Get("Common_Info"), MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, LangManager.Get("Common_Error"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _btnRenderDaemonStart.Enabled = true;
            _btnRenderDaemonStop.Enabled = true;
        }
    }

    private void SelectRenderBrowserVersion(string? versionKey)
    {
        var normalizedKey = RenderBrowserVersionCatalog.NormalizeKey(versionKey);
        for (var i = 0; i < _cmbRenderBrowserVersion.Items.Count; i++)
        {
            if (_cmbRenderBrowserVersion.Items[i] is RenderBrowserVersionOption option &&
                string.Equals(option.Key, normalizedKey, StringComparison.OrdinalIgnoreCase))
            {
                _cmbRenderBrowserVersion.SelectedIndex = i;
                return;
            }
        }

        _cmbRenderBrowserVersion.SelectedIndex = 0;
    }

    private void SelectRenderHeadlessMode(string? mode)
    {
        var normalizedKey = RenderHeadlessModeCatalog.NormalizeKey(mode);
        for (var i = 0; i < _cmbRenderHeadlessMode.Items.Count; i++)
        {
            if (_cmbRenderHeadlessMode.Items[i] is RenderHeadlessModeOption option &&
                string.Equals(option.Key, normalizedKey, StringComparison.OrdinalIgnoreCase))
            {
                _cmbRenderHeadlessMode.SelectedIndex = i;
                return;
            }
        }

        _cmbRenderHeadlessMode.SelectedIndex = 0;
    }

    private string GetSelectedRenderBrowserVersionKey()
    {
        return (_cmbRenderBrowserVersion.SelectedItem as RenderBrowserVersionOption)?.Key
               ?? RenderBrowserVersionCatalog.StableKey;
    }

    private string GetSelectedRenderHeadlessModeKey()
    {
        return (_cmbRenderHeadlessMode.SelectedItem as RenderHeadlessModeOption)?.Key
               ?? RenderHeadlessModeCatalog.AutoKey;
    }

    private string GetSelectedRenderBrowserDir()
    {
        return HostConfig.ResolveRenderBrowserDir(_txtRenderBrowserDir.Text);
    }

}
