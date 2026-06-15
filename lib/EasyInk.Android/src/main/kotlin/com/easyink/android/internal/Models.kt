package com.easyink.android.internal

import com.easyink.android.EasyInkRenderedPage

internal const val RUNTIME_VERSION = "easyink-viewer-embedded-0.1.0"

internal data class PreparedRequest(
    val requestId: String,
    val html: String,
    val pages: List<EasyInkRenderedPage>,
)

internal data class PageDefinition(
    val widthMm: Double,
    val heightMm: Double,
)

internal data class RenderedPageRect(
    val index: Int,
    val leftPx: Float,
    val topPx: Float,
    val widthPx: Float,
    val heightPx: Float,
)
