# EasyInk Android SDK 技术架构

本文档定义 EasyInk Android 渲染 SDK 的架构方案。它只负责把 `html` 或 `easyink schema + data` 渲染为 PDF 或图片，不包含打印机枚举、物理打印、系统打印 UI、蓝牙/USB 打印机协议或厂商打印 SDK 对接。

落地步骤、阶段拆分和验收检查记录在 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。构建命令、产物路径和最小调用示例记录在 [README.md](README.md)。

Android 方案参考 `EasyInk.Render` 的浏览器内核渲染管线思想：准备 HTML、加载运行时、等待渲染完成、采集诊断、输出文件。但 Android 端不引入 Go host、daemon、IPC、Chromium CDP 或外置浏览器管理。

## 1. 当前结论

- Android SDK 是一个原生 Kotlin/AAR 包，宿主通过一句 API 调用渲染能力，不需要展示 EasyInk 原生界面。
- SDK 内部使用隐藏 `WebView` 承载现有 `internal-packages/viewer-runtime` 生成的 HTML runtime，复用现有 DOM/SVG Viewer 渲染语义。
- `source.type='easyink'` 与 `source.type='html'` 共享同一条离屏 WebView 管线。
- 第一版 PDF 输出使用 `PdfDocument` 绘制已渲染 WebView 到目标文件，不经由系统打印交互。
- 图片输出使用已渲染 WebView 的页面区域截图，按页输出 PNG/JPEG。
- SDK 不负责物理打印端；业务若要打印，应在拿到 PDF/图片后自行接系统打印、厂商 SDK 或设备协议。
- SDK 不以 CDP 为契约。Android WebView 没有稳定公开的 `PrintToPDF` CDP 等价接口，架构只复用浏览器内核渲染阶段划分。

## 2. 架构总览

```text
Application
  |
  v
EasyInk Android SDK
  |
  +--> Protocol facade
  |      - RenderRequest
  |      - HtmlSource / EasyInkSource
  |      - PdfOptions / ImageOptions / WaitOptions
  |
  +--> Runtime asset loader
  |      - reuse internal-packages/viewer-runtime output
  |      - easyink-viewer/index.html
  |      - assets/viewer.css
  |      - assets/viewer.js
  |
  +--> Hidden WebView render host
  |      - load existing viewer-runtime html
  |      - inject payload
  |      - wait easyinkReady / selector / load
  |      - intercept resources and fonts
  |      - collect console and JS diagnostics
  |
  +--> Output adapters
         - PDF file
         - page images
```

对应关系：

```text
EasyInk.Render desktop host        Android SDK
------------------------------------------------------------
chromedp.Navigate(dataURL)      -> WebView.loadUrl(localhost runtime URL)
CDP Fetch interception          -> localhost server route/resource resolver
WaitReady(selector)             -> evaluateJavascript() / JS bridge
console/runtime diagnostics     -> WebChromeClient + JS bridge
page.PrintToPDF                 -> PdfDocument + WebView.draw(canvas)
browser manager                 -> WebView pool + coroutine queue
daemon queue                    -> in-process render queue
```

## 3. API 边界

第一版 API 只暴露渲染输出：

```kotlin
object EasyInkRenderer {
    suspend fun renderPdf(
        context: Context,
        request: EasyInkRenderRequest,
        output: File,
    ): EasyInkRenderResult

    suspend fun renderImages(
        context: Context,
        request: EasyInkRenderRequest,
        outputDir: File,
        options: EasyInkImageOptions = EasyInkImageOptions(),
    ): EasyInkImageRenderResult
}
```

推荐请求模型：

```kotlin
data class EasyInkRenderRequest(
    val requestId: String,
    val source: EasyInkRenderSource,
    val pdf: EasyInkPdfOptions = EasyInkPdfOptions(),
    val wait: EasyInkWaitOptions = EasyInkWaitOptions(),
    val security: EasyInkSecurityOptions = EasyInkSecurityOptions(),
    val diagnostics: EasyInkDiagnosticsOptions = EasyInkDiagnosticsOptions(),
)

sealed interface EasyInkRenderSource {
    data class Html(
        val html: String,
        val baseUrl: String? = null,
        val resources: List<EasyInkResource> = emptyList(),
        val fonts: List<EasyInkFontResource> = emptyList(),
    ) : EasyInkRenderSource

    data class Schema(
        val schemaJson: String,
        val dataJson: String = "{}",
        val resources: List<EasyInkResource> = emptyList(),
        val fonts: List<EasyInkFontResource> = emptyList(),
    ) : EasyInkRenderSource
}
```

调用方只感知文件输出：

```kotlin
val result = EasyInkRenderer.renderPdf(
    context = context,
    request = EasyInkRenderRequest(
        requestId = "receipt-001",
        source = EasyInkRenderSource.Schema(schemaJson, dataJson),
    ),
    output = File(context.cacheDir, "receipt-001.pdf"),
)
```

不提供以下 API：

- `print()`
- `listPrinters()`
- `selectPrinter()`
- `connectBluetoothPrinter()`
- `sendEscPos()`
- `openPrintDialog()`

这些都属于打印端集成，不进入 Android 渲染 SDK。

## 4. 渲染流程

```text
renderPdf/renderImages()
  |
  v
Normalize request
  |
  +--> html source: wrap html + baseUrl + resources
  |
  +--> easyink source: create runtime payload
        |
        v
Load existing viewer-runtime HTML in hidden WebView
  |
  v
Inject payload and resource registry
  |
  v
Wait plan
  |
  +--> load
  +--> selector
  +--> easyinkReady
  +--> networkIdle
  |
  v
Read rendered page metrics
  |
  +--> PDF adapter
  |
  +--> Image adapter
  |
  v
Return result + diagnostics
```

`easyink` 输入必须复用现有 `viewer-runtime` HTML，不允许在 Android SDK 内重新实现一套 EasyInk DOM 渲染器：

- SDK 按现有 HTML 占位契约组装本次请求文档，把 payload 写入 `#easyink-payload`。
- SDK 可以选择把 runtime CSS/JS 以内联或 AAR asset URL 方式提供给 WebView，但来源必须是同一份 `viewer-runtime` 构建产物。
- Viewer 渲染成功后设置 `window.easyinkReady = true`。
- 根节点增加 `.easyink-ready`。
- 输出页尺寸来自 Viewer 的 `renderedPages`，连续纸使用渲染后的实际高度。
- PDF 和图片输出都以 `renderedPages` 作为页面尺寸真值，不从 DOM inline style 反推纸张尺寸。

## 5. WebView Render Host

SDK 内部维护一个进程内 render host：

```text
RenderQueue
  |
  v
WebViewSession
  |
  +--> WebView
  +--> WebViewClient
  +--> WebChromeClient
  +--> JavaScript bridge
  +--> timeout/cancellation owner
```

约束：

- WebView 创建、加载、JS 执行和截图必须在主线程调度。
- 对外 API 使用 `suspend` 封装主线程细节。
- 默认串行渲染，后续可通过 `maxConcurrency` 扩展，但不把并发作为第一版目标。
- 每次任务使用独立 session，任务完成后清理页面、bridge、临时资源和回调。
- WebView 不加入业务布局树；若 Android 版本或设备 WebView 对完全脱离窗口的截图/PDF 支持不稳定，SDK 可以使用内部不可见容器承载，但容器不暴露给业务 UI。

隐藏承载策略：

```text
Application Window
  |
  +--> EasyInk internal render container
       - size: based on page width/height
       - visibility: invisible or offscreen
       - owner: SDK
```

这个内部容器是技术实现细节，不构成 SDK 的原生界面。

### 5.1 本地 HTML 加载策略

Android SDK 加载的是现有 `viewer-runtime` HTML。加载策略固定为 SDK 内部 localhost server：

```text
http://127.0.0.1:{ephemeralPort}/easyink-viewer/index.html
  |
  +--> embedded loopback-only server serves runtime/assets/resources
```

这个方案用于对齐 Capacitor-like 容器模型：WebView 看到的是稳定的 `http://127.0.0.1:{port}` origin，而不是 `file://` 或自定义 scheme。SDK 不提供 WebViewAssetLoader 作为并行实现，避免加载策略、资源解析和诊断路径分叉。

localhost server 约束：

- 只绑定 `127.0.0.1`，不绑定 `0.0.0.0`。
- 使用随机端口，任务结束后关闭 server。
- 每次 render session 生成随机 token，所有 runtime、asset、resource 请求都必须带 token path 或 header。
- 不复用业务 Cookie、WebStorage 或外部导航白名单。
- Android target API 28+ 若使用 `http://127.0.0.1`，需要限定 cleartext 到 loopback，不打开全局 `usesCleartextTraffic=true`。
- 远程资源仍必须走 `security.allowedOrigins`，不能因为 localhost origin 而放开任意网络访问。
- SDK 不允许业务把 localhost server 改成外部 URL，也不允许绑定局域网地址。

## 6. PDF 输出

第一版 PDF 输出使用 Android `PdfDocument` 写文件，页面内容来自已完成渲染的 WebView 画布：

```text
Rendered WebView
  |
  v
resolve renderedPages
  |
  v
create PdfDocument.PageInfo
  |
  v
WebView.draw(pdfPage.canvas)
  |
  v
PDF File
```

纸张尺寸规则：

- `pdf.preferCSSPageSize=true` 时，runtime 写入的 `@page size` 优先。
- `source.type='easyink'` 默认启用 `preferCSSPageSize`。
- 固定页使用 schema 或显式 `pdf.paperWidthMm/paperHeightMm`。
- 连续纸使用 Viewer 渲染后的首个页面实际高度。
- margin 默认 0，除非请求显式传入 `marginMm`。

已知边界：

- `PdfDocument` 输出以 WebView 画布绘制为准，后续若需要更贴近系统 WebView 打印框架，可单独评估 `PrintDocumentAdapter` Java shim 或平台差异方案。
- PDF 是文件输出能力，不触发系统打印 UI。
- SDK 不承诺控制物理打印机缩放、不可打印区域或驱动分页。

## 7. 图片输出

图片输出按 Viewer 页面逐页生成：

```text
Rendered pages
  |
  v
resolve .ei-viewer-page rects and scale
  |
  v
capture page bitmap
  |
  v
encode PNG/JPEG
```

推荐选项：

```kotlin
data class EasyInkImageOptions(
    val format: EasyInkImageFormat = EasyInkImageFormat.PNG,
    val scale: Float = 2f,
    val backgroundColor: Int = Color.WHITE,
)

enum class EasyInkImageFormat {
    PNG,
    JPEG,
}
```

约束：

- 图片输出以页为单位返回，不把多页拼接成一张长图作为默认行为。
- 连续纸本身只有一个连续页面时，可以输出一张长图。
- 图片尺寸由页面 DOM rect、`renderedPages` 和 `scale` 决定。
- 若页面过高导致 Bitmap 超过设备限制，SDK 必须返回诊断并失败，不能静默裁切。

## 8. 构建与 Runtime 产物

Android SDK 必须发布为 AAR。单纯 JAR 不适合作为 SDK 主产物，因为 JAR 只能承载 JVM bytecode 和普通 classpath 资源，不能表达 Android library 所需的 `AndroidManifest.xml`、`assets/`、`res/`、consumer ProGuard rules、AAR metadata 和 Android Gradle Plugin 资源合并语义。

本 SDK 需要内置现有 `internal-packages/viewer-runtime` 构建产物，因此 HTML/CSS/JS 必须进入 Android library 的 `src/main/assets`，最终打进 AAR：

```text
lib/EasyInk.Android/
  build.gradle.kts
  src/main/
    AndroidManifest.xml
    assets/easyink-viewer/
      index.html
      assets/viewer.css
      assets/viewer.js
    java|kotlin/...
```

Android 工程只负责把这份 HTML runtime 同步进 AAR assets，并在渲染时按已有占位契约填充 payload，不维护 Android 专属的 Viewer HTML、CSS 或 JS。

### 8.1 构建流程

```text
pnpm render:runtime
  |
  v
sync existing viewer-runtime output into Android assets
  |
  v
Gradle :lib:EasyInk.Android:assembleRelease
  |
  v
easyink-android-release.aar
```

推荐 Gradle 任务关系：

```text
syncViewerRuntime
  dependsOn root pnpm render:runtime
  copies generated viewer-runtime files
  into src/main/assets/easyink-viewer

preBuild
  dependsOn syncViewerRuntime

assembleDebug / assembleRelease
  package classes + manifest + assets into AAR
```

构建命令形态：

```bash
pnpm render:runtime
./gradlew :lib:EasyInk.Android:assembleRelease
```

如果后续把 Android 工程纳入仓库根级自动化，根级脚本应提供一个单一入口：

```bash
pnpm android:render-sdk:build
```

该脚本必须先生成 viewer runtime，再执行 Gradle AAR 构建。

### 8.2 发布产物

主发布产物：

```text
easyink-android-render-{version}.aar
```

配套产物：

```text
easyink-android-render-{version}.pom
easyink-android-render-{version}-sources.jar
easyink-android-render-{version}-javadoc.jar
```

这里的 `sources.jar` 和 `javadoc.jar` 只用于 Maven 发布辅助，不是运行时 SDK 主产物。宿主应用依赖 SDK 时必须依赖 AAR 或 Maven 坐标，不能只复制 JAR。

### 8.3 产物约束

- Android SDK 不维护另一套 EasyInk 渲染器，也不 fork `viewer-runtime`。
- Viewer runtime 与 Web 预览、桌面 Render 共用同一套 `@easyink/viewer` 渲染语义。
- `#easyink-payload`、`.easyink-ready`、`window.easyinkReady` 和 rendered page metrics 是 Android SDK 与 runtime 的稳定集成点。
- Runtime 版本需要写入 SDK metadata，渲染结果 diagnostics 中暴露 `runtimeVersion`。
- AAR 内置 runtime 是默认路径；业务不需要自行准备 HTML、JS、CSS。
- 构建产物必须可通过解压 AAR 验证 `assets/easyink-viewer/index.html`、`assets/easyink-viewer/assets/viewer.js` 和 `assets/easyink-viewer/assets/viewer.css` 存在。

## 9. 资源与字体

资源模型沿用 Render 协议：

```kotlin
data class EasyInkResource(
    val url: String,
    val contentType: String,
    val base64: String,
)

data class EasyInkFontResource(
    val family: String,
    val url: String,
    val contentType: String,
    val base64: String,
    val weight: String? = null,
    val style: String? = null,
)
```

WebView 资源加载规则：

- `resources` 和 `fonts` 注册到 SDK 内部离线资源表。
- SDK 内部 localhost server 优先命中离线资源。
- `fonts` 生成 `@font-face` 注入 runtime HTML。
- 未命中的远程资源必须经过 `security.allowedOrigins` 校验。
- 默认不允许 `file://` 访问。

字体一致性边界：

- Android 输出使用系统 WebView 字体栅格化，和桌面 Chromium 可能有细微差异。
- 需要强一致时，应随请求提供字体资源，避免依赖设备字体 fallback。
- 字体加载失败必须进入 diagnostics。

## 10. Diagnostics

结果对象至少包含：

```kotlin
data class EasyInkRenderResult(
    val requestId: String,
    val output: File,
    val pageCount: Int,
    val pages: List<EasyInkRenderedPage>,
    val diagnostics: EasyInkDiagnostics,
)

data class EasyInkRenderedPage(
    val index: Int,
    val widthMm: Double,
    val heightMm: Double,
)

data class EasyInkDiagnostics(
    val requestId: String,
    val runtimeVersion: String,
    val webViewVersion: String?,
    val durationMs: Long,
    val consoleErrors: List<String>,
    val failedRequests: List<String>,
    val warnings: List<String>,
)
```

诊断来源：

- schema 校验和 Viewer diagnostic
- JS console error
- runtime exception
- WebView resource load failure
- timeout
- PDF/image 输出失败
- Bitmap 尺寸超限
- 字体或图片资源加载失败

诊断原则：

- 渲染失败必须返回结构化错误码。
- 资源缺失、字体缺失、未支持 wait 条件不能静默吞掉。
- 成功结果也可以携带 warning diagnostics。

## 11. 安全边界

Android SDK 默认面向可信模板运行，但仍必须提供基本资源边界：

- 默认禁止 `file://`、`content://`、私网地址和非 SDK 内部 localhost 资源访问。
- `allowFileAccess` 只能由业务显式开启。
- `allowedOrigins` 控制远程 http/https 资源。
- `maxInputBytes` 限制 schema、html、data、resources 总输入大小。
- WebView 默认关闭不必要的持久化能力：按需禁用 DOM storage、密码保存、混合内容和调试。
- JS bridge 只暴露渲染状态、诊断和页面尺寸，不暴露文件系统、网络请求或业务对象。

如果业务允许导入不可信模板，还需要在 SDK 外层增加模板审查、物料白名单和富文本 sanitize 策略；Android SDK 不把 WebView 当作完整安全沙箱。

## 12. 非目标

明确不进入 Android 渲染 SDK：

- 打印机发现、状态查询、作业管理
- Android 系统打印 UI 封装
- 蓝牙、USB、网络打印机连接
- ESC/POS、CPCL、TSPL、ZPL 等打印语言
- 厂商打印 SDK 封装
- 静默打印
- 服务端 Render API
- Go host、daemon、IPC、CDP bridge
- Android 自带 Chromium/WebView 替换或下载管理
- 设计器编辑界面

SDK 的唯一目标是稳定地产出 PDF 或图片文件。

## 13. 分阶段落地

第一阶段：

- AAR 工程与 runtime assets 打包。
- `renderPdf()` 支持 `easyink` 和 `html`。
- `easyinkReady`、`selector`、`load` 三类 wait。
- 基础 diagnostics、timeout、取消。
- 离线 fonts/resources。

第二阶段：

- `renderImages()` 按页输出 PNG/JPEG。
- 连续纸超长 Bitmap 分片保护。
- `networkIdle` wait。
- WebView pool 和串行队列稳定化。

第三阶段：

- Runtime 版本校验和兼容性诊断。
- 批量渲染 API。
- 更细的安全策略和资源审计。

验收标准：

- 同一 schema 在 Web Viewer、桌面 Render 和 Android SDK 中页数、页面尺寸、主要元素布局一致。
- PDF 输出不弹系统打印 UI。
- 图片输出按页产生文件，页面尺寸与 `renderedPages` 一致。
- 字体、图片、资源失败均能被 diagnostics 捕获。
- 连续纸高度来自实际渲染结果。
