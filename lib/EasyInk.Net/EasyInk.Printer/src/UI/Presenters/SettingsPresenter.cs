using System;
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
    private ISettingsView? _view;
    private bool _disposed;

    public SettingsPresenter(HostConfig config)
    {
        _config = config;
    }

    public void Attach(ISettingsView view)
    {
        _view = view ?? throw new ArgumentNullException(nameof(view));
        Load();
    }

    public void Load()
    {
        if (_disposed || _view == null) return;

        _view.SetModel(SettingsMapper.FromConfig(_config, HostConfig.GetAutoStartRegistry()));
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
            RenderRequestTimeoutMs = model.RenderRequestTimeoutMs
        };

        using var runtime = new RenderRuntimeManager(tempConfig);
        return runtime.InstallBrowserVersion(tempConfig.RenderBrowserVersion!, progress);
    }

    public void Dispose()
    {
        _disposed = true;
        _view = null;
    }
}
