package com.easyink.android

import android.content.Context
import com.easyink.android.internal.AndroidRenderEngine
import java.io.File

object EasyInkRenderer {
    suspend fun renderPdf(
        context: Context,
        request: EasyInkRenderRequest,
        output: File,
    ): EasyInkRenderResult {
        return AndroidRenderEngine.renderPdf(context.applicationContext, request, output)
    }

    suspend fun renderImages(
        context: Context,
        request: EasyInkRenderRequest,
        outputDir: File,
        options: EasyInkImageOptions = EasyInkImageOptions(),
    ): EasyInkImageRenderResult {
        return AndroidRenderEngine.renderImages(context.applicationContext, request, outputDir, options)
    }
}
