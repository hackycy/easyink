package com.easyink.android.internal

import java.util.concurrent.Semaphore
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

internal object RenderQueue {
    private val semaphore = Semaphore(1, true)

    suspend fun <T> run(block: suspend () -> T): T {
        acquire()
        try {
            return block()
        }
        finally {
            semaphore.release()
        }
    }

    private suspend fun acquire() {
        return suspendCoroutine { continuation ->
            Thread {
                try {
                    semaphore.acquire()
                    continuation.resume(Unit)
                }
                catch (error: Throwable) {
                    continuation.resumeWithException(error)
                }
            }.start()
        }
    }
}
