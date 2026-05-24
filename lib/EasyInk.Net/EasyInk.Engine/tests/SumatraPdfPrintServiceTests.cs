using System.Reflection;
using EasyInk.Engine.Services;
using EasyInk.Engine.Services.Abstractions;
using Moq;
using Xunit;

namespace EasyInk.Engine.Tests;

public class SumatraPdfPrintServiceTests
{
    [Fact]
    public void BuildArguments_PrinterNameEndingWithBackslash_EscapesClosingQuote()
    {
        var service = CreateService();

        var args = InvokeBuildArguments(service, "ReceiptPrinter\\", @"C:\Temp\invoice.pdf");

        Assert.Equal(
            "-silent -exit-on-print -print-to \"ReceiptPrinter\\\\\" -print-settings \"fit\" \"C:\\Temp\\invoice.pdf\"",
            args);
    }

    [Fact]
    public void BuildArguments_PdfPathWithBackslashes_PreservesPathSeparators()
    {
        var service = CreateService();

        var args = InvokeBuildArguments(service, "Office Printer", @"C:\Temp\nested\invoice.pdf");

        Assert.Contains("\"C:\\Temp\\nested\\invoice.pdf\"", args);
        Assert.DoesNotContain("\"C:\\\\Temp", args);
    }

    private static SumatraPdfPrintService CreateService()
    {
        return new SumatraPdfPrintService(new Mock<IPrinterService>().Object, @"C:\Tools\SumatraPDF.exe");
    }

    private static string InvokeBuildArguments(SumatraPdfPrintService service, string printerName, string pdfPath)
    {
        var method = typeof(SumatraPdfPrintService).GetMethod("BuildArguments", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(method);

        return (string)method!.Invoke(service, new object[] { printerName, pdfPath })!;
    }
}