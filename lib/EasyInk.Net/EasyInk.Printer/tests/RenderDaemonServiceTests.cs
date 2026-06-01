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

    [Fact]
    public void BuildDaemonArguments_UsesChromiumPathWithoutTypeFlag()
    {
        var args = RenderDaemonService.BuildDaemonArgumentsForTest("start", CreateRuntime());

        Assert.Contains("--browser-path", args);
        Assert.Contains("/bin/chromium", args);
        Assert.DoesNotContain("--browser-" + "kind", args);
    }

    private static RenderRuntimeOptions CreateRuntime(bool disableSandbox = false)
    {
        return new RenderRuntimeOptions
        {
            BrowserPath = "/bin/chromium",
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
