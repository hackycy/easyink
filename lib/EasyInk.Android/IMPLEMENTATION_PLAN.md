# EasyInk Android SDK 落地步骤方案

本文档记录 EasyInk Android 渲染 SDK 的实施路径。架构边界以 [ARCHITECTURE.md](ARCHITECTURE.md) 为准：Android SDK 只负责把 `html` 或 `easyink schema + data` 渲染为 PDF 或图片文件，不负责物理打印、系统打印 UI、打印机协议或厂商 SDK 对接。

## 1. 目标与成功标准

第一版目标：

- 发布一个可被 Android 应用依赖的 AAR。
- AAR 内置现有 `internal-packages/viewer-runtime` 构建产物。
- 提供 `renderPdf()`，支持 `EasyInkRenderSource.Schema` 和 `EasyInkRenderSource.Html`。
- 使用隐藏 WebView 完成渲染，PDF 输出写入调用方指定文件，不弹系统打印 UI。
- 返回页数、页面尺寸、WebView 信息、耗时、console error、资源失败等 diagnostics。

第一版验收标准：

- `pnpm render:runtime` 后，Android AAR 中能解压看到 `assets/easyink-viewer/index.html`、`assets/easyink-viewer/assets/viewer.js`、`assets/easyink-viewer/assets/viewer.css`。
- 同一份基础 schema 在 Web Viewer、桌面 Render 和 Android SDK 中页数、纸张尺寸一致。
- `renderPdf()` 对 `easyinkReady`、`selector`、`load` 等待条件能超时、取消和成功返回。
- PDF 文件非空，且调用过程不打开系统打印对话框。
- 字体、图片、远程资源失败能进入 diagnostics，而不是静默失败。

## 2. 推荐目录结构

```text
lib/EasyInk.Android/
  ARCHITECTURE.md
  IMPLEMENTATION_PLAN.md
  build.gradle.kts
  settings.gradle.kts
  gradle.properties
  src/main/
    AndroidManifest.xml
    assets/easyink-viewer/
      index.html
      assets/viewer.css
      assets/viewer.js
    kotlin/com/easyink/android/
      EasyInkRenderer.kt
      EasyInkRenderRequest.kt
      EasyInkRenderResult.kt
      internal/
        RuntimeAssetServer.kt
        RenderQueue.kt
        WebViewSession.kt
        WaitController.kt
        PdfWriter.kt
        DiagnosticsCollector.kt
```

说明：

- Android 工程先保持独立 Gradle library module，避免牵动根级 pnpm workspace 包结构。
- Kotlin 包名建议使用 `com.easyink.android`，AAR artifact 建议使用 `easyink-android-render`。
- `src/main/assets/easyink-viewer` 是构建同步产物，不在 Android 侧维护独立 runtime 源码。

## 3. 阶段一：AAR 工程与 Runtime 打包

任务：

1. 创建 Android library 工程。
2. 配置 Kotlin Android plugin、Android Gradle Plugin、namespace、minSdk、consumer ProGuard rules。
3. 增加 `syncViewerRuntime` Gradle task，从 `internal-packages/viewer-runtime/dist/runtime/easyink-viewer` 复制 runtime 到 `src/main/assets/easyink-viewer`。
4. 让 `preBuild` 依赖 `syncViewerRuntime`，并在 task 中校验 `index.html`、`assets/viewer.js`、`assets/viewer.css` 存在。
5. 根级 `package.json` 增加单一入口脚本，例如 `android:render-sdk:build`，先执行 `pnpm render:runtime`，再执行 Android `assembleRelease`。

验证：

```bash
pnpm render:runtime
./gradlew -p lib/EasyInk.Android assembleRelease
unzip -l lib/EasyInk.Android/build/outputs/aar/*.aar | grep 'assets/easyink-viewer'
```

注意：

- 现有 `internal-packages/viewer-runtime/scripts/sync-runtime.mjs` 目前只同步到 `lib/EasyInk.Render/host/internal/easyink/runtime/easyink-viewer`。Android 不应依赖 Go host 目录，应从 runtime package 的 `dist/runtime/easyink-viewer` 读取。
- 不要在 Android SDK 内 fork 或重写 Viewer runtime。

## 4. 阶段二：公开协议与请求归一化

任务：

1. 定义公开 API：

```kotlin
object EasyInkRenderer {
    suspend fun renderPdf(
        context: Context,
        request: EasyInkRenderRequest,
        output: File,
    ): EasyInkRenderResult
}
```

2. 定义请求模型：

```kotlin
data class EasyInkRenderRequest(
    val requestId: String,
    val source: EasyInkRenderSource,
    val pdf: EasyInkPdfOptions = EasyInkPdfOptions(),
    val wait: EasyInkWaitOptions = EasyInkWaitOptions(),
    val security: EasyInkSecurityOptions = EasyInkSecurityOptions(),
    val diagnostics: EasyInkDiagnosticsOptions = EasyInkDiagnosticsOptions(),
)
```

3. 定义 `Html` 与 `Schema` 两类 source，先支持内联 html、schemaJson、dataJson、离线 resources、fonts。
4. 实现请求大小限制、默认 wait、默认 PDF margin 和纸张规则归一化。
5. 将错误分为输入错误、等待超时、WebView 加载失败、runtime 错误、输出失败。

验证：

- Kotlin/JVM 单元测试覆盖 request normalize。
- 无效 JSON、空 requestId、超出 `maxInputBytes` 能返回结构化错误。
- `source=Schema` 默认 wait 为 `easyinkReady`。

## 5. 阶段三：Loopback Runtime Server

任务：

1. 实现只绑定 `127.0.0.1` 的 session 级 HTTP server。
2. 每个 render session 生成随机 token，runtime、asset、resource 路径都必须校验 token。
3. 提供 runtime 静态文件路由：

```text
http://127.0.0.1:{port}/{token}/easyink-viewer/index.html
http://127.0.0.1:{port}/{token}/easyink-viewer/assets/viewer.js
http://127.0.0.1:{port}/{token}/easyink-viewer/assets/viewer.css
```

4. 为 `Schema` 请求生成包含 `#easyink-payload` 的 HTML；为 `Html` 请求生成可承载调用方 HTML 的 wrapper。
5. 注册离线 resources 和 fonts；未命中资源按 `security.allowedOrigins` 决定是否允许远程请求。
6. render 完成、取消或失败时关闭 server，清理 session 资源。

验证：

- token 缺失或错误时返回 404 或 403。
- server 不绑定 `0.0.0.0`。
- 默认拒绝 `file://`、`content://`、私网地址和非 SDK 内部 localhost。
- 离线图片、字体能被 WebView 加载；缺失资源会进入 diagnostics。

## 6. 阶段四：Hidden WebView Render Host

任务：

1. 建立主线程调度封装，WebView 创建、加载、JS 执行、截图都在主线程运行。
2. 实现默认串行 `RenderQueue`，第一版不暴露并发配置。
3. 每个任务创建独立 `WebViewSession`，配置 WebSettings、WebViewClient、WebChromeClient、JS bridge。
4. 加载 loopback runtime URL。
5. 实现 wait 策略：

```text
load          -> onPageFinished
selector      -> document.querySelector(selector) != null
easyinkReady  -> window.easyinkReady === true 或 easyink:ready event
```

6. 采集页面 metrics：

```javascript
window.__easyinkGetPages?.()
// 或从 Viewer runtime 暴露的 renderedPages bridge 读取
```

7. 如果设备对完全脱离窗口的 WebView PDF 或截图不稳定，使用 SDK 内部不可见容器承载，但不暴露给业务 UI。

验证：

- success、timeout、cancel 三条路径都能释放 WebView 和 server。
- console error、runtime exception、resource failure 可被 diagnostics 收集。
- `easyinkReady` 成功后能读到 pageCount 和每页尺寸。

需要补齐的 runtime 契约：

- 现有 `internal-packages/viewer-runtime/src/main.ts` 已设置 `window.easyinkReady`、`.easyink-ready` 和 `@page` CSS。
- Android 读取 `renderedPages` 时需要稳定 JS 契约。建议在 runtime 中暴露只读方法，例如 `window.easyinkRenderedPages` 或 `window.__easyinkGetPages()`，避免 Android 从 DOM 样式反推尺寸。

## 7. 阶段五：PDF 输出

任务：

1. 根据 `renderedPages` 与 PDF options 生成页面尺寸。
2. 第一版使用 `PdfDocument.PageInfo` 创建 PDF 页面。
3. 将已渲染 WebView layout 到目标页面尺寸，并调用 `WebView.draw(pdfPage.canvas)`。
4. 写入调用方文件。
5. 输出完成后校验文件存在且大小大于 0。

验证：

- 输出 PDF 不弹系统打印 UI。
- 固定页 schema 的 PDF 页面尺寸与 `renderedPages` 一致。
- 连续纸高度来自 Viewer 渲染后的实际高度。
- 输出失败能进入结构化错误和 diagnostics。

后续决策点：

- 如果需要更贴近 Android WebView 打印框架，可单独评估 `PrintDocumentAdapter`。当前 API 36 的 `PrintDocumentAdapter.LayoutResultCallback` 和 `WriteResultCallback` 构造器在 android.jar 中是 package-private，Kotlin 不能直接实例化，需要 Java shim 或其他平台方案验证后再替换。

## 8. 阶段六：测试应用与端到端验证

任务：

1. 添加最小 sample app 或 instrumentation test app。
2. 覆盖 schema PDF、html PDF、离线图片、离线字体、资源失败、等待超时。
3. 准备至少两类模板：

```text
fixed receipt/page
continuous receipt/page
```

4. 在 CI 或手动验证文档中记录 Android 设备或模拟器要求。

验证：

- Android instrumentation test 可在模拟器上生成非空 PDF。
- diagnostics snapshot 中包含 `runtimeVersion`、`webViewVersion`、`durationMs`、`pageCount`。
- AAR 解压资产检查纳入 build verification。

## 9. 阶段七：图片输出

阶段一到六稳定后再做图片输出，避免同时处理 PDF、截图和 Bitmap 限制导致调试面过大。

任务：

1. 增加 `renderImages()` API。已完成。
2. 读取每页 DOM rect 和 `renderedPages`，按页截图。已完成。
3. 支持 PNG/JPEG、scale、backgroundColor。已完成。
4. 检查 Bitmap 最大尺寸，连续纸超高时失败并返回 diagnostics，不静默裁切。已完成。

验证：

- 多页固定纸输出多张图片。
- 连续纸输出一张长图，超限时返回结构化错误。
- 图片像素尺寸与页面 DOM rect 和 `scale` 一致，并以 `renderedPages` 作为页面数量与尺寸来源。

## 10. 推荐推进顺序

```text
1. AAR skeleton + runtime assets
2. API model + request normalize tests
3. loopback server + resource registry
4. hidden WebView + wait + diagnostics
5. renderedPages runtime contract
6. renderPdf end-to-end
7. sample app / instrumentation tests
8. renderImages
9. Maven publishing metadata
```

这个顺序的关键是先打通一条最小 PDF 闭环，再扩展图片、并发、批量渲染和发布细节。

## 11. 风险与决策点

- WebView PDF 依赖系统 WebView 和 Android 打印框架，不同设备可能存在输出差异，需要 instrumentation test 做真实验证。
- 完全离屏 WebView 在部分设备上可能无法稳定截图或打印，内部不可见容器需要作为实现兜底。
- 当前 runtime 还缺少正式的 `renderedPages` JS 读取契约，Android 开发前应先补齐。
- Android `http://127.0.0.1` 需要 network security config 限定 loopback cleartext，不能打开全局 cleartext。
- `Html` source 和 `Schema` source 共用一条 WebView 管线，但两者的 payload wrapper 需要清晰区分，避免 HTML 模式误触 schema runtime。
- 第一版默认串行渲染，等 PDF 闭环稳定后再考虑 WebView pool 和并发。

## 12. 文档同步要求

当新增或变更以下内容时，需要同步更新本文档和 [ARCHITECTURE.md](ARCHITECTURE.md)：

- 公开 API、请求模型、错误码或 diagnostics 字段。
- runtime 集成契约，例如 `#easyink-payload`、`window.easyinkReady`、`renderedPages` 暴露方式。
- 构建命令、AAR asset 路径、Maven artifact 名称。
- 安全默认值、资源加载策略、network security config。
- 分阶段目标和验收标准。
