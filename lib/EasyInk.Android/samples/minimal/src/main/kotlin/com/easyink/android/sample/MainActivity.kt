package com.easyink.android.sample

import android.app.Activity
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.easyink.android.EasyInkImageFormat
import com.easyink.android.EasyInkImageOptions
import com.easyink.android.EasyInkPdfOptions
import com.easyink.android.EasyInkRenderRequest
import com.easyink.android.EasyInkRenderSource
import com.easyink.android.EasyInkRenderer
import com.easyink.android.EasyInkWaitOptions
import com.easyink.android.EasyInkWaitUntil
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import kotlin.coroutines.Continuation
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

class MainActivity : Activity() {
    private lateinit var output: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        output = TextView(this).apply {
            textSize = 14f
            setTextIsSelectable(true)
            text = "Ready. Tap a button to render with EasyInk Android SDK."
        }

        val renderHtmlPdf = Button(this).apply {
            text = "Render HTML PDF"
            setOnClickListener { renderHtmlPdf() }
        }
        val renderHtmlImages = Button(this).apply {
            text = "Render HTML Images"
            setOnClickListener { renderHtmlImages() }
        }
        val renderSchemaPdf = Button(this).apply {
            text = "Render Schema PDF"
            setOnClickListener { renderSchemaPdf() }
        }
        val renderSchemaImages = Button(this).apply {
            text = "Render Schema Images"
            setOnClickListener { renderSchemaImages() }
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            addView(renderHtmlPdf)
            addView(renderHtmlImages)
            addView(renderSchemaPdf)
            addView(renderSchemaImages)
            addView(output)
        }
        setContentView(ScrollView(this).apply { addView(content) })
    }

    private fun renderHtmlPdf() {
        renderPdf(
            label = "HTML PDF",
            filePrefix = "easyink-html",
            request = htmlRequest("sample-html-pdf"),
        )
    }

    private fun renderHtmlImages() {
        renderImages(
            label = "HTML images",
            filePrefix = "easyink-html-images",
            request = htmlRequest("sample-html-images"),
        )
    }

    private fun renderSchemaPdf() {
        renderPdf(
            label = "Schema PDF",
            filePrefix = "easyink-supermarket-receipt",
            request = supermarketReceiptRequest("sample-supermarket-receipt-pdf"),
        )
    }

    private fun renderSchemaImages() {
        renderImages(
            label = "Schema images",
            filePrefix = "easyink-supermarket-receipt-images",
            request = supermarketReceiptRequest("sample-supermarket-receipt-images"),
        )
    }

    private fun renderPdf(
        label: String,
        filePrefix: String,
        request: EasyInkRenderRequest,
    ) {
        output.text = "Rendering PDF..."
        runSuspend {
            val timestamp = System.currentTimeMillis()
            val file = File(cacheDir, "$filePrefix-$timestamp.pdf")
            val result = EasyInkRenderer.renderPdf(
                context = this,
                request = request,
                output = file,
            )
            val published = publishToDownloads(
                source = result.output,
                displayName = "$filePrefix-$timestamp.pdf",
                mimeType = "application/pdf",
                relativePath = DOWNLOAD_DIR,
            )
            showOutput(buildString {
                appendLine("$label rendered")
                appendLine("Downloads: ${published.displayPath}")
                appendLine("Bytes: ${result.output.length()}")
                appendLine("Pages: ${result.pageCount}")
                appendLine("Runtime: ${result.diagnostics.runtimeVersion}")
                appendLine("WebView: ${result.diagnostics.webViewVersion ?: "unknown"}")
                appendLine("Warnings: ${result.diagnostics.warnings.size}")
                appendLine("Console errors: ${result.diagnostics.consoleErrors.size}")
            })
        }
    }

    private fun renderImages(
        label: String,
        filePrefix: String,
        request: EasyInkRenderRequest,
    ) {
        output.text = "Rendering images..."
        runSuspend {
            val timestamp = System.currentTimeMillis()
            val dir = File(cacheDir, "$filePrefix-$timestamp")
            val result = EasyInkRenderer.renderImages(
                context = this,
                request = request,
                outputDir = dir,
                options = EasyInkImageOptions(
                    format = EasyInkImageFormat.PNG,
                    scale = 2f,
                ),
            )
            val published = result.files.map { file ->
                publishToDownloads(
                    source = file,
                    displayName = file.nameWithoutExtension + "-$timestamp." + file.extension,
                    mimeType = "image/png",
                    relativePath = "$DOWNLOAD_DIR/images",
                )
            }
            showOutput(buildString {
                appendLine("$label rendered")
                appendLine("Downloads directory: $DOWNLOAD_DIR/images")
                appendLine("Files:")
                published.forEach { item ->
                    appendLine("- ${item.displayPath} (${item.bytes} bytes)")
                }
                appendLine("Pages: ${result.pages.size}")
                appendLine("Runtime: ${result.diagnostics.runtimeVersion}")
                appendLine("WebView: ${result.diagnostics.webViewVersion ?: "unknown"}")
                appendLine("Warnings: ${result.diagnostics.warnings.size}")
                appendLine("Console errors: ${result.diagnostics.consoleErrors.size}")
            })
        }
    }

    private fun publishToDownloads(
        source: File,
        displayName: String,
        mimeType: String,
        relativePath: String,
    ): PublishedFile {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            publishWithMediaStore(source, displayName, mimeType, relativePath)
        }
        else {
            publishWithPublicDirectory(source, displayName, relativePath)
        }
    }

    private fun publishWithMediaStore(
        source: File,
        displayName: String,
        mimeType: String,
        relativePath: String,
    ): PublishedFile {
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, displayName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.RELATIVE_PATH, relativePath)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: error("Unable to create MediaStore download entry.")
        try {
            resolver.openOutputStream(uri)?.use { output ->
                FileInputStream(source).use { input -> input.copyTo(output) }
            } ?: error("Unable to open MediaStore output stream.")
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return PublishedFile(
                uri = uri,
                displayPath = "$relativePath/$displayName",
                bytes = source.length(),
            )
        }
        catch (error: Throwable) {
            resolver.delete(uri, null, null)
            throw error
        }
    }

    private fun publishWithPublicDirectory(
        source: File,
        displayName: String,
        relativePath: String,
    ): PublishedFile {
        val downloadsRoot = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val subPath = relativePath.removePrefix(Environment.DIRECTORY_DOWNLOADS).trim('/')
        val directory = if (subPath.isBlank()) downloadsRoot else File(downloadsRoot, subPath)
        directory.mkdirs()
        val target = File(directory, displayName)
        FileInputStream(source).use { input ->
            FileOutputStream(target).use { output -> input.copyTo(output) }
        }
        return PublishedFile(
            uri = Uri.fromFile(target),
            displayPath = target.absolutePath,
            bytes = target.length(),
        )
    }

    private fun htmlRequest(requestId: String): EasyInkRenderRequest {
        return EasyInkRenderRequest(
            requestId = requestId,
            source = EasyInkRenderSource.Html(
                html = """
                    <section style="width:100%;height:100%;box-sizing:border-box;padding:6mm;font-family:sans-serif;background:#E0F2FE;color:#111827;border:2mm solid #2563EB;">
                      <h1 style="font-size:20px;margin:0 0 8px;color:#1D4ED8;">EasyInk Android</h1>
                      <p class="easyink-ready" style="font-size:13px;line-height:1.5;margin:0;background:#FFFFFF;padding:4mm;border-radius:2mm;">
                        Rendered by the EasyInk Android SDK sample app.
                      </p>
                      <div style="margin-top:12px;border-top:1px solid #2563EB;padding-top:8px;font-size:12px;">
                        Output: PDF or per-page PNG
                      </div>
                      <div style="position:absolute;right:6mm;bottom:6mm;font-size:10px;font-weight:700;color:#1D4ED8;">
                        BOTTOM RIGHT
                      </div>
                    </section>
                """.trimIndent(),
            ),
            pdf = EasyInkPdfOptions(
                paperWidthMm = 80.0,
                paperHeightMm = 120.0,
            ),
            wait = EasyInkWaitOptions(
                until = EasyInkWaitUntil.SELECTOR,
                selector = ".easyink-ready",
            ),
        )
    }

    private fun supermarketReceiptRequest(requestId: String): EasyInkRenderRequest {
        return EasyInkRenderRequest(
            requestId = requestId,
            source = EasyInkRenderSource.Schema(
                schemaJson = readSampleAsset("easyink-samples/supermarket-receipt.schema.json"),
                dataJson = readSampleAsset("easyink-samples/supermarket-receipt.data.json"),
            ),
        )
    }

    private fun readSampleAsset(path: String): String {
        return assets.open(path).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    private fun runSuspend(block: suspend () -> Unit) {
        block.startCoroutine(object : Continuation<Unit> {
            override val context: CoroutineContext = EmptyCoroutineContext

            override fun resumeWith(result: Result<Unit>) {
                result.exceptionOrNull()?.let { error ->
                    showOutput("Render failed:\n${error.stackTraceToString()}")
                }
            }
        })
    }

    private fun showOutput(message: String) {
        runOnUiThread {
            output.text = message
        }
    }

    private data class PublishedFile(
        val uri: Uri,
        val displayPath: String,
        val bytes: Long,
    )

    private companion object {
        const val DOWNLOAD_DIR = "Download/EasyInk"
    }
}
