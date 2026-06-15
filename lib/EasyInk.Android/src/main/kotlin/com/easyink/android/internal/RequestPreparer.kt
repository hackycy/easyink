package com.easyink.android.internal

import android.content.Context
import com.easyink.android.EasyInkRenderErrorCode
import com.easyink.android.EasyInkRenderException
import com.easyink.android.EasyInkRenderRequest
import com.easyink.android.EasyInkRenderSource
import com.easyink.android.EasyInkRenderedPage
import org.json.JSONObject

internal class RequestPreparer(private val context: Context) {
    fun prepare(request: EasyInkRenderRequest): PreparedRequest {
        if (request.requestId.isBlank()) {
            throw EasyInkRenderException(EasyInkRenderErrorCode.INVALID_REQUEST, "requestId is required.")
        }
        if (inputBytes(request) > request.security.maxInputBytes) {
            throw EasyInkRenderException(
                EasyInkRenderErrorCode.INVALID_REQUEST,
                "Render input exceeds maxInputBytes=${request.security.maxInputBytes}.",
            )
        }

        return when (val source = request.source) {
            is EasyInkRenderSource.Schema -> prepareSchema(request, source)
            is EasyInkRenderSource.Html -> prepareHtml(request, source)
        }
    }

    private fun prepareSchema(
        request: EasyInkRenderRequest,
        source: EasyInkRenderSource.Schema,
    ): PreparedRequest {
        val schema = parseJsonObject(source.schemaJson, "schemaJson")
        parseJsonObject(source.dataJson.ifBlank { "{}" }, "dataJson")

        val page = readPageDefinition(schema, request)
        val payload = JSONObject()
            .put("runtimeVersion", RUNTIME_VERSION)
            .put("schema", schema)
            .put("data", JSONObject(source.dataJson.ifBlank { "{}" }))
            .toString()

        val runtime = RuntimeDocumentBuilder(context).buildSchemaDocument(page, payload, source.fonts)
        return PreparedRequest(
            requestId = request.requestId,
            html = runtime,
            pages = listOf(EasyInkRenderedPage(index = 0, widthMm = page.widthMm, heightMm = page.heightMm)),
        )
    }

    private fun prepareHtml(
        request: EasyInkRenderRequest,
        source: EasyInkRenderSource.Html,
    ): PreparedRequest {
        if (source.html.isBlank()) {
            throw EasyInkRenderException(EasyInkRenderErrorCode.INVALID_REQUEST, "html source is required.")
        }
        val page = PageDefinition(
            widthMm = request.pdf.paperWidthMm ?: 210.0,
            heightMm = request.pdf.paperHeightMm ?: 297.0,
        )
        return PreparedRequest(
            requestId = request.requestId,
            html = RuntimeDocumentBuilder(context).buildHtmlDocument(page, source.html, source.fonts),
            pages = listOf(EasyInkRenderedPage(index = 0, widthMm = page.widthMm, heightMm = page.heightMm)),
        )
    }

    private fun readPageDefinition(schema: JSONObject, request: EasyInkRenderRequest): PageDefinition {
        val page = schema.optJSONObject("page")
        val width = request.pdf.paperWidthMm ?: page?.optDouble("width", 0.0) ?: 0.0
        val height = request.pdf.paperHeightMm ?: page?.optDouble("height", 0.0) ?: 0.0
        if (width <= 0.0 || height <= 0.0) {
            throw EasyInkRenderException(
                EasyInkRenderErrorCode.INVALID_REQUEST,
                "EasyInk schema page width and height are required.",
            )
        }
        val unit = page?.optString("unit", "mm") ?: schema.optString("unit", "mm")
        if (unit.isNotBlank() && unit != "mm") {
            throw EasyInkRenderException(
                EasyInkRenderErrorCode.INVALID_REQUEST,
                "Only mm page unit is supported by the first Android SDK implementation.",
            )
        }
        return PageDefinition(widthMm = width, heightMm = height)
    }

    private fun parseJsonObject(value: String, name: String): JSONObject {
        try {
            return JSONObject(value.ifBlank { "{}" })
        }
        catch (error: Exception) {
            throw EasyInkRenderException(EasyInkRenderErrorCode.INVALID_REQUEST, "Invalid $name.", error)
        }
    }

    private fun inputBytes(request: EasyInkRenderRequest): Int {
        return when (val source = request.source) {
            is EasyInkRenderSource.Schema -> {
                source.schemaJson.toByteArray().size +
                    source.dataJson.toByteArray().size +
                    source.resources.sumOf { it.base64.toByteArray().size } +
                    source.fonts.sumOf { it.base64.toByteArray().size }
            }
            is EasyInkRenderSource.Html -> {
                source.html.toByteArray().size +
                    source.resources.sumOf { it.base64.toByteArray().size } +
                    source.fonts.sumOf { it.base64.toByteArray().size }
            }
        }
    }
}
