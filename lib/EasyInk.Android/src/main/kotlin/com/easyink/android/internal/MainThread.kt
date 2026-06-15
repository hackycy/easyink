package com.easyink.android.internal

import android.os.Handler
import android.os.Looper
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

internal object MainThread {
    private val handler = Handler(Looper.getMainLooper())

    suspend fun <T> run(block: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            return block()
        }
        return suspendCoroutine { continuation ->
            handler.post {
                try {
                    continuation.resume(block())
                }
                catch (error: Throwable) {
                    continuation.resumeWithException(error)
                }
            }
        }
    }

    fun post(block: () -> Unit) {
        handler.post(block)
    }
}
