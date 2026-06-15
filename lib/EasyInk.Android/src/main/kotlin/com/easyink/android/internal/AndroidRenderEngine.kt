package com.easyink.android.internal

import android.content.Context
import android.os.Build
import android.webkit.WebView
import com.easyink.android.EasyInkRenderRequest
import com.easyink.android.EasyInkRenderResult
import com.easyink.android.EasyInkImageOptions
import com.easyink.android.EasyInkImageRenderResult
import java.io.File

internal object AndroidRenderEngine {
    suspend fun renderPdf(
        context: Context,
        request: EasyInkRenderRequest,
        output: File,
    ): EasyInkRenderResult {
        return RenderQueue.run {
            val diagnostics = DiagnosticsCollector(request.requestId)
            val prepared = RequestPreparer(context).prepare(request)
            val server = RuntimeAssetServer(prepared, request.source, diagnostics)
            var session: WebViewSession? = null
            try {
                server.start()
                session = WebViewSession(context, request, prepared, diagnostics)
                val rendered = session.load(server.url)
                PdfWriter.write(rendered.webView, rendered.pages, rendered.rects, request.pdf, output)
                EasyInkRenderResult(
                    requestId = request.requestId,
                    output = output,
                    pageCount = rendered.pages.size,
                    pages = rendered.pages,
                    diagnostics = diagnostics.build(RUNTIME_VERSION, webViewVersion(context)),
                )
            }
            finally {
                session?.dispose()
                server.close()
            }
        }
    }

    suspend fun renderImages(
        context: Context,
        request: EasyInkRenderRequest,
        outputDir: File,
        options: EasyInkImageOptions,
    ): EasyInkImageRenderResult {
        return RenderQueue.run {
            val diagnostics = DiagnosticsCollector(request.requestId)
            val prepared = RequestPreparer(context).prepare(request)
            val server = RuntimeAssetServer(prepared, request.source, diagnostics)
            var session: WebViewSession? = null
            try {
                server.start()
                session = WebViewSession(context, request, prepared, diagnostics)
                val rendered = session.load(server.url)
                val files = ImageWriter.write(rendered.webView, rendered.pages, rendered.rects, outputDir, options, request.requestId)
                EasyInkImageRenderResult(
                    requestId = request.requestId,
                    outputDir = outputDir,
                    files = files,
                    pages = rendered.pages,
                    diagnostics = diagnostics.build(RUNTIME_VERSION, webViewVersion(context)),
                )
            }
            finally {
                session?.dispose()
                server.close()
            }
        }
    }

    private fun webViewVersion(context: Context): String? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WebView.getCurrentWebViewPackage()?.versionName
        }
        else {
            null
        }
    }
}
