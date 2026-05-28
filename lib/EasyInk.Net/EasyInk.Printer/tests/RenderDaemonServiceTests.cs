using EasyInk.Printer.Services;
using Xunit;

namespace EasyInk.Printer.Tests;

public class RenderDaemonServiceTests
{
    [Fact]
    public void BuildDaemonArguments_IncludesDisableSandboxWhenEnabled()
    {
        var args = RenderDaemonService.BuildDaemonArgumentsForTest("start", CreateRuntime(disableSandbox: true));

        Assert.Contains("--disable-sandbox", args);
    }

    [Fact]
    public void BuildDaemonArguments_OmitsDisableSandboxByDefault()
    {
        var args = RenderDaemonService.BuildDaemonArgumentsForTest("start", CreateRuntime());

        Assert.DoesNotContain("--disable-sandbox", args);
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