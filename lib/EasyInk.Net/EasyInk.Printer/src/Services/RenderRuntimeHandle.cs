namespace EasyInk.Printer.Services;

internal sealed class RenderRuntimeOptions
{
    public string HostPath { get; set; } = string.Empty;
    public string BrowserKind { get; set; } = "chrome-for-testing";
    public string BrowserPath { get; set; } = string.Empty;
    public string HeadlessMode { get; set; } = "auto";
    public string ProfileRoot { get; set; } = string.Empty;
    public string TempDir { get; set; } = string.Empty;
    public string LogDir { get; set; } = string.Empty;
    public bool DisableSandbox { get; set; }
    public int MaxConcurrency { get; set; }
    public int MaxQueueSize { get; set; }
    public int RequestTimeoutMs { get; set; }
    public int IdleTimeoutMs { get; set; }
}