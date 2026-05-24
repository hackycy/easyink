using System;
using System.Drawing;
using System.Windows.Forms;
using EasyInk.Printer.Services;
using EasyInk.Printer.UI.Controls;

namespace EasyInk.Printer.UI.Views;

internal sealed class RenderBrowserDownloadProgressDialog : Form
{
    private readonly Label _statusLabel;
    private readonly ProgressBar _progressBar;
    private readonly Button _closeButton;

    public RenderBrowserDownloadProgressDialog()
    {
        Text = LangManager.Get("Dialog_RenderBrowserDownloadProgress");
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(460, 128);
        BackColor = UiTheme.SurfaceColor;
        Font = UiTheme.RegularFont();

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(18, 16, 18, 14),
            BackColor = UiTheme.SurfaceColor
        };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        _statusLabel = new Label
        {
            AutoSize = true,
            Dock = DockStyle.Top,
            ForeColor = UiTheme.TextColor,
            Margin = new Padding(0, 0, 0, 8),
            Text = LangManager.Get("Settings_RenderBrowserProgressPreparing")
        };

        _progressBar = new ProgressBar
        {
            Dock = DockStyle.Top,
            Height = 16,
            Minimum = 0,
            Maximum = 100,
            Style = ProgressBarStyle.Marquee,
            Margin = new Padding(0, 0, 0, 12)
        };

        var buttonPanel = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Margin = new Padding(0)
        };
        _closeButton = UiFactory.CreateSecondaryButton(LangManager.Get("Common_Close"), 72);
        _closeButton.Click += (s, e) => Close();
        buttonPanel.Controls.Add(_closeButton);

        layout.Controls.Add(_statusLabel, 0, 0);
        layout.Controls.Add(_progressBar, 0, 1);
        layout.Controls.Add(buttonPanel, 0, 2);
        Controls.Add(layout);
    }

    public void UpdateProgress(RenderBrowserInstallProgress progress)
    {
        if (IsDisposed)
            return;

        switch (progress.Stage)
        {
            case RenderBrowserInstallStage.Resolving:
                SetMarquee(LangManager.Get("Settings_RenderBrowserProgressResolving"));
                break;
            case RenderBrowserInstallStage.CacheHit:
                SetComplete(LangManager.Get("Settings_RenderBrowserProgressCacheHit"));
                break;
            case RenderBrowserInstallStage.Downloading:
                UpdateDownloadProgress(progress);
                break;
            case RenderBrowserInstallStage.Extracting:
                SetMarquee(LangManager.Get("Settings_RenderBrowserProgressExtracting"));
                break;
            case RenderBrowserInstallStage.Completed:
                SetComplete(LangManager.Get("Settings_RenderBrowserProgressCompleted"));
                break;
        }
    }

    public void MarkFailed()
    {
        if (IsDisposed)
            return;

        _progressBar.Style = ProgressBarStyle.Continuous;
        _progressBar.Value = 0;
        _statusLabel.ForeColor = UiTheme.ErrorColor;
        _statusLabel.Text = LangManager.Get("Settings_RenderBrowserProgressFailed");
    }

    private void SetMarquee(string text)
    {
        _progressBar.Style = ProgressBarStyle.Marquee;
        _statusLabel.ForeColor = UiTheme.TextColor;
        _statusLabel.Text = text;
    }

    private void SetComplete(string text)
    {
        _progressBar.Style = ProgressBarStyle.Continuous;
        _progressBar.Value = 100;
        _statusLabel.ForeColor = UiTheme.SuccessColor;
        _statusLabel.Text = text;
    }

    private void UpdateDownloadProgress(RenderBrowserInstallProgress progress)
    {
        _statusLabel.ForeColor = UiTheme.TextColor;
        if (progress.TotalBytes.HasValue && progress.TotalBytes.Value > 0 && progress.BytesReceived.HasValue)
        {
            var percent = (int)Math.Min(100, Math.Max(0, progress.BytesReceived.Value * 100 / progress.TotalBytes.Value));
            _progressBar.Style = ProgressBarStyle.Continuous;
            _progressBar.Value = percent;
            _statusLabel.Text = LangManager.Get(
                "Settings_RenderBrowserProgressDownloadingPercent",
                percent,
                FormatBytes(progress.BytesReceived.Value),
                FormatBytes(progress.TotalBytes.Value));
            return;
        }

        _progressBar.Style = ProgressBarStyle.Marquee;
        var received = progress.BytesReceived.HasValue ? FormatBytes(progress.BytesReceived.Value) : "0 B";
        _statusLabel.Text = LangManager.Get("Settings_RenderBrowserProgressDownloading", received);
    }

    private static string FormatBytes(long bytes)
    {
        if (bytes >= 1024L * 1024L * 1024L)
            return (bytes / 1024d / 1024d / 1024d).ToString("0.0") + " GB";
        if (bytes >= 1024L * 1024L)
            return (bytes / 1024d / 1024d).ToString("0.0") + " MB";
        if (bytes >= 1024L)
            return (bytes / 1024d).ToString("0.0") + " KB";
        return bytes + " B";
    }
}
