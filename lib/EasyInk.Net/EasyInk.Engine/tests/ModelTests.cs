using EasyInk.Engine;
using EasyInk.Engine.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Xunit;

namespace EasyInk.Engine.Tests;

public class PaperSizeParamsTests
{
    [Fact]
    public void MmToHundredthsOfInch_ConversionIsCorrect()
    {
        var p = new PaperSizeParams { Width = 100, Height = 200, Unit = "mm" };
        // 100mm = 100/25.4*100 ≈ 393.7 hundredths of inch -> round to 394
        Assert.Equal(394, p.WidthInHundredthsOfInch);
        // 200mm = 200/25.4*100 ≈ 787.4
        Assert.Equal(787, p.HeightInHundredthsOfInch);
    }

    [Fact]
    public void InchToHundredthsOfInch_ConversionIsCorrect()
    {
        var p = new PaperSizeParams { Width = 3, Height = 5, Unit = "inch" };
        Assert.Equal(300, p.WidthInHundredthsOfInch);
        Assert.Equal(500, p.HeightInHundredthsOfInch);
    }

    [Fact]
    public void DefaultUnit_IsMm()
    {
        var p = new PaperSizeParams();
        Assert.Equal("mm", p.Unit);
    }

    [Fact]
    public void Unit_IsCaseInsensitive()
    {
        var p = new PaperSizeParams { Width = 100, Height = 200, Unit = "MM" };
        Assert.Equal(394, p.WidthInHundredthsOfInch);
    }

    [Fact]
    public void InvalidUnit_ThrowsArgumentException()
    {
        var p = new PaperSizeParams { Width = 100, Height = 200, Unit = "cm" };
        Assert.Throws<System.ArgumentException>(() => p.WidthInHundredthsOfInch);
    }
}

public class OffsetParamsTests
{
    [Fact]
    public void MmToHundredthsOfInch_ConversionIsCorrect()
    {
        var o = new OffsetParams { X = 10, Y = 20, Unit = "mm" };
        // 10mm = 10/25.4*100 ≈ 39.37 -> round to 39
        Assert.Equal(39, o.XInHundredthsOfInch);
        // 20mm = 20/25.4*100 ≈ 78.74 -> round to 79
        Assert.Equal(79, o.YInHundredthsOfInch);
    }

    [Fact]
    public void InchToHundredthsOfInch_ConversionIsCorrect()
    {
        var o = new OffsetParams { X = 1.5, Y = 2.5, Unit = "inch" };
        Assert.Equal(150, o.XInHundredthsOfInch);
        Assert.Equal(250, o.YInHundredthsOfInch);
    }

    [Fact]
    public void InvalidUnit_ThrowsArgumentException()
    {
        var o = new OffsetParams { X = 10, Y = 20, Unit = "cm" };
        Assert.Throws<System.ArgumentException>(() => o.XInHundredthsOfInch);
    }
}

public class PrinterResultTests
{
    [Fact]
    public void Ok_SetsSuccessAndData()
    {
        var result = PrinterResult.Ok("id-1", new { Name = "test" });
        Assert.True(result.Success);
        Assert.Equal("id-1", result.Id);
        Assert.NotNull(result.Data);
        Assert.Null(result.ErrorInfo);
    }

    [Fact]
    public void Error_SetsErrorInfo()
    {
        var result = PrinterResult.Error("id-2", "CODE", "message", "details");
        Assert.False(result.Success);
        Assert.Equal("id-2", result.Id);
        Assert.Equal("CODE", result.ErrorInfo!.Code);
        Assert.Equal("message", result.ErrorInfo!.Message);
        Assert.Equal("details", result.ErrorInfo!.Details);
    }
}

public class UserDataParamsTests
{
    [Fact]
    public void Deserialize_DocumentType_MapsToLabelType()
    {
        var userData = JsonConvert.DeserializeObject<UserDataParams>(
            @"{""userId"":""demo-user"",""documentType"":""receipt""}",
            JsonConfig.CamelCase);

        Assert.Equal("demo-user", userData!.UserId);
        Assert.Equal("receipt", userData.LabelType);
        Assert.Equal("receipt", userData.DocumentType);
    }

    [Fact]
    public void Deserialize_LabelType_RemainsSupported()
    {
        var userData = JsonConvert.DeserializeObject<UserDataParams>(
            @"{""userId"":""demo-user"",""labelType"":""shipping""}",
            JsonConfig.CamelCase);

        Assert.Equal("shipping", userData!.LabelType);
        Assert.Equal("shipping", userData.DocumentType);
    }

    [Fact]
    public void Serialize_OmitsDocumentTypeAlias()
    {
        var json = JsonConvert.SerializeObject(new UserDataParams
        {
            UserId = "demo-user",
            LabelType = "receipt"
        }, JsonConfig.CamelCase);
        var token = JObject.Parse(json);

        Assert.Equal("demo-user", token["userId"]!.ToString());
        Assert.Equal("receipt", token["labelType"]!.ToString());
        Assert.Null(token["documentType"]);
    }
}
