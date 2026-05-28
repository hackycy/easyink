using EasyInk.Engine.Models;
using EasyInk.Printer.Config;
using EasyInk.Printer.Services;
using Xunit;

namespace EasyInk.Printer.Tests;

public class RenderClientTests
{
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
}
