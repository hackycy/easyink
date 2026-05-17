using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyInk.Printer.UI.Controls;
using EasyInk.Printer.UI.Presenters;

namespace EasyInk.Printer.UI.Views;

internal sealed class DashboardView : UserControl, IDashboardView, IActivatableTab
{
    private readonly DashboardPresenter _presenter;
    private readonly Label _serviceValue;
    private readonly Label _portValue;
    private readonly Label _webSocketValue;
    private readonly Label _queueValue;
    private readonly Panel _serviceCard;
    private readonly Panel _queueCard;
    private readonly TableLayoutPanel _infoGrid;
    private readonly Control _errorBanner;
    private readonly Label _errorLabel;
    private readonly Button _refreshButton;

    public DashboardView(DashboardPresenter presenter)
    {
        _presenter = presenter;
        Title = LangManager.Get("Dashboard_Tab");
        Dock = DockStyle.Fill;
        BackColor = UiTheme.PageBackColor;

        var panel = UiFactory.CreatePagePanel(new Padding(18));
        var titleFont = UiTheme.RegularFont();
        var valueFont = UiTheme.BoldFont(18f);

        var cardsPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 118,
            ColumnCount = 4,
            RowCount = 1,
            Padding = new Padding(0, 0, 0, 14),
            BackColor = UiTheme.PageBackColor
        };
        for (var i = 0; i < 4; i++)
            cardsPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        cardsPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        _serviceCard = CreateCardPanel(UiTheme.SuccessColor, LangManager.Get("Dashboard_ServiceStatus"), string.Empty, valueFont, UiTheme.SuccessColor, titleFont, out _serviceValue);
        var portCard = CreateCardPanel(UiTheme.InfoColor, LangManager.Get("Dashboard_Port"), string.Empty, valueFont, UiTheme.InfoColor, titleFont, out _portValue);
        var wsCard = CreateCardPanel(UiTheme.WarningColor, LangManager.Get("Dashboard_WebSocket"), string.Empty, valueFont, UiTheme.WarningColor, titleFont, out _webSocketValue);
        _queueCard = CreateCardPanel(UiTheme.SuccessColor, LangManager.Get("Dashboard_PrintQueue"), string.Empty, valueFont, UiTheme.SuccessColor, titleFont, out _queueValue);

        cardsPanel.Controls.Add(_serviceCard, 0, 0);
        cardsPanel.Controls.Add(portCard, 1, 0);
        cardsPanel.Controls.Add(wsCard, 2, 0);
        cardsPanel.Controls.Add(_queueCard, 3, 0);

        var infoPanel = new RoundedPanel
        {
            Dock = DockStyle.Top,
            Height = 178,
            BackColor = UiTheme.SurfaceColor,
            BorderColor = UiTheme.BorderColor,
            Radius = 8,
            Padding = new Padding(18, 16, 18, 16),
            Margin = new Padding(0, 0, 0, 12)
        };

        var lblInfoTitle = new Label
        {
            Text = LangManager.Get("Dashboard_DeviceInfo"),
            Font = UiTheme.BoldFont(10f),
            ForeColor = UiTheme.TextColor,
            Dock = DockStyle.Top,
            Height = 30,
            TextAlign = ContentAlignment.MiddleLeft
        };

        _infoGrid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 0,
            Padding = new Padding(0, 6, 0, 0),
            BackColor = UiTheme.SurfaceColor
        };
        _infoGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        _infoGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        infoPanel.Controls.Add(_infoGrid);
        infoPanel.Controls.Add(lblInfoTitle);

        _errorBanner = UiFactory.CreateErrorBanner(out _errorLabel);

        _refreshButton = UiFactory.CreateCommandButton(LangManager.Get("Common_Refresh"), 84);
        _refreshButton.Click += async (s, e) => await _presenter.RefreshAsync();
        var btnBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 42,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 8, 0, 0),
            BackColor = UiTheme.PageBackColor
        };
        btnBar.Controls.Add(_refreshButton);

        panel.Controls.Add(btnBar);
        panel.Controls.Add(_errorBanner);
        panel.Controls.Add(infoPanel);
        panel.Controls.Add(cardsPanel);
        Controls.Add(panel);

        _presenter.Attach(this);
    }

    public string Title { get; }
    public Control View => this;

    public Task ActivateAsync()
    {
        return Task.CompletedTask;
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

    public void SetSnapshot(DashboardSnapshot snapshot)
    {
        SetServiceStatus(snapshot.ServiceStatusText, snapshot.ServiceStatusKind);
        _portValue.Text = snapshot.PortText;
        _webSocketValue.Text = snapshot.WebSocketText;
        SetQueueStatus(snapshot.QueueText, snapshot.QueueKind);
        UiFactory.SetErrorBanner(_errorBanner, _errorLabel, snapshot.StartupError);
        SetInfoRows(snapshot);
    }

    public void SetWebSocketConnections(string value)
    {
        _webSocketValue.Text = value;
    }

    public void SetQueueStatus(string text, DashboardStateKind kind)
    {
        var color = GetStateColor(kind);
        _queueValue.Text = text;
        _queueValue.ForeColor = color;
        UiFactory.SetCardAccent(_queueCard, color);
    }

    public void SetBusy(bool busy)
    {
        _refreshButton.Enabled = !busy;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            _presenter.Dispose();

        base.Dispose(disposing);
    }

    private static Panel CreateCardPanel(Color accentColor, string title, string value, Font valueFont, Color valueColor, Font titleFont, out Label valueLabel)
    {
        var card = new RoundedPanel
        {
            BackColor = UiTheme.SurfaceColor,
            BorderColor = UiTheme.BorderColor,
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
            BackColor = UiTheme.SurfaceColor
        };

        var lblTitle = new Label
        {
            Text = title,
            Font = titleFont,
            ForeColor = UiTheme.MutedTextColor,
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

    private void SetServiceStatus(string text, DashboardStateKind kind)
    {
        var color = GetStateColor(kind);
        _serviceValue.Text = text;
        _serviceValue.ForeColor = color;
        UiFactory.SetCardAccent(_serviceCard, color);
    }

    private void SetInfoRows(DashboardSnapshot snapshot)
    {
        _infoGrid.SuspendLayout();
        try
        {
            _infoGrid.Controls.Clear();
            _infoGrid.RowStyles.Clear();
            _infoGrid.RowCount = snapshot.InfoRows.Count;

            for (var i = 0; i < snapshot.InfoRows.Count; i++)
            {
                _infoGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
                var row = snapshot.InfoRows[i];
                var lblKey = new Label
                {
                    Text = row.Label,
                    Font = UiTheme.RegularFont(),
                    ForeColor = UiTheme.MutedTextColor,
                    Dock = DockStyle.Fill,
                    TextAlign = ContentAlignment.MiddleLeft,
                    Margin = new Padding(0)
                };

                var txtVal = new TextBox
                {
                    Text = row.Value,
                    Font = UiTheme.BoldFont(),
                    ForeColor = UiTheme.TextColor,
                    BackColor = UiTheme.SurfaceColor,
                    BorderStyle = BorderStyle.None,
                    ReadOnly = true,
                    Dock = DockStyle.Fill,
                    Margin = new Padding(0, 6, 0, 0)
                };
                _infoGrid.Controls.Add(lblKey, 0, i);
                _infoGrid.Controls.Add(txtVal, 1, i);
            }
        }
        finally
        {
            _infoGrid.ResumeLayout();
        }
    }

    private static Color GetStateColor(DashboardStateKind kind)
    {
        switch (kind)
        {
            case DashboardStateKind.Warning:
                return UiTheme.WarningColor;
            case DashboardStateKind.Error:
                return UiTheme.ErrorColor;
            case DashboardStateKind.Info:
                return UiTheme.InfoColor;
            default:
                return UiTheme.SuccessColor;
        }
    }
}
