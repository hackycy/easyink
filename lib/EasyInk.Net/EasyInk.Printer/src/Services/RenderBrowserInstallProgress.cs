namespace EasyInk.Printer.Services;

internal enum RenderBrowserInstallStage
{
    Resolving,
    CacheHit,
    Downloading,
    Extracting,
    Completed
}

internal sealed class RenderBrowserInstallProgress
{
    public RenderBrowserInstallProgress(RenderBrowserInstallStage stage, string? path = null, long? bytesReceived = null, long? totalBytes = null)
    {
        Stage = stage;
        Path = path;
        BytesReceived = bytesReceived;
        TotalBytes = totalBytes;
    }

    public RenderBrowserInstallStage Stage { get; }
    public string? Path { get; }
    public long? BytesReceived { get; }
    public long? TotalBytes { get; }
}
