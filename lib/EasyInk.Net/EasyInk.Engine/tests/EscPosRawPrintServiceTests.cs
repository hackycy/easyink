using System.Linq;
using EasyInk.Engine.Services;
using Xunit;

namespace EasyInk.Engine.Tests;

public class EscPosRawPrintServiceTests
{
    [Fact]
    public void BuildPrintBatches_FeedsToCutterBeforeCut()
    {
        var band = new byte[] { 0x1D, 0x76, 0x30, 0x00 };

        var batches = EscPosRawPrintService.BuildPrintBatches(new[] { band }, copies: 1);

        Assert.Equal(4, batches.Length);
        Assert.Equal(new byte[] { 0x1B, 0x40, 0x1B, 0x33, 0x18 }, batches[0]);
        Assert.Same(band, batches[1]);
        Assert.Equal(new byte[] { 0x1B, 0x64, 0x06 }, batches[2]);
        Assert.Equal(new byte[] { 0x1D, 0x56, 0x01 }, batches[3]);
    }

    [Fact]
    public void BuildPrintBatches_AddsTailCommandsForEachCopy()
    {
        var band = new byte[] { 0x01 };

        var batches = EscPosRawPrintService.BuildPrintBatches(new[] { band }, copies: 2);

        Assert.Equal(8, batches.Length);
        Assert.Equal(new byte[] { 0x1B, 0x64, 0x06 }, batches[2]);
        Assert.Equal(new byte[] { 0x1D, 0x56, 0x01 }, batches[3]);
        Assert.Equal(new byte[] { 0x1B, 0x64, 0x06 }, batches[6]);
        Assert.Equal(new byte[] { 0x1D, 0x56, 0x01 }, batches[7]);
        Assert.Equal(2, batches.Count(batch => batch.SequenceEqual(band)));
    }
}
