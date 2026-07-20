package com.easyink.flutter

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.webkit.WebView
import com.easyink.android.EasyInkImageFormat
import com.easyink.android.EasyInkImageOptions
import com.easyink.android.EasyInkImageRenderResult
import com.easyink.android.EasyInkPdfOptions
import com.easyink.android.EasyInkRenderCallback
import com.easyink.android.EasyInkRenderException
import com.easyink.android.EasyInkRenderRequest
import com.easyink.android.EasyInkRenderSource
import com.easyink.android.EasyInkRenderTask
import com.easyink.android.EasyInkRenderer
import com.easyink.android.EasyInkWaitOptions
import com.easyink.android.EasyInkWaitUntil
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.PluginRegistry
import java.io.File
import java.util.Collections
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

class EasyInkAndroidPlugin :
    FlutterPlugin,
    MethodChannel.MethodCallHandler,
    ActivityAware,
    PluginRegistry.RequestPermissionsResultListener {

    private lateinit var applicationContext: Context
    private lateinit var channel: MethodChannel
    private var activityBinding: ActivityPluginBinding? = null
    private var pendingPermission: PendingRender? = null
    private var publishExecutor: ExecutorService? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val activeTasks = Collections.synchronizedSet(mutableSetOf<EasyInkRenderTask>())

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        applicationContext = binding.applicationContext
        publishExecutor = Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "easyink-flutter-publisher")
        }
        channel = MethodChannel(binding.binaryMessenger, CHANNEL_NAME)
        channel.setMethodCallHandler(this)
        if (applicationContext.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        Log.i(TAG, "attached WebView=${currentWebViewVersion() ?: "unknown"}")
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
        cancelActiveTasks()
        pendingPermission = null
        publishExecutor?.shutdownNow()
        publishExecutor = null
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activityBinding = binding
        binding.addRequestPermissionsResultListener(this)
    }

    override fun onDetachedFromActivityForConfigChanges() {
        detachFromActivity(clearPending = false)
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        onAttachedToActivity(binding)
    }

    override fun onDetachedFromActivity() {
        detachFromActivity(clearPending = true)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != METHOD_RENDER_IMAGES) {
            result.notImplemented()
            return
        }

        val parsed = parseArguments(call.arguments, result) ?: return
        if (needsLegacyStoragePermission()) {
            requestStoragePermission(parsed, result)
            return
        }
        renderImages(parsed, result)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ): Boolean {
        if (requestCode != STORAGE_PERMISSION_REQUEST) {
            return false
        }

        val pending = pendingPermission ?: return true
        pendingPermission = null
        if (grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) {
            pending.result.error(
                "STORAGE_PERMISSION_DENIED",
                "Storage permission is required to publish files to Downloads.",
                null,
            )
            return true
        }
        renderImages(pending.arguments, pending.result)
        return true
    }

    private fun parseArguments(value: Any?, result: MethodChannel.Result): RenderArguments? {
        val arguments = value as? Map<*, *>
        if (arguments == null) {
            result.error("INVALID_ARGUMENTS", "Arguments must be a map.", null)
            return null
        }

        val sourceType = arguments["sourceType"] as? String
        val scale = (arguments["scale"] as? Number)?.toFloat() ?: 1f
        val timeoutMs = (arguments["timeoutMs"] as? Number)?.toLong() ?: DEFAULT_TIMEOUT_MS
        if (scale <= 0f || !scale.isFinite()) {
            result.error("INVALID_ARGUMENTS", "scale must be greater than zero.", null)
            return null
        }
        if (timeoutMs <= 0L) {
            result.error("INVALID_ARGUMENTS", "timeoutMs must be greater than zero.", null)
            return null
        }

        val source = when (sourceType) {
            "html" -> {
                val html = arguments["html"] as? String
                val width = (arguments["paperWidthMm"] as? Number)?.toDouble() ?: 80.0
                val height = (arguments["paperHeightMm"] as? Number)?.toDouble() ?: 120.0
                if (html.isNullOrBlank() || width <= 0.0 || height <= 0.0) {
                    result.error("INVALID_ARGUMENTS", "Valid HTML and paper dimensions are required.", null)
                    return null
                }
                RenderSource.Html(html, width, height)
            }
            "schema" -> {
                val schemaJson = arguments["schemaJson"] as? String
                val dataJson = arguments["dataJson"] as? String
                if (schemaJson.isNullOrBlank() || dataJson.isNullOrBlank()) {
                    result.error("INVALID_ARGUMENTS", "Schema and data are required.", null)
                    return null
                }
                RenderSource.Schema(schemaJson, dataJson)
            }
            else -> {
                result.error("INVALID_ARGUMENTS", "sourceType must be html or schema.", null)
                return null
            }
        }

        Log.i(
            TAG,
            "render sourceType=$sourceType payloadLength=${source.payloadLength} " +
                "scale=$scale timeoutMs=$timeoutMs",
        )
        return RenderArguments(source, scale, timeoutMs)
    }

    private fun requestStoragePermission(
        arguments: RenderArguments,
        result: MethodChannel.Result,
    ) {
        if (pendingPermission != null) {
            result.error("PERMISSION_REQUEST_ACTIVE", "Another storage permission request is active.", null)
            return
        }
        val activity = activityBinding?.activity
        if (activity == null) {
            result.error("ACTIVITY_UNAVAILABLE", "An Activity is required for storage permission.", null)
            return
        }

        pendingPermission = PendingRender(arguments, result)
        activity.requestPermissions(
            arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE),
            STORAGE_PERMISSION_REQUEST,
        )
    }

    private fun renderImages(arguments: RenderArguments, result: MethodChannel.Result) {
        val requestId = "flutter-${System.currentTimeMillis()}"
        val outputDir = File(applicationContext.cacheDir, "easyink-images-$requestId")
        if (!outputDir.mkdirs() && !outputDir.isDirectory) {
            result.error("OUTPUT_FAILED", "Unable to create ${outputDir.absolutePath}.", null)
            return
        }

        val request = when (val source = arguments.source) {
            is RenderSource.Html -> EasyInkRenderRequest(
                requestId = requestId,
                source = EasyInkRenderSource.Html(source.html),
                pdf = EasyInkPdfOptions(
                    paperWidthMm = source.paperWidthMm,
                    paperHeightMm = source.paperHeightMm,
                ),
                wait = EasyInkWaitOptions(
                    until = EasyInkWaitUntil.AUTO,
                    timeoutMs = arguments.timeoutMs,
                ),
            )
            is RenderSource.Schema -> EasyInkRenderRequest(
                requestId = requestId,
                source = EasyInkRenderSource.Schema(source.schemaJson, source.dataJson),
                wait = EasyInkWaitOptions(
                    until = EasyInkWaitUntil.AUTO,
                    timeoutMs = arguments.timeoutMs,
                ),
            )
        }

        val taskReference = AtomicReference<EasyInkRenderTask?>()
        try {
            val task = EasyInkRenderer.renderImagesAsync(
                context = applicationContext,
                request = request,
                outputDir = outputDir,
                options = EasyInkImageOptions(
                    format = EasyInkImageFormat.PNG,
                    scale = arguments.scale,
                ),
                callback = object : EasyInkRenderCallback<EasyInkImageRenderResult> {
                    override fun onSuccess(data: EasyInkImageRenderResult) {
                        taskReference.get()?.let(activeTasks::remove)
                        publishResults(data, outputDir, result)
                    }

                    override fun onError(error: EasyInkRenderException) {
                        taskReference.get()?.let(activeTasks::remove)
                        outputDir.deleteRecursively()
                        Log.e(TAG, "render failed code=${error.code} message=${error.message}", error)
                        result.error(error.code.name, error.message, null)
                    }
                },
            )
            taskReference.set(task)
            activeTasks += task
        }
        catch (error: Throwable) {
            outputDir.deleteRecursively()
            Log.e(TAG, "render invocation failed", error)
            result.error("RUNTIME_ERROR", error.message, null)
        }
    }

    private fun publishResults(
        data: EasyInkImageRenderResult,
        cacheOutputDir: File,
        result: MethodChannel.Result,
    ) {
        val executor = publishExecutor
        if (executor == null || executor.isShutdown) {
            result.error("PLUGIN_DETACHED", "Plugin detached before publishing completed.", null)
            return
        }
        try {
            executor.execute {
                try {
                    val published = data.files.map(::publishToDownloads)
                    cacheOutputDir.deleteRecursively()
                    completeOnMain { result.success(published) }
                }
                catch (error: Throwable) {
                    Log.e(TAG, "publish failed", error)
                    completeOnMain { result.error("PUBLISH_FAILED", error.message, null) }
                }
            }
        }
        catch (error: Throwable) {
            Log.e(TAG, "unable to schedule publishing", error)
            result.error("PLUGIN_DETACHED", "Plugin detached before publishing started.", null)
        }
    }

    private fun publishToDownloads(source: File): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            publishWithMediaStore(source)
        }
        else {
            publishToLegacyDownloads(source)
        }
    }

    private fun publishWithMediaStore(source: File): String {
        val relativePath = "${Environment.DIRECTORY_DOWNLOADS}/$DOWNLOAD_FOLDER"
        val resolver = applicationContext.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, source.name)
            put(MediaStore.Downloads.MIME_TYPE, "image/png")
            put(MediaStore.Downloads.RELATIVE_PATH, relativePath)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: error("Unable to create Downloads entry for ${source.name}.")
        try {
            resolver.openOutputStream(uri)?.use { output ->
                source.inputStream().use { input -> input.copyTo(output) }
            } ?: error("Unable to open Downloads output for ${source.name}.")
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return "$relativePath/${source.name}"
        }
        catch (error: Throwable) {
            resolver.delete(uri, null, null)
            throw error
        }
    }

    @Suppress("DEPRECATION")
    private fun publishToLegacyDownloads(source: File): String {
        val directory = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            DOWNLOAD_FOLDER,
        )
        if (!directory.mkdirs() && !directory.isDirectory) {
            error("Unable to create ${directory.absolutePath}.")
        }
        val target = File(directory, source.name)
        source.copyTo(target, overwrite = true)
        MediaScannerConnection.scanFile(
            applicationContext,
            arrayOf(target.absolutePath),
            arrayOf("image/png"),
            null,
        )
        return target.absolutePath
    }

    private fun needsLegacyStoragePermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            applicationContext.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
            PackageManager.PERMISSION_GRANTED
    }

    private fun detachFromActivity(clearPending: Boolean) {
        activityBinding?.removeRequestPermissionsResultListener(this)
        activityBinding = null
        if (clearPending) {
            pendingPermission?.result?.error("ACTIVITY_DETACHED", "Activity detached.", null)
            pendingPermission = null
        }
    }

    private fun cancelActiveTasks() {
        synchronized(activeTasks) {
            activeTasks.forEach(EasyInkRenderTask::cancel)
            activeTasks.clear()
        }
    }

    private fun completeOnMain(block: () -> Unit) {
        mainHandler.post(block)
    }

    private fun currentWebViewVersion(): String? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WebView.getCurrentWebViewPackage()?.versionName
        }
        else {
            null
        }
    }

    private sealed interface RenderSource {
        val payloadLength: Int

        data class Html(
            val html: String,
            val paperWidthMm: Double,
            val paperHeightMm: Double,
        ) : RenderSource {
            override val payloadLength: Int = html.length
        }

        data class Schema(
            val schemaJson: String,
            val dataJson: String,
        ) : RenderSource {
            override val payloadLength: Int = schemaJson.length + dataJson.length
        }
    }

    private data class RenderArguments(
        val source: RenderSource,
        val scale: Float,
        val timeoutMs: Long,
    )

    private data class PendingRender(
        val arguments: RenderArguments,
        val result: MethodChannel.Result,
    )

    private companion object {
        const val CHANNEL_NAME = "com.easyink.android/renderer"
        const val DEFAULT_TIMEOUT_MS = 120_000L
        const val DOWNLOAD_FOLDER = "EasyInk"
        const val METHOD_RENDER_IMAGES = "renderImages"
        const val STORAGE_PERMISSION_REQUEST = 1001
        const val TAG = "EasyInkAndroidPlugin"
    }
}
