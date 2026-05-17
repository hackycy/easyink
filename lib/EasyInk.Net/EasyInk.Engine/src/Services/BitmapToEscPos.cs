using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

namespace EasyInk.Engine.Services;

/// <summary>
/// 灰度位图 → ESC/POS 位图指令。优先使用 GS v 0 raster 格式，也保留
/// ESC * m=33 (24-dot double-density) column-major 格式，
/// 兼容 Epson 及国产热敏打印机。
/// </summary>
internal static class BitmapToEscPos
{
    private const byte ESC = 0x1B;
    private const byte GS = 0x1D;
    private const int STRIP_HEIGHT = 24; // ESC * m=33: 24 dots per column
    private const int DEFAULT_RASTER_BAND_HEIGHT = 256;

    public static byte[] CmdInit() => new byte[] { ESC, 0x40, ESC, 0x33, 0x18 }; // ESC @  ESC 3 24
    public static byte[] CmdCut() => new byte[] { GS, 0x56, 0x01 };               // GS V 1, no-feed cut

    public static byte[] CmdFeedLines(int lines)
    {
        if (lines < 0 || lines > 255)
            throw new ArgumentOutOfRangeException(nameof(lines), "Feed lines must be between 0 and 255.");

        return new byte[] { ESC, 0x64, (byte)lines }; // ESC d n
    }

    /// <summary>
    /// GS v 0 raster bit image: row-major, width is measured in bytes.
    /// Banding keeps each WritePrinter chunk small enough for receipt-printer buffers.
    /// </summary>
    public static List<byte[]> ConvertToRasterBands(Bitmap bitmap, int maxBandHeight = DEFAULT_RASTER_BAND_HEIGHT)
    {
        if (maxBandHeight <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxBandHeight), "Band height must be greater than 0.");

        int w = bitmap.Width;
        int h = bitmap.Height;
        int widthBytes = (w + 7) / 8;
        var bands = new List<byte[]>();

        for (int startY = 0; startY < h; startY += maxBandHeight)
        {
            int bandH = Math.Min(maxBandHeight, h - startY);
            bands.Add(BuildRasterBand(bitmap, w, widthBytes, startY, bandH));
        }

        return bands;
    }

    /// <summary>
    /// ESC * m=33: 24-dot double-density, column-major.
    /// 每个 strip 24 点高，每列 3 字节 (top/mid/bot 各 8 点)，bit7=最上。
    /// </summary>
    public static List<byte[]> ConvertToStrips(Bitmap grayBitmap)
    {
        int w = grayBitmap.Width;
        int h = grayBitmap.Height;
        var strips = new List<byte[]>();

        for (int startY = 0; startY < h; startY += STRIP_HEIGHT)
        {
            int stripH = Math.Min(STRIP_HEIGHT, h - startY);
            strips.Add(BuildStrip(grayBitmap, w, startY, stripH));
        }

        return strips;
    }

    private static byte[] BuildStrip(Bitmap src, int w, int startY, int stripHeight)
    {
        // ESC * m nL nH d1...dk \n
        // m=33 (24-dot double-density), nL+nH*256 = width in columns
        int dataLen = w * 3; // 3 bytes per column for 24-dot mode
        var result = new byte[5 + dataLen + 1]; // ESC * m nL nH + data + \n
        result[0] = ESC;
        result[1] = 0x2A; // '*'
        result[2] = 33;   // m = 24-dot double-density
        result[3] = (byte)(w & 0xFF);     // nL
        result[4] = (byte)((w >> 8) & 0xFF); // nH

        var bmpData = src.LockBits(
            new Rectangle(0, startY, w, stripHeight),
            ImageLockMode.ReadOnly,
            PixelFormat.Format24bppRgb);
        int stride = bmpData.Stride;
        var rgb = new byte[stride * stripHeight];
        System.Runtime.InteropServices.Marshal.Copy(bmpData.Scan0, rgb, 0, rgb.Length);
        src.UnlockBits(bmpData);

        for (int col = 0; col < w; col++)
        {
            int baseOff = 5 + col * 3;
            // 3 bytes per column: top(0-7), mid(8-15), bot(16-23)
            // bit7 = topmost within each byte group
            for (int seg = 0; seg < 3; seg++)
            {
                byte val = 0;
                for (int bit = 0; bit < 8; bit++)
                {
                    int py = seg * 8 + bit;
                    if (py >= stripHeight) break;
                    int offset = py * stride + col * 3;
                    if (IsBlackPixel(rgb, offset))
                        val |= (byte)(0x80 >> bit); // 0x80=最上
                }
                result[baseOff + seg] = val;
            }
        }
        // 末尾 \n (line feed)
        result[5 + dataLen] = 0x0A;

        return result;
    }

    private static byte[] BuildRasterBand(Bitmap src, int w, int widthBytes, int startY, int bandHeight)
    {
        // GS v 0 m xL xH yL yH d1...dk
        // m=0 normal size; x is width in bytes, y is height in dots.
        int dataLen = widthBytes * bandHeight;
        var result = new byte[8 + dataLen];
        result[0] = GS;
        result[1] = 0x76; // 'v'
        result[2] = 0x30; // '0'
        result[3] = 0;
        result[4] = (byte)(widthBytes & 0xFF);
        result[5] = (byte)((widthBytes >> 8) & 0xFF);
        result[6] = (byte)(bandHeight & 0xFF);
        result[7] = (byte)((bandHeight >> 8) & 0xFF);

        var bmpData = src.LockBits(
            new Rectangle(0, startY, w, bandHeight),
            ImageLockMode.ReadOnly,
            PixelFormat.Format24bppRgb);
        int stride = bmpData.Stride;
        var rgb = new byte[stride * bandHeight];
        System.Runtime.InteropServices.Marshal.Copy(bmpData.Scan0, rgb, 0, rgb.Length);
        src.UnlockBits(bmpData);

        for (int y = 0; y < bandHeight; y++)
        {
            int rowOffset = y * stride;
            int outputRowOffset = 8 + y * widthBytes;
            for (int byteX = 0; byteX < widthBytes; byteX++)
            {
                byte val = 0;
                for (int bit = 0; bit < 8; bit++)
                {
                    int x = byteX * 8 + bit;
                    if (x >= w) break;

                    int offset = rowOffset + x * 3;
                    if (IsBlackPixel(rgb, offset))
                        val |= (byte)(0x80 >> bit);
                }
                result[outputRowOffset + byteX] = val;
            }
        }

        return result;
    }

    private static bool IsBlackPixel(byte[] bgr, int offset)
    {
        int b = bgr[offset];
        int g = bgr[offset + 1];
        int r = bgr[offset + 2];
        int luminance = (r * 299 + g * 587 + b * 114) / 1000;
        return luminance < 128;
    }
}
