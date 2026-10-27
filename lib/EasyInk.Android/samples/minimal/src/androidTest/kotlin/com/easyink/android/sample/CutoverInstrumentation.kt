package com.easyink.android.sample

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.Button
import android.widget.TextView
import com.easyink.android.EasyInkRenderCallback
import com.easyink.android.EasyInkRenderException
import com.easyink.android.EasyInkRenderRequest
import com.easyink.android.EasyInkRenderResult
import com.easyink.android.EasyInkRenderSource
import com.easyink.android.EasyInkRenderer
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

// A platform runner keeps this real-device check independent of optional test libraries.
class CutoverInstrumentation : Instrumentation() {
    override fun onCreate(arguments: Bundle?) {
        super.onCreate(arguments)
        start()
    }

    override fun onStart() {
        var activity: Activity? = null
        var code = Activity.RESULT_CANCELED
        val result = Bundle()
        try {
            activity = startActivitySync(Intent(targetContext, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            val checks = JSONArray()
            for ((button, expected) in listOf(
                "Render HTML PDF" to "HTML PDF rendered",
                "Render HTML Images" to "HTML images rendered",
                "Render Schema PDF" to "Schema PDF rendered",
                "Render Schema Images" to "Schema images rendered",
            )) {
                checks.put(checkSample(activity, button, expected))
                sendStatus(0, Bundle().apply { putString("stream", "\nPassed: $button\n") })
            }
            checks.put(checkCleanup())
            awaitNoRuntimeWorkers()
            result.putString("stream", "\nEASYINK_CUTOVER " + JSONObject().apply {
                put("checks", checks)
                put("webView", WebView.getCurrentWebViewPackage()?.versionName)
                put("runtimeWorkersAfterCleanup", runtimeWorkers().size)
            })
            code = Activity.RESULT_OK
        }
        catch (error: Throwable) {
            result.putString("stream", "\n${error.stackTraceToString()}\n")
        }
        finally {
            activity?.let { current -> runOnMainSync { current.finish() } }
        }
        finish(code, result)
    }

    private fun checkSample(activity: Activity, button: String, expected: String): JSONObject {
        val before = outputFiles().map { it.path }.toSet()
        val content = activity.findViewById<View>(android.R.id.content)
        runOnMainSync {
            descendants(content).filterIsInstance<Button>().single { it.text.toString() == button }.performClick()
        }
        val deadline = SystemClock.elapsedRealtime() + 30_000
        var text = ""
        while (SystemClock.elapsedRealtime() < deadline) {
            runOnMainSync {
                text = descendants(content).filterIsInstance<TextView>().filter { it !is Button }.single().text.toString()
            }
            check(!text.startsWith("Render failed:")) { text }
            if (text.startsWith(expected)) break
            SystemClock.sleep(50)
        }
        check(text.startsWith(expected)) { "Sample timed out: $button; $text" }
        check(text.contains("Pages: 1") && text.contains("Warnings: 0") && text.contains("Console errors: 0")) { text }
        val files = outputFiles().filter { it.path !in before }
        check(files.size == 1) { "Expected one new sample output for $button: $files" }
        val file = files.single()
        val bitmap = if (file.extension == "pdf") {
            check(file.inputStream().use { String(it.readNBytes(5), Charsets.US_ASCII) } == "%PDF-")
            PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)).use { renderer ->
                check(renderer.pageCount == 1)
                renderer.openPage(0).use { page ->
                    Bitmap.createBitmap(page.width, page.height, Bitmap.Config.ARGB_8888).also {
                        it.eraseColor(Color.WHITE)
                        page.render(it, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    }
                }
            }
        }
        else {
            check(file.extension == "png")
            checkNotNull(BitmapFactory.decodeFile(file.path)) { "Invalid PNG: $file" }
        }
        val details = JSONObject().apply {
            put("sample", button)
            put("file", file.path)
            put("bytes", file.length())
            put("width", bitmap.width)
            put("height", bitmap.height)
        }
        try {
            val colors = mutableSetOf<Int>()
            for (y in 0 until bitmap.height step 3) {
                for (x in 0 until bitmap.width step 3) colors.add(bitmap.getPixel(x, y))
            }
            check(colors.size > 10) { "Blank or missing rendered content: $file (${colors.size} colors)" }
            if (button.contains("HTML")) {
                val blue = Color.rgb(37, 99, 235)
                for ((x, y) in listOf(0.99f to 0.5f, 0.5f to 0.99f)) {
                    val pixel = bitmap.getPixel((bitmap.width * x).toInt(), (bitmap.height * y).toInt())
                    check(kotlin.math.abs(Color.red(pixel) - Color.red(blue)) < 5 &&
                        kotlin.math.abs(Color.green(pixel) - Color.green(blue)) < 5 &&
                        kotlin.math.abs(Color.blue(pixel) - Color.blue(blue)) < 5) {
                        "HTML right/bottom page border missing: $file at $x,$y = $pixel"
                    }
                }
            }
            details.put("sampledColors", colors.size)
        }
        finally {
            bitmap.recycle()
        }
        awaitNoRuntimeWorkers()
        return details
    }

    private fun checkCleanup(): JSONObject {
        val reached = CountDownLatch(1)
        val release = CountDownLatch(1)
        val completed = CountDownLatch(1)
        val failure = AtomicReference<Throwable?>()
        val file = File(targetContext.cacheDir, "cutover-cleanup.pdf")
        val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        server.soTimeout = 20_000
        val worker = thread(name = "cutover-cleanup-fixture") {
            try {
                server.accept().use { socket ->
                    socket.soTimeout = 20_000
                    val input = socket.getInputStream().bufferedReader()
                    check(input.readLine().startsWith("GET /cleanup "))
                    while (!input.readLine().isNullOrEmpty()) { }
                    reached.countDown()
                    check(release.await(3, TimeUnit.SECONDS))
                    socket.getOutputStream().write((
                        "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 4\r\nConnection: close\r\n\r\ndone"
                    ).toByteArray())
                }
            }
            catch (error: Throwable) {
                failure.set(error)
                reached.countDown()
            }
        }
        try {
            EasyInkRenderer.renderPdfAsync(
                targetContext,
                EasyInkRenderRequest(
                    requestId = "cutover-await-cleanup",
                    source = EasyInkRenderSource.Html("""
                        <p>Await cleanup</p>
                        <script>
                          window.__easyinkDestroy = function () {
                            return fetch('http://127.0.0.1:${server.localPort}/cleanup')
                              .then(function (response) { return response.text(); })
                              .then(function () { return { errors: [] }; });
                          };
                        </script>
                    """.trimIndent()),
                ),
                file,
                object : EasyInkRenderCallback<EasyInkRenderResult> {
                    override fun onSuccess(result: EasyInkRenderResult) { completed.countDown() }
                    override fun onError(error: EasyInkRenderException) {
                        failure.set(error)
                        completed.countDown()
                    }
                },
            )
            check(reached.await(20, TimeUnit.SECONDS)) { "JS cleanup was never called" }
            failure.get()?.let { throw it }
            check(!completed.await(250, TimeUnit.MILLISECONDS)) { "Render callback preceded async cleanup completion" }
            release.countDown()
            check(completed.await(10, TimeUnit.SECONDS)) { "Render callback did not follow cleanup completion" }
            failure.get()?.let { throw it }
            check(file.length() > 100)
            return JSONObject().put("cleanup", "callback awaits blocked JS Promise").put("heldMs", 250)
        }
        finally {
            release.countDown()
            server.close()
            worker.join(1000)
        }
    }

    private fun descendants(view: View): List<View> = listOf(view) + if (view is ViewGroup) {
        (0 until view.childCount).flatMap { descendants(view.getChildAt(it)) }
    } else emptyList()

    private fun outputFiles(): List<File> = targetContext.cacheDir.listFiles().orEmpty()
        .filter { it.name.startsWith("easyink-") }
        .flatMap { if (it.isDirectory) it.walkTopDown().filter(File::isFile).toList() else listOf(it) }

    private fun runtimeWorkers(): List<Thread> = Thread.getAllStackTraces().keys.filter {
        it.isAlive && (it.name.startsWith("easyink-runtime-server-") || it.name.startsWith("easyink-runtime-request-"))
    }

    private fun awaitNoRuntimeWorkers() {
        val deadline = SystemClock.elapsedRealtime() + 2000
        while (runtimeWorkers().isNotEmpty() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(20)
        check(runtimeWorkers().isEmpty()) { "Runtime server threads survived cleanup: ${runtimeWorkers().map { it.name }}" }
    }
}
