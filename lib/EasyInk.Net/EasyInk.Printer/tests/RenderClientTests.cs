using EasyInk.Engine.Models;
using EasyInk.Printer.Config;
using EasyInk.Printer.Services;
using Xunit;

namespace EasyInk.Printer.Tests;

public class RenderClientTests
{
    [Fact]
    public void BuildArguments_IncludesDisableSandboxWhenEnabled()
    {
        var args = RenderClient.BuildArgumentsForTest(CreateRuntime(disableSandbox: true), "request.json", "out.pdf", "diagnostics.json");

        Assert.Contains("--disable-sandbox", args);
    }

    [Fact]
    public void BuildArguments_OmitsDisableSandboxByDefault()
    {
        var args = RenderClient.BuildArgumentsForTest(CreateRuntime(), "request.json", "out.pdf", "diagnostics.json");

        Assert.DoesNotContain("--disable-sandbox", args);
    }

    [Fact]
    public void BuildRenderRequest_PreservesPreferCssPageSize()
    {
        var client = new RenderClient(new HostConfig());
        var payload = client.BuildRenderRequestForTest("req-css-page", new PrintRequestParams
        {
            PrinterName = "Printer",
            RenderSource = new RenderSourceParams
            {
                Type = "easyink",
                Schema = new Newtonsoft.Json.Linq.JObject(),
            },
            RenderOptions = new RenderOptionsParams
            {
                Pdf = new RenderPdfOptionsParams
                {
                    PreferCSSPageSize = true,
                },
            },
        });

        Assert.True(payload["pdf"]!.Value<bool>("preferCSSPageSize"));
    }

    private static RenderRuntimeOptions CreateRuntime(bool disableSandbox = false)
    {
        return new RenderRuntimeOptions
        {
            BrowserKind = "headless-shell",
            BrowserPath = "/bin/headless-shell",
            HeadlessMode = "auto",
            ProfileRoot = "/tmp/profile",
            TempDir = "/tmp/temp",
            LogDir = "/tmp/logs",
            DisableSandbox = disableSandbox,
            MaxConcurrency = 2,
            MaxQueueSize = 16,
            RequestTimeoutMs = 30000,
            IdleTimeoutMs = 0
        };
    }
}
