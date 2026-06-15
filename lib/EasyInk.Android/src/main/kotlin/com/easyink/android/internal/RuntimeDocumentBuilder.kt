package com.easyink.android.internal

import android.content.Context
import com.easyink.android.EasyInkFontResource
import java.util.Locale

internal class RuntimeDocumentBuilder(private val context: Context) {
    fun buildSchemaDocument(
        page: PageDefinition,
        payloadJson: String,
        fonts: List<EasyInkFontResource>,
    ): String {
        val index = readAsset("easyink-viewer/index.html")
        val css = readAsset("easyink-viewer/assets/viewer.css")
        val js = readAsset("easyink-viewer/assets/viewer.js")
        return index
            .replace(VIEWER_CSS_TAG, wrapStyleTag("viewer-css", css + "\n" + renderFontFaceCss(fonts)))
            .replace(PAGE_CSS_TAG, wrapStyleTag("page-css", renderPageCss(page)))
            .replace(PAYLOAD_TAG, wrapPayloadTag(safeScriptJson(payloadJson)))
            .replace(VIEWER_JS_TAG, wrapScriptTag("viewer-js", js))
    }

    fun buildHtmlDocument(
        page: PageDefinition,
        html: String,
        fonts: List<EasyInkFontResource>,
    ): String {
        return """
            <!doctype html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>EasyInk HTML Render</title>
              <style>${renderPageCss(page)}</style>
              <style>${renderFontFaceCss(fonts)}</style>
              <style>html, body { margin: 0; padding: 0; } * { box-sizing: border-box; }</style>
            </head>
            <body>
              <main class="ei-viewer-page" data-page-index="0" style="position:relative;width:${page.widthMm.cssNumber()}mm;height:${page.heightMm.cssNumber()}mm;overflow:hidden;background:white;">
                $html
              </main>
              <script>
                window.easyinkReady = true;
                window.easyinkRenderedPages = [{ index: 0, width: ${page.widthMm}, height: ${page.heightMm}, unit: 'mm' }];
                window.__easyinkGetPages = function () { return window.easyinkRenderedPages; };
                document.documentElement.classList.add('easyink-ready');
                document.dispatchEvent(new CustomEvent('easyink:ready'));
              </script>
            </body>
            </html>
        """.trimIndent()
    }

    private fun readAsset(path: String): String {
        return context.assets.open(path).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    private fun renderPageCss(page: PageDefinition): String {
        val width = page.widthMm.cssNumber()
        val height = page.heightMm.cssNumber()
        return "@page { size: ${width}mm ${height}mm; margin: 0; }\nhtml, body { width: ${width}mm; min-height: ${height}mm; }"
    }

    private fun renderFontFaceCss(fonts: List<EasyInkFontResource>): String {
        return fonts.joinToString("\n") { font ->
            val weight = font.weight?.let { "font-weight: ${it.cssString()};" } ?: ""
            val style = font.style?.let { "font-style: ${it.cssString()};" } ?: ""
            """
                @font-face {
                  font-family: ${font.family.cssString()};
                  src: url('${font.url.cssUrl()}') format('${font.contentType.fontFormat()}');
                  $weight
                  $style
                }
            """.trimIndent()
        }
    }

    private fun wrapStyleTag(name: String, content: String): String {
        return """<style data-easyink-runtime="$name">$content</style>"""
    }

    private fun wrapPayloadTag(content: String): String {
        return """<script id="easyink-payload" type="application/json">$content</script>"""
    }

    private fun wrapScriptTag(name: String, content: String): String {
        return """<script data-easyink-runtime="$name">$content</script>"""
    }

    private fun safeScriptJson(value: String): String {
        return value
            .replace("&", "\\u0026")
            .replace("<", "\\u003c")
            .replace(">", "\\u003e")
            .replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029")
    }

    private fun Double.cssNumber(): String {
        return String.format(Locale.US, "%.3f", this).trimEnd('0').trimEnd('.')
    }

    private fun String.cssString(): String {
        return "'" + replace("\\", "\\\\").replace("'", "\\'") + "'"
    }

    private fun String.cssUrl(): String {
        return replace("\\", "\\\\").replace("'", "\\'")
    }

    private fun String.fontFormat(): String {
        return when {
            contains("woff2", ignoreCase = true) -> "woff2"
            contains("woff", ignoreCase = true) -> "woff"
            contains("opentype", ignoreCase = true) || contains("otf", ignoreCase = true) -> "opentype"
            contains("truetype", ignoreCase = true) || contains("ttf", ignoreCase = true) -> "truetype"
            else -> "truetype"
        }
    }

    private companion object {
        const val VIEWER_CSS_TAG = """<style data-easyink-runtime="viewer-css"></style>"""
        const val PAGE_CSS_TAG = """<style data-easyink-runtime="page-css"></style>"""
        const val PAYLOAD_TAG = """<script id="easyink-payload" type="application/json">{}</script>"""
        const val VIEWER_JS_TAG = """<script data-easyink-runtime="viewer-js"></script>"""
    }
}
