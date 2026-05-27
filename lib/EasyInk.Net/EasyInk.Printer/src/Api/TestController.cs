using System;
using EasyInk.Engine;
using EasyInk.Engine.Models;

namespace EasyInk.Printer.Api;

public class TestController
{
    private readonly EngineApi _api;

    public TestController(EngineApi api)
    {
        _api = api;
    }

    public PrinterResult TestPrinter(string printerName, string level)
    {
        var testLevel = ParseLevel(level);
        var requestId = Guid.NewGuid().ToString();
        return _api.TestPrinter(requestId, printerName, testLevel);
    }

    private static PrinterTestLevel ParseLevel(string value)
    {
        return string.Equals(value, "connectivity", StringComparison.OrdinalIgnoreCase)
            ? PrinterTestLevel.Connectivity
            : string.Equals(value, "full", StringComparison.OrdinalIgnoreCase)
                ? PrinterTestLevel.Full
                : PrinterTestLevel.Quick;
    }
}
