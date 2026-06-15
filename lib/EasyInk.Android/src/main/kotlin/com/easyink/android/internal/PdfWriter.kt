package com.easyink.android.internal

import android.graphics.pdf.PdfDocument
import android.webkit.WebView
import com.easyink.android.EasyInkPdfOptions
import com.easyink.android.EasyInkRenderErrorCode
import com.easyink.android.EasyInkRenderException
import com.easyink.android.EasyInkRenderedPage
import java.io.File
import java.io.FileOutputStream

internal object PdfWriter {
    suspend fun write(
        webView: WebView,
        pages: List<EasyInkRenderedPage>,
        rects: List<RenderedPageRect>,
        options: EasyInkPdfOptions,
        output: File,
    ) {
        if (pages.isEmpty()) {
            throw EasyInkRenderException(EasyInkRenderErrorCode.OUTPUT_FAILED, "Rendered page metrics are missing.")
        }
        output.parentFile?.mkdirs()
        if (output.exists()) {
            output.delete()
        }

        MainThread.run {
            val document = PdfDocument()
            try {
                pages.forEach { page ->
                    val rect = rects.firstOrNull { it.index == page.index }
                    val widthPt = mmToPoints(options.paperWidthMm ?: page.widthMm)
                    val heightPt = mmToPoints(options.paperHeightMm ?: page.heightMm)
                    val pageInfo = PdfDocument.PageInfo.Builder(widthPt, heightPt, page.index + 1).create()
                    val pdfPage = document.startPage(pageInfo)
                    val canvas = pdfPage.canvas
                    if (rect != null && rect.widthPx > 0f && rect.heightPx > 0f) {
                        canvas.scale(widthPt / rect.widthPx, heightPt / rect.heightPx)
                        canvas.translate(-rect.leftPx, -rect.topPx)
                    }
                    webView.draw(canvas)
                    document.finishPage(pdfPage)
                }
                FileOutputStream(output).use { stream ->
                    document.writeTo(stream)
                }
            }
            finally {
                document.close()
            }
        }

        if (!output.isFile || output.length() <= 0) {
            throw EasyInkRenderException(EasyInkRenderErrorCode.OUTPUT_FAILED, "PDF output is empty.")
        }
    }

    private fun mmToPoints(value: Double): Int {
        return (value / 25.4 * 72.0).toInt().coerceAtLeast(1)
    }
}
