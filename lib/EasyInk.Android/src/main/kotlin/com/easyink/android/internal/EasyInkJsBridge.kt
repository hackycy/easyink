package com.easyink.android.internal

import android.webkit.JavascriptInterface

internal class EasyInkJsBridge(private val diagnostics: DiagnosticsCollector) {
    @JavascriptInterface
    fun reportDiagnostic(level: String, message: String) {
        if (level == "error") {
            diagnostics.consoleError(message)
            return
        }
        diagnostics.warning(message)
    }
}
