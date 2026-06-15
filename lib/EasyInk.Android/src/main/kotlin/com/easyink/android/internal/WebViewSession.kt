package com.easyink.android.internal

import android.annotation.SuppressLint
import android.content.Context
import android.net.http.SslError
import android.os.Build
import android.webkit.ConsoleMessage
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.easyink.android.EasyInkRenderErrorCode
import com.easyink.android.EasyInkRenderException
import com.easyink.android.EasyInkRenderRequest
import com.easyink.android.EasyInkRenderedPage
import com.easyink.android.EasyInkWaitUntil
import org.json.JSONArray
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

internal class WebViewSession(
    private val context: Context,
    private val request: EasyInkRenderRequest,
    private val prepared: PreparedRequest,
    private val diagnostics: DiagnosticsCollector,
) {
    private var webView: WebView? = null
    private val scheduler = Executors.newSingleThreadScheduledExecutor()

    suspend fun load(url: String): RenderedWebView {
        return MainThread.run {
            val view = createWebView()
            webView = view
            view.loadUrl(url)
            view
        }.let { view ->
            waitUntilReady(view)
            val pages = readPages(view)
            val renderedPages = if (pages.isNotEmpty()) pages else prepared.pages
            layoutForPages(view, renderedPages)
            val rects = readPageRects(view, renderedPages)
            RenderedWebView(view, renderedPages, rects)
        }
    }

    suspend fun dispose() {
        MainThread.run {
            webView?.apply {
                stopLoading()
                removeJavascriptInterface(JS_BRIDGE_NAME)
                loadUrl("about:blank")
                destroy()
            }
            webView = null
        }
        scheduler.shutdownNow()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView {
        val view = WebView(context)
        view.settings.javaScriptEnabled = true
        view.settings.allowFileAccess = request.security.allowFileAccess
        view.settings.allowContentAccess = false
        view.settings.domStorageEnabled = false
        view.settings.databaseEnabled = false
        view.settings.cacheMode = WebSettings.LOAD_NO_CACHE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            view.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        view.addJavascriptInterface(EasyInkJsBridge(diagnostics), JS_BRIDGE_NAME)
        view.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                val message = "${consoleMessage.messageLevel()}: ${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})"
                if (consoleMessage.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    diagnostics.consoleError(message)
                }
                return true
            }
        }
        view.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                diagnostics.failedRequest("${request.url}: ${error.description}")
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                diagnostics.failedRequest("SSL error: ${error.url}")
                handler.cancel()
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "http" && uri.host == "127.0.0.1") {
                    return false
                }
                if ((uri.scheme == "http" || uri.scheme == "https") && request.url.toString().originAllowed()) {
                    return false
                }
                diagnostics.failedRequest("Blocked navigation: $uri")
                return true
            }
        }
        return view
    }

    private suspend fun waitUntilReady(view: WebView) {
        val wait = request.wait
        val until = when (wait.until) {
            EasyInkWaitUntil.AUTO -> {
                if (request.source is com.easyink.android.EasyInkRenderSource.Schema) {
                    EasyInkWaitUntil.EASYINK_READY
                }
                else {
                    EasyInkWaitUntil.LOAD
                }
            }
            else -> wait.until
        }
        val expression = when (until) {
            EasyInkWaitUntil.AUTO -> "true"
            EasyInkWaitUntil.LOAD -> "document.readyState === 'complete'"
            EasyInkWaitUntil.SELECTOR -> {
                val selector = wait.selector ?: ".easyink-ready"
                "document.querySelector(${selector.jsString()}) !== null"
            }
            EasyInkWaitUntil.EASYINK_READY -> "window.easyinkReady === true || document.querySelector('.easyink-ready') !== null"
        }
        pollExpression(view, expression, wait.timeoutMs)
    }

    private suspend fun pollExpression(view: WebView, expression: String, timeoutMs: Long) {
        return suspendCoroutine { continuation ->
            val completed = AtomicBoolean(false)
            val started = System.currentTimeMillis()

            fun fail(error: Throwable) {
                if (completed.compareAndSet(false, true)) {
                    continuation.resumeWithException(error)
                }
            }

            fun tick() {
                if (completed.get()) {
                    return
                }
                if (System.currentTimeMillis() - started > timeoutMs) {
                    fail(EasyInkRenderException(EasyInkRenderErrorCode.WAIT_TIMEOUT, "Timed out waiting for render readiness."))
                    return
                }
                MainThread.post {
                    view.evaluateJavascript("Boolean($expression)") { value ->
                        if (value == "true") {
                            if (completed.compareAndSet(false, true)) {
                                continuation.resume(Unit)
                            }
                        }
                        else {
                            scheduler.schedule({ tick() }, 100, java.util.concurrent.TimeUnit.MILLISECONDS)
                        }
                    }
                }
            }

            scheduler.execute { tick() }
        }
    }

    private suspend fun readPages(view: WebView): List<EasyInkRenderedPage> {
        val script = """
            (function () {
              var pages = window.__easyinkGetPages ? window.__easyinkGetPages() : window.easyinkRenderedPages;
              return JSON.stringify(pages || []);
            })()
        """.trimIndent()
        val json = evaluate(view, script)
        val text = if (json.startsWith("\"")) {
            org.json.JSONTokener(json).nextValue() as? String ?: "[]"
        }
        else {
            json
        }
        val array = JSONArray(text)
        return (0 until array.length()).map { index ->
            val item = array.getJSONObject(index)
            EasyInkRenderedPage(
                index = item.optInt("index", index),
                widthMm = item.optDouble("width"),
                heightMm = item.optDouble("height"),
            )
        }.filter { it.widthMm > 0.0 && it.heightMm > 0.0 }
    }

    private suspend fun layoutForPages(view: WebView, pages: List<EasyInkRenderedPage>) {
        val widthPx = pages.maxOfOrNull { mmToPx(it.widthMm) } ?: 1
        val heightPx = pages.sumOf { mmToPx(it.heightMm).toInt() }.coerceAtLeast(1)
        MainThread.run {
            view.measure(
                android.view.View.MeasureSpec.makeMeasureSpec(widthPx, android.view.View.MeasureSpec.EXACTLY),
                android.view.View.MeasureSpec.makeMeasureSpec(heightPx, android.view.View.MeasureSpec.EXACTLY),
            )
            view.layout(0, 0, widthPx, heightPx)
        }
    }

    private suspend fun readPageRects(
        view: WebView,
        pages: List<EasyInkRenderedPage>,
    ): List<RenderedPageRect> {
        val script = """
            (function () {
              var nodes = Array.prototype.slice.call(document.querySelectorAll('.ei-viewer-page'));
              return JSON.stringify(nodes.map(function (node, index) {
                var rect = node.getBoundingClientRect();
                return {
                  index: Number(node.getAttribute('data-page-index') || index),
                  left: rect.left + window.scrollX,
                  top: rect.top + window.scrollY,
                  width: rect.width,
                  height: rect.height
                };
              }));
            })()
        """.trimIndent()
        val json = evaluate(view, script)
        val text = if (json.startsWith("\"")) {
            org.json.JSONTokener(json).nextValue() as? String ?: "[]"
        }
        else {
            json
        }
        val array = JSONArray(text)
        val rects = (0 until array.length()).map { index ->
            val item = array.getJSONObject(index)
            RenderedPageRect(
                index = item.optInt("index", index),
                leftPx = item.optDouble("left").toFloat(),
                topPx = item.optDouble("top").toFloat(),
                widthPx = item.optDouble("width").toFloat(),
                heightPx = item.optDouble("height").toFloat(),
            )
        }.filter { it.widthPx > 0f && it.heightPx > 0f }
        if (rects.isNotEmpty()) {
            return rects
        }

        var top = 0f
        return pages.map { page ->
            val rect = RenderedPageRect(
                index = page.index,
                leftPx = 0f,
                topPx = top,
                widthPx = mmToPx(page.widthMm).toFloat(),
                heightPx = mmToPx(page.heightMm).toFloat(),
            )
            top += rect.heightPx
            rect
        }
    }

    private suspend fun evaluate(view: WebView, script: String): String {
        return suspendCoroutine { continuation ->
            MainThread.post {
                view.evaluateJavascript(script) { value ->
                    continuation.resume(value ?: "null")
                }
            }
        }
    }

    private fun String.originAllowed(): Boolean {
        return request.security.allowedOrigins.any { allowed -> startsWith(allowed) }
    }

    private fun String.jsString(): String {
        return "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""
    }

    private fun mmToPx(value: Double): Int {
        return (value / 25.4 * 96.0).toInt().coerceAtLeast(1)
    }

    companion object {
        private const val JS_BRIDGE_NAME = "EasyInkAndroid"
    }
}

internal data class RenderedWebView(
    val webView: WebView,
    val pages: List<EasyInkRenderedPage>,
    val rects: List<RenderedPageRect>,
)
