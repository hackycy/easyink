using System;
using System.IO;
using System.Windows.Forms;
using EasyInk.Printer.Config;
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

        var panel = UiFactory.CreatePagePanel(new Padding(16));
        panel.AutoScroll = true;

        var settingsLayout = UiFactory.CreateSettingsLayoutPanel();
        panel.Controls.Add(settingsLayout);
        UiFactory.UpdateSettingsLayoutWidth(panel, settingsLayout);
        panel.Resize += (s, e) => UiFactory.UpdateSettingsLayoutWidth(panel, settingsLayout);

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
        UiFactory.StyleSettingsSection(grpPath);
        UiFactory.StyleSettingsSection(grpLogging);

        UiFactory.AddSettingsBlock(settingsLayout, grpBasic);
        UiFactory.AddSettingsBlock(settingsLayout, grpDisplay);
        UiFactory.AddSettingsBlock(settingsLayout, grpSecurity);
        UiFactory.AddSettingsBlock(settingsLayout, grpPrinterCompat);
        UiFactory.AddSettingsBlock(settingsLayout, grpPath);
        UiFactory.AddSettingsBlock(settingsLayout, grpLogging);
        UiFactory.AddSettingsBlock(settingsLayout, saveBar, 0);
        Controls.Add(panel);

        _presenter.Attach(this);
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
            PrintDebugArtifactsDir = _txtPrintDebugArtifactsDir.Text ?? string.Empty
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
        }
    }

    private void BrowseSumatraPath()
    {
        using var dlg = new OpenFileDialog
        {
            Title = LangManager.Get("Dialog_SumatraPdfPath"),
            Filter = LangManager.Get("Dialog_ExeFileFilter"),
            FileName = "SumatraPDF.exe",
            InitialDirectory = string.IsNullOrWhiteSpace(_txtSumatraPath.Text)
                ? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
                : Path.GetDirectoryName(_txtSumatraPath.Text) ?? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
        };
        if (dlg.ShowDialog() == DialogResult.OK)
            _txtSumatraPath.Text = dlg.FileName;
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
}
