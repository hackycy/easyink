using EasyInk.Printer.Server;
using Xunit;

namespace EasyInk.Printer.Tests;

public class RouterTests
{
    [Fact]
    public void ValidateApiKey_NoConfiguredKey_ReturnsTrue()
    {
        Assert.True(Router.ValidateApiKeyCore(null, null));
        Assert.True(Router.ValidateApiKeyCore("", null));
        Assert.True(Router.ValidateApiKeyCore(null, "some-key"));
    }

    [Fact]
    public void ValidateApiKey_MatchingKey_ReturnsTrue()
    {
        Assert.True(Router.ValidateApiKeyCore("my-secret-key", "my-secret-key"));
    }

    [Fact]
    public void ValidateApiKey_WrongKey_ReturnsFalse()
    {
        Assert.False(Router.ValidateApiKeyCore("my-secret-key", "wrong-key"));
    }

    [Fact]
    public void ValidateApiKey_MissingProvidedKey_ReturnsFalse()
    {
        Assert.False(Router.ValidateApiKeyCore("my-secret-key", null));
        Assert.False(Router.ValidateApiKeyCore("my-secret-key", ""));
    }

    [Fact]
    public void ValidateApiKey_CaseSensitive()
    {
        Assert.False(Router.ValidateApiKeyCore("MyKey", "mykey"));
        Assert.False(Router.ValidateApiKeyCore("MyKey", "MYKEY"));
    }

    [Theory]
    [InlineData("http://localhost:3000")]
    [InlineData("http://127.0.0.1:3000")]
    [InlineData("http://[::1]:3000")]
    [InlineData("http://0.0.0.0:3000")]
    public void IsLocalOrigin_LocalAddresses_ReturnsTrue(string origin)
    {
        Assert.True(Router.IsLocalOrigin(origin));
    }

    [Theory]
    [InlineData("http://example.com")]
    [InlineData("http://10.0.0.1")]
    [InlineData("http://192.168.1.1")]
    [InlineData("http://172.16.0.1")]
    [InlineData("http://evil.com")]
    public void IsLocalOrigin_RemoteAddresses_ReturnsFalse(string origin)
    {
        Assert.False(Router.IsLocalOrigin(origin));
    }

    [Fact]
    public void IsLocalOrigin_InvalidUri_ReturnsFalse()
    {
        Assert.False(Router.IsLocalOrigin("not a url"));
        Assert.False(Router.IsLocalOrigin(""));
    }

    [Theory]
    [InlineData("/api/status")]
    [InlineData("/api/printers")]
    [InlineData("/api/jobs")]
    [InlineData("/api/logs")]
    [InlineData("/api/print")]
    [InlineData("/api/print/async")]
    [InlineData("/api/status/connections")]
    public void Exact_MatchesCorrectPaths(string path)
    {
        var matcher = Router.Exact(path);
        Assert.True(matcher(path));
    }

    [Fact]
    public void Exact_DoesNotMatchDifferentPaths()
    {
        var matcher = Router.Exact("/api/status");
        Assert.False(matcher("/api/printers"));
        Assert.False(matcher("/api/status/extra"));
    }

    [Fact]
    public void Exact_TrailingSlash_DoesNotMatch()
    {
        var matcher = Router.Exact("/api/status");
        Assert.False(matcher("/api/status/"));
    }

    [Theory]
    [InlineData("/api/printers/HP_LaserJet/status")]
    [InlineData("/api/printers/ZDesigner/status")]
    [InlineData("/api/printers/123/status")]
    public void MatchPrinterStatus_ValidPath_ReturnsTrue(string path)
    {
        Assert.True(Router.MatchPrinterStatus(path));
    }

    [Theory]
    [InlineData("/api/printers")]
    [InlineData("/api/printers/")]
    [InlineData("/api/printers/HP/status/extra")]
    [InlineData("/api/printers/a/b/status")]
    [InlineData("/api/status")]
    public void MatchPrinterStatus_InvalidPath_ReturnsFalse(string path)
    {
        Assert.False(Router.MatchPrinterStatus(path));
    }

    [Theory]
    [InlineData("/api/jobs/abc123")]
    [InlineData("/api/jobs/550e8400-e29b-41d4-a716-446655440000")]
    [InlineData("/api/jobs/1")]
    public void MatchJobById_ValidPath_ReturnsTrue(string path)
    {
        Assert.True(Router.MatchJobById(path));
    }

    [Theory]
    [InlineData("/api/jobs")]
    [InlineData("/api/jobs/")]
    [InlineData("/api/printers")]
    public void MatchJobById_InvalidPath_ReturnsFalse(string path)
    {
        Assert.False(Router.MatchJobById(path));
    }
}
