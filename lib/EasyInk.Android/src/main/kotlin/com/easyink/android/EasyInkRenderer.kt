package com.easyink.android

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.easyink.android.internal.AndroidRenderEngine
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

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

    @JvmStatic
    fun renderPdfAsync(
        context: Context,
        request: EasyInkRenderRequest,
        output: File,
        callback: EasyInkRenderCallback<EasyInkRenderResult>,
    ): EasyInkRenderTask {
        return startAsync(callback) {
            renderPdf(context, request, output)
        }
    }

    @JvmStatic
    @JvmOverloads
    fun renderImagesAsync(
        context: Context,
        request: EasyInkRenderRequest,
        outputDir: File,
        options: EasyInkImageOptions = EasyInkImageOptions(),
        callback: EasyInkRenderCallback<EasyInkImageRenderResult>,
    ): EasyInkRenderTask {
        return startAsync(callback) {
            renderImages(context, request, outputDir, options)
        }
    }

    private fun <T> startAsync(
        callback: EasyInkRenderCallback<T>,
        block: suspend () -> T,
    ): EasyInkRenderTask {
        val task = EasyInkRenderTaskHandle()
        block.startCoroutine(object : Continuation<T> {
            override val context = EmptyCoroutineContext

            override fun resumeWith(result: Result<T>) {
                if (task.isCancelled) {
                    return
                }
                mainHandler.post {
                    if (task.isCancelled) {
                        return@post
                    }
                    result.fold(
                        onSuccess = callback::onSuccess,
                        onFailure = { callback.onError(it.toRenderException()) },
                    )
                }
            }
        })
        return task
    }

    private fun Throwable.toRenderException(): EasyInkRenderException {
        return this as? EasyInkRenderException
            ?: EasyInkRenderException(
                code = EasyInkRenderErrorCode.RUNTIME_ERROR,
                message = message ?: "EasyInk render failed.",
                cause = this,
            )
    }

    private val mainHandler = Handler(Looper.getMainLooper())
}

interface EasyInkRenderCallback<T> {
    fun onSuccess(result: T)

    fun onError(error: EasyInkRenderException)
}

interface EasyInkRenderTask {
    fun cancel()

    val isCancelled: Boolean
}

private class EasyInkRenderTaskHandle : EasyInkRenderTask {
    private val cancelled = AtomicBoolean(false)

    override fun cancel() {
        cancelled.set(true)
    }

    override val isCancelled: Boolean
        get() = cancelled.get()
}
