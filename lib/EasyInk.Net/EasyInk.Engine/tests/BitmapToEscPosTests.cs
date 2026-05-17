using System.Drawing;
using System.Drawing.Imaging;
using System.Linq;
using EasyInk.Engine.Services;
using Xunit;

namespace EasyInk.Engine.Tests;

public class BitmapToEscPosTests
{
    [Fact]
    public void ConvertToRasterBands_PacksRowsAsGsV0Data()
    {
        using var bitmap = new Bitmap(9, 2, PixelFormat.Format24bppRgb);
        using (var graphics = Graphics.FromImage(bitmap))
            graphics.Clear(Color.White);

        bitmap.SetPixel(0, 0, Color.Black);
        bitmap.SetPixel(7, 0, Color.Black);
        bitmap.SetPixel(8, 1, Color.Black);

        var bands = BitmapToEscPos.ConvertToRasterBands(bitmap);

        Assert.Single(bands);
        Assert.Equal(new byte[] { 0x1D, 0x76, 0x30, 0x00, 0x02, 0x00, 0x02, 0x00 }, bands[0].Take(8).ToArray());
        Assert.Equal(0x81, bands[0][8]);
        Assert.Equal(0x00, bands[0][9]);
        Assert.Equal(0x00, bands[0][10]);
        Assert.Equal(0x80, bands[0][11]);
    }

    [Fact]
    public void ConvertToStrips_KeepsLastDataByteBeforeLineFeed()
    {
        using var bitmap = new Bitmap(1, 24, PixelFormat.Format24bppRgb);
        using (var graphics = Graphics.FromImage(bitmap))
            graphics.Clear(Color.Black);

        var strips = BitmapToEscPos.ConvertToStrips(bitmap);

        Assert.Single(strips);
        Assert.Equal(9, strips[0].Length);
        Assert.Equal(new byte[] { 0x1B, 0x2A, 0x21, 0x01, 0x00 }, strips[0].Take(5).ToArray());
        Assert.Equal(0xFF, strips[0][5]);
        Assert.Equal(0xFF, strips[0][6]);
        Assert.Equal(0xFF, strips[0][7]);
        Assert.Equal(0x0A, strips[0][8]);
    }

    [Fact]
    public void CmdFeedLines_UsesEscD()
    {
        var command = BitmapToEscPos.CmdFeedLines(6);

        Assert.Equal(new byte[] { 0x1B, 0x64, 0x06 }, command);
    }

    [Fact]
    public void CmdFeedLines_RejectsOutOfRangeLineCounts()
    {
        Assert.Throws<System.ArgumentOutOfRangeException>(() => BitmapToEscPos.CmdFeedLines(-1));
        Assert.Throws<System.ArgumentOutOfRangeException>(() => BitmapToEscPos.CmdFeedLines(256));
    }
}
