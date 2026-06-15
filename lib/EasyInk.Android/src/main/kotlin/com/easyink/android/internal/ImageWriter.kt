package com.easyink.android.internal

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.webkit.WebView
import com.easyink.android.EasyInkImageFormat
import com.easyink.android.EasyInkImageOptions
import com.easyink.android.EasyInkRenderErrorCode
import com.easyink.android.EasyInkRenderException
import com.easyink.android.EasyInkRenderedPage
import java.io.File
import java.io.FileOutputStream
import java.util.Locale

internal object ImageWriter {
    suspend fun write(
        webView: WebView,
        pages: List<EasyInkRenderedPage>,
        rects: List<RenderedPageRect>,
        outputDir: File,
        options: EasyInkImageOptions,
        requestId: String,
    ): List<File> {
        if (pages.isEmpty()) {
            throw EasyInkRenderException(EasyInkRenderErrorCode.OUTPUT_FAILED, "Rendered page metrics are missing.")
        }
        if (options.scale <= 0f) {
            throw EasyInkRenderException(EasyInkRenderErrorCode.INVALID_REQUEST, "Image scale must be greater than 0.")
        }
        outputDir.mkdirs()

        return MainThread.run {
            pages.map { page ->
                val rect = rects.firstOrNull { it.index == page.index }
                    ?: fallbackRect(page)
                val widthPx = (rect.widthPx * options.scale).toInt().coerceAtLeast(1)
                val heightPx = (rect.heightPx * options.scale).toInt().coerceAtLeast(1)
                ensureBitmapSize(widthPx, heightPx)

                val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
                try {
                    val canvas = Canvas(bitmap)
                    canvas.drawColor(options.backgroundColor)
                    canvas.scale(options.scale, options.scale)
                    canvas.translate(-rect.leftPx, -rect.topPx)
                    webView.draw(canvas)
                    val output = File(outputDir, outputName(requestId, page.index, options.format))
                    FileOutputStream(output).use { stream ->
                        val format = when (options.format) {
                            EasyInkImageFormat.PNG -> Bitmap.CompressFormat.PNG
                            EasyInkImageFormat.JPEG -> Bitmap.CompressFormat.JPEG
                        }
                        if (!bitmap.compress(format, 95, stream)) {
                            throw EasyInkRenderException(EasyInkRenderErrorCode.OUTPUT_FAILED, "Image encode failed.")
                        }
                    }
                    if (!output.isFile || output.length() <= 0) {
                        throw EasyInkRenderException(EasyInkRenderErrorCode.OUTPUT_FAILED, "Image output is empty.")
                    }
                    output
                }
                finally {
                    bitmap.recycle()
                }
            }
        }
    }

    private fun fallbackRect(page: EasyInkRenderedPage): RenderedPageRect {
        return RenderedPageRect(
            index = page.index,
            leftPx = 0f,
            topPx = 0f,
            widthPx = (page.widthMm / 25.4 * 96.0).toFloat(),
            heightPx = (page.heightMm / 25.4 * 96.0).toFloat(),
        )
    }

    private fun ensureBitmapSize(widthPx: Int, heightPx: Int) {
        if (widthPx > MAX_BITMAP_SIDE || heightPx > MAX_BITMAP_SIDE) {
            throw EasyInkRenderException(
                EasyInkRenderErrorCode.OUTPUT_FAILED,
                "Image bitmap is too large: ${widthPx}x$heightPx.",
            )
        }
        val bytes = widthPx.toLong() * heightPx.toLong() * 4L
        if (bytes > MAX_BITMAP_BYTES) {
            throw EasyInkRenderException(
                EasyInkRenderErrorCode.OUTPUT_FAILED,
                "Image bitmap exceeds memory limit: ${bytes / 1024 / 1024} MiB.",
            )
        }
    }

    private fun outputName(requestId: String, index: Int, format: EasyInkImageFormat): String {
        val extension = when (format) {
            EasyInkImageFormat.PNG -> "png"
            EasyInkImageFormat.JPEG -> "jpg"
        }
        return "${requestId.sanitize()}-${String.format(Locale.US, "%03d", index + 1)}.$extension"
    }

    private fun String.sanitize(): String {
        return replace(Regex("[^A-Za-z0-9._-]+"), "-").trim('-').ifBlank { "easyink" }
    }

    private const val MAX_BITMAP_SIDE = 32767
    private const val MAX_BITMAP_BYTES = 256L * 1024L * 1024L
}
