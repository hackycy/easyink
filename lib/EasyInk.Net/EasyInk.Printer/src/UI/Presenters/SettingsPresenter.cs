using System;
using System.Diagnostics;
using System.IO;
using EasyInk.Printer.Config;
using EasyInk.Printer.Services;

namespace EasyInk.Printer.UI.Presenters;

internal interface ISettingsView
{
    void SetModel(SettingsFormModel model);
    SettingsFormModel GetModel();
    void ShowValidationError(SettingsField field, string message);
    void ShowSaveError(string message);
    bool ConfirmRestart();
    void ShowDelayedApply();
    void RequestRestart();
}

internal sealed class SettingsPresenter : IDisposable
{
    private readonly HostConfig _config;
    private readonly RenderDaemonService _renderDaemonService;
    private ISettingsView? _view;
    private bool _disposed;

    public SettingsPresenter(HostConfig config, RenderDaemonService renderDaemonService)
    {
        _config = config;
        _renderDaemonService = renderDaemonService;
    }

    public void Attach(ISettingsView view)
    {
        _view = view ?? throw new ArgumentNullException(nameof(view));
        Load();
    }

    public void Load()
    {
        if (_disposed || _view == null) return;

        var model = SettingsMapper.FromConfig(_config, HostConfig.GetAutoStartRegistry());
        model.RenderHostVersion = GetRenderCliVersion(model.RenderHostPath);
        _view.SetModel(model);
    }

    public void Save()
    {
        if (_disposed || _view == null) return;

        var model = _view.GetModel();
        var validation = SettingsMapper.Validate(model);
        if (!validation.IsValid)
        {
            _view.ShowValidationError(validation.Field!.Value, validation.Message!);
            return;
        }

        SettingsMapper.ApplyToConfig(_config, model);

        try
        {
            _config.Save();
        }
        catch (Exception ex)
        {
            _view.ShowSaveError(LangManager.Get("Error_ConfigSaveFailed", ex.Message));
            return;
        }

        HostConfig.SetAutoStartRegistry(model.AutoStart);

        if (_view.ConfirmRestart())
            _view.RequestRestart();
        else
            _view.ShowDelayedApply();
    }

    public string InstallRenderBrowser(SettingsFormModel model, IProgress<RenderBrowserInstallProgress>? progress = null)
    {
        if (_disposed)
            throw new ObjectDisposedException(nameof(SettingsPresenter));

        var tempConfig = new HostConfig
        {
            RenderBrowserVersion = RenderBrowserVersionCatalog.NormalizeKey(model.RenderBrowserVersion),
            RenderBrowserDir = HostConfig.ResolveRenderBrowserDir(model.RenderBrowserDir),
            RenderRequestTimeoutMs = model.RenderRequestTimeoutMs
        };

        using var runtime = new RenderRuntimeManager(tempConfig);
        return runtime.InstallBrowserVersion(tempConfig.RenderBrowserVersion!, progress);
    }

    public string GetRenderCliVersion(string? hostPath)
    {
        var resolvedPath = HostConfig.ResolveRenderHostPath(hostPath!);
        if (!File.Exists(resolvedPath))
            return LangManager.Get("Settings_RenderCliVersionUnavailable");

        try
        {
            using var process = new Process();
            process.StartInfo = new ProcessStartInfo
            {
                FileName = resolvedPath,
                Arguments = "version",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            process.Start();
            if (!process.WaitForExit(3000))
            {
                try { process.Kill(); } catch { }
                return LangManager.Get("Settings_RenderCliVersionUnavailable");
            }

            var output = process.StandardOutput.ReadToEnd().Trim();
            if (process.ExitCode == 0 && !string.IsNullOrWhiteSpace(output))
                return output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0];
        }
        catch
        {
        }

        return LangManager.Get("Settings_RenderCliVersionUnavailable");
    }

    public void StartRenderDaemon()
    {
        if (_disposed)
            throw new ObjectDisposedException(nameof(SettingsPresenter));

        _renderDaemonService.Start();
    }

    public void StopRenderDaemon()
    {
        if (_disposed)
            throw new ObjectDisposedException(nameof(SettingsPresenter));

        _renderDaemonService.Stop();
    }

    public void Dispose()
    {
        _disposed = true;
        _view = null;
    }
}
