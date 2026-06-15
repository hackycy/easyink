package com.easyink.android.internal

import android.util.Base64
import com.easyink.android.EasyInkFontResource
import com.easyink.android.EasyInkRenderSource
import com.easyink.android.EasyInkResource
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

internal class RuntimeAssetServer(
    private val prepared: PreparedRequest,
    source: EasyInkRenderSource,
    private val diagnostics: DiagnosticsCollector,
) : AutoCloseable {
    private val running = AtomicBoolean(false)
    private val token = newToken()
    private val resources = resourceMap(source)
    private var serverSocket: ServerSocket? = null
    private var worker: Thread? = null

    val url: String
        get() = "http://127.0.0.1:${serverSocket?.localPort ?: 0}/$token/easyink-viewer/index.html"

    fun start() {
        val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        serverSocket = socket
        running.set(true)
        worker = thread(name = "easyink-runtime-server-${prepared.requestId}", isDaemon = true) {
            while (running.get()) {
                try {
                    handle(socket.accept())
                }
                catch (_: Exception) {
                    if (running.get()) {
                        diagnostics.failedRequest("Runtime server accept failed.")
                    }
                }
            }
        }
    }

    override fun close() {
        running.set(false)
        try {
            serverSocket?.close()
        }
        catch (_: Exception) {
        }
        worker = null
    }

    private fun handle(socket: Socket) {
        thread(name = "easyink-runtime-request-${prepared.requestId}", isDaemon = true) {
            socket.use { client ->
                val requestLine = client.getInputStream().bufferedReader(Charsets.ISO_8859_1).readLine()
                val path = requestLine?.split(" ")?.getOrNull(1) ?: "/"
                val response = resolve(path)
                client.getOutputStream().write(response)
                client.getOutputStream().flush()
            }
        }
    }

    private fun resolve(pathWithQuery: String): ByteArray {
        val path = URLDecoder.decode(pathWithQuery.substringBefore("?"), "UTF-8")
        val prefix = "/$token/"
        if (!path.startsWith(prefix)) {
            return http(status = "403 Forbidden", contentType = "text/plain", body = "Forbidden".toByteArray())
        }
        val route = path.removePrefix(prefix)
        if (route == "easyink-viewer/index.html") {
            return http(contentType = "text/html; charset=utf-8", body = prepared.html.toByteArray(Charsets.UTF_8))
        }
        val offline = resources[route] ?: resources[path] ?: resources[path.removePrefix("/")] ?: resources["/$route"]
        if (offline != null) {
            return http(contentType = offline.contentType, body = offline.bytes)
        }
        diagnostics.failedRequest("Resource not found: $route")
        return http(status = "404 Not Found", contentType = "text/plain", body = "Not found".toByteArray())
    }

    private fun http(
        status: String = "200 OK",
        contentType: String,
        body: ByteArray,
    ): ByteArray {
        val output = ByteArrayOutputStream()
        val headers = buildString {
            append("HTTP/1.1 ").append(status).append("\r\n")
            append("Content-Type: ").append(contentType).append("\r\n")
            append("Content-Length: ").append(body.size).append("\r\n")
            append("Cache-Control: no-store\r\n")
            append("Connection: close\r\n")
            append("\r\n")
        }.toByteArray(Charsets.ISO_8859_1)
        output.write(headers)
        output.write(body)
        return output.toByteArray()
    }

    private fun resourceMap(source: EasyInkRenderSource): Map<String, OfflineResource> {
        val entries = mutableMapOf<String, OfflineResource>()
        val resources: List<EasyInkResource>
        val fonts: List<EasyInkFontResource>
        when (source) {
            is EasyInkRenderSource.Schema -> {
                resources = source.resources
                fonts = source.fonts
            }
            is EasyInkRenderSource.Html -> {
                resources = source.resources
                fonts = source.fonts
            }
        }
        resources.forEach { resource ->
            entries[resource.url.trimStart('/')] = OfflineResource(
                contentType = resource.contentType,
                bytes = Base64.decode(resource.base64, Base64.DEFAULT),
            )
        }
        fonts.forEach { font ->
            entries[font.url.trimStart('/')] = OfflineResource(
                contentType = font.contentType,
                bytes = Base64.decode(font.base64, Base64.DEFAULT),
            )
        }
        return entries
    }

    private data class OfflineResource(
        val contentType: String,
        val bytes: ByteArray,
    )

    private companion object {
        fun newToken(): String {
            val bytes = ByteArray(16)
            SecureRandom().nextBytes(bytes)
            return bytes.joinToString("") { "%02x".format(it) }
        }
    }
}
