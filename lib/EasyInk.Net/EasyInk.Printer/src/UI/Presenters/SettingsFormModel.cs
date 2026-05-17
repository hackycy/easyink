namespace EasyInk.Printer.UI.Presenters;

internal enum SettingsField
{
    DbPath,
    CrashLogDir,
    SumatraTempDir
}

internal sealed class SettingsFormModel
{
    public int HttpPort { get; set; }
    public bool AutoStart { get; set; }
    public bool MinimizeToTray { get; set; }
    public bool StartMinimized { get; set; }
    public bool TrustAllOrigins { get; set; }
    public string? ApiKey { get; set; }
    public string Language { get; set; } = string.Empty;
    public int LowDpiEnhancementIndex { get; set; }
    public string RawPrinterNamesText { get; set; } = string.Empty;
    public string SumatraPdfPath { get; set; } = string.Empty;
    public string SumatraPrinterNamesText { get; set; } = string.Empty;
    public string SumatraPrintSettings { get; set; } = "fit";
    public int SumatraTimeoutSeconds { get; set; }
    public string DbPath { get; set; } = string.Empty;
    public string CrashLogDir { get; set; } = string.Empty;
    public string SumatraTempDir { get; set; } = string.Empty;
}

internal sealed class SettingsValidationResult
{
    private SettingsValidationResult(bool isValid, SettingsField? field, string? message)
    {
        IsValid = isValid;
        Field = field;
        Message = message;
    }

    public bool IsValid { get; }
    public SettingsField? Field { get; }
    public string? Message { get; }

    public static SettingsValidationResult Valid()
    {
        return new SettingsValidationResult(true, null, null);
    }

    public static SettingsValidationResult Invalid(SettingsField field, string message)
    {
        return new SettingsValidationResult(false, field, message);
    }
}
