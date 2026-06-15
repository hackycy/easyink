package com.easyink.android

import android.graphics.Color
import java.io.File

data class EasyInkRenderRequest(
    val requestId: String,
    val source: EasyInkRenderSource,
    val pdf: EasyInkPdfOptions = EasyInkPdfOptions(),
    val wait: EasyInkWaitOptions = EasyInkWaitOptions(),
    val security: EasyInkSecurityOptions = EasyInkSecurityOptions(),
    val diagnostics: EasyInkDiagnosticsOptions = EasyInkDiagnosticsOptions(),
)

sealed interface EasyInkRenderSource {
    data class Html(
        val html: String,
        val baseUrl: String? = null,
        val resources: List<EasyInkResource> = emptyList(),
        val fonts: List<EasyInkFontResource> = emptyList(),
    ) : EasyInkRenderSource

    data class Schema(
        val schemaJson: String,
        val dataJson: String = "{}",
        val resources: List<EasyInkResource> = emptyList(),
        val fonts: List<EasyInkFontResource> = emptyList(),
    ) : EasyInkRenderSource
}

data class EasyInkPdfOptions(
    val paperWidthMm: Double? = null,
    val paperHeightMm: Double? = null,
    val preferCSSPageSize: Boolean = true,
    val marginMm: EasyInkMarginMm = EasyInkMarginMm(),
    val printBackground: Boolean = true,
)

data class EasyInkMarginMm(
    val top: Double = 0.0,
    val right: Double = 0.0,
    val bottom: Double = 0.0,
    val left: Double = 0.0,
)

data class EasyInkWaitOptions(
    val until: EasyInkWaitUntil = EasyInkWaitUntil.AUTO,
    val selector: String? = null,
    val timeoutMs: Long = 10_000,
)

enum class EasyInkWaitUntil {
    AUTO,
    LOAD,
    SELECTOR,
    EASYINK_READY,
}

data class EasyInkSecurityOptions(
    val allowFileAccess: Boolean = false,
    val allowedOrigins: List<String> = emptyList(),
    val maxInputBytes: Int = 5 * 1024 * 1024,
)

data class EasyInkDiagnosticsOptions(
    val captureConsole: Boolean = true,
)

data class EasyInkResource(
    val url: String,
    val contentType: String,
    val base64: String,
)

data class EasyInkFontResource(
    val family: String,
    val url: String,
    val contentType: String,
    val base64: String,
    val weight: String? = null,
    val style: String? = null,
)

data class EasyInkImageOptions(
    val format: EasyInkImageFormat = EasyInkImageFormat.PNG,
    val scale: Float = 2f,
    val backgroundColor: Int = Color.WHITE,
)

enum class EasyInkImageFormat {
    PNG,
    JPEG,
}

data class EasyInkRenderResult(
    val requestId: String,
    val output: File,
    val pageCount: Int,
    val pages: List<EasyInkRenderedPage>,
    val diagnostics: EasyInkDiagnostics,
)

data class EasyInkImageRenderResult(
    val requestId: String,
    val outputDir: File,
    val files: List<File>,
    val pages: List<EasyInkRenderedPage>,
    val diagnostics: EasyInkDiagnostics,
)

data class EasyInkRenderedPage(
    val index: Int,
    val widthMm: Double,
    val heightMm: Double,
)

data class EasyInkDiagnostics(
    val requestId: String,
    val runtimeVersion: String,
    val webViewVersion: String?,
    val durationMs: Long,
    val consoleErrors: List<String>,
    val failedRequests: List<String>,
    val warnings: List<String>,
)

class EasyInkRenderException(
    val code: EasyInkRenderErrorCode,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

enum class EasyInkRenderErrorCode {
    INVALID_REQUEST,
    WEBVIEW_LOAD_FAILED,
    WAIT_TIMEOUT,
    RUNTIME_ERROR,
    OUTPUT_FAILED,
    UNSUPPORTED,
}
