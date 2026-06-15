package com.easyink.android.internal

import com.easyink.android.EasyInkDiagnostics

internal class DiagnosticsCollector(private val requestId: String) {
    private val startedAt = System.currentTimeMillis()
    private val consoleErrors = mutableListOf<String>()
    private val failedRequests = mutableListOf<String>()
    private val warnings = mutableListOf<String>()

    fun consoleError(message: String) {
        consoleErrors += message
    }

    fun failedRequest(message: String) {
        failedRequests += message
    }

    fun warning(message: String) {
        warnings += message
    }

    fun build(runtimeVersion: String, webViewVersion: String?): EasyInkDiagnostics {
        return EasyInkDiagnostics(
            requestId = requestId,
            runtimeVersion = runtimeVersion,
            webViewVersion = webViewVersion,
            durationMs = System.currentTimeMillis() - startedAt,
            consoleErrors = consoleErrors.toList(),
            failedRequests = failedRequests.toList(),
            warnings = warnings.toList(),
        )
    }
}
