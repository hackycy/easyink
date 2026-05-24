namespace EasyInk.Printer.Services;

internal sealed class RenderRuntimeHandle
{
    public RenderRuntimeHandle(string baseUrl, string authToken)
    {
        BaseUrl = baseUrl;
        AuthToken = authToken;
    }

    public string BaseUrl { get; }
    public string AuthToken { get; }
}