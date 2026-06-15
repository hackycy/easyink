# EasyInk Android

EasyInk Android 是原生 AAR 渲染 SDK。它把 `html` 或 `easyink schema + data` 渲染为文件输出，第一版已打通 PDF 和按页图片输出闭环。

## 构建

从仓库根目录运行：

```bash
pnpm android:render-sdk:build
```

该命令会：

1. 执行 `pnpm render:runtime` 生成 `internal-packages/viewer-runtime`。
2. 下载固定版本 Gradle 到 `lib/EasyInk.Android/.gradle/android-render-sdk`。
3. 构建 Android AAR 和最小 sample app。
4. 验证 AAR 内包含 `assets/easyink-viewer/index.html`、`assets/easyink-viewer/assets/viewer.js`、`assets/easyink-viewer/assets/viewer.css`。

构建产物：

```text
lib/EasyInk.Android/build/outputs/aar/easyink-android-render-release.aar
lib/EasyInk.Android/samples/minimal/build/outputs/apk/debug/sample-minimal-debug.apk
```

## Sample App

Android Studio 打开目录：

```text
lib/EasyInk.Android
```

打开后选择 `sample-minimal` 运行配置，启动到模拟器或真机。示例界面提供两个按钮：

- `Render PDF`
- `Render Images`

输出文件会发布到系统下载目录 `Download/EasyInk`，界面上会显示 PDF 文件路径或图片目录路径。

## 最小调用

```kotlin
val result = EasyInkRenderer.renderPdf(
    context = context,
    request = EasyInkRenderRequest(
        requestId = "receipt-001",
        source = EasyInkRenderSource.Schema(
            schemaJson = schemaJson,
            dataJson = dataJson,
        ),
    ),
    output = File(context.cacheDir, "receipt-001.pdf"),
)
```

HTML 输入：

```kotlin
val result = EasyInkRenderer.renderPdf(
    context = context,
    request = EasyInkRenderRequest(
        requestId = "html-001",
        source = EasyInkRenderSource.Html(
            html = "<div style=\"width:80mm;height:40mm\">Hello EasyInk</div>",
        ),
        pdf = EasyInkPdfOptions(
            paperWidthMm = 80.0,
            paperHeightMm = 40.0,
        ),
    ),
    output = File(context.cacheDir, "html-001.pdf"),
)
```

按页图片输出：

```kotlin
val result = EasyInkRenderer.renderImages(
    context = context,
    request = EasyInkRenderRequest(
        requestId = "receipt-001",
        source = EasyInkRenderSource.Schema(
            schemaJson = schemaJson,
            dataJson = dataJson,
        ),
    ),
    outputDir = File(context.cacheDir, "easyink-images"),
    options = EasyInkImageOptions(
        format = EasyInkImageFormat.PNG,
        scale = 2f,
    ),
)
```

## 当前状态

- AAR 工程已建立。
- AAR 内置并验证 EasyInk viewer runtime assets。
- `renderPdf()` 已实现 schema/html 两类输入。
- `renderImages()` 已实现 schema/html 两类输入，按页输出 PNG/JPEG。
- WebView 渲染通过 loopback-only local server 加载。
- `easyinkReady`、`selector`、`load` 等待策略已实现。
- PDF 输出使用 `renderedPages` 作为页面尺寸来源。
- 图片输出使用 `.ei-viewer-page` 页面 rect 和 `renderedPages` 控制单页截图尺寸。
- `samples/minimal` 提供最小 Android app，可在 Android Studio 中运行 PDF/图片输出验证。

当前第一版 PDF 写入使用 `PdfDocument` 绘制 WebView 画布，避免直接依赖 Android `PrintDocumentAdapter` package-private callback 构造器。后续如果需要更贴近系统 WebView 打印输出，应单独验证 Java shim 或平台差异方案。
