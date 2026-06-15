# EasyInk Android

EasyInk Android 是原生 AAR 渲染 SDK。它把 `html` 或 `easyink schema + data` 渲染为文件输出，第一版已打通 PDF 和按页图片输出闭环。

## 文档入口

从本文件开始阅读 Android SDK 文档：

| 主题 | 入口 |
| --- | --- |
| 快速构建、运行 sample、最小调用、发布说明 | 本 README |
| 技术架构、边界、渲染流程、安全模型 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 分阶段计划、完成度、剩余工作 | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
| 最小 Android 示例应用 | [samples/minimal](samples/minimal) |

SDK 边界：本包只负责渲染 PDF 或图片文件，不负责物理打印、系统打印 UI、蓝牙/USB 打印机协议或厂商打印 SDK。

## 当前状态

已完成：

- AAR 工程已建立。
- AAR 内置并验证 EasyInk viewer runtime assets。
- `renderPdf()` 已实现 schema/html 两类输入。
- `renderImages()` 已实现 schema/html 两类输入，按页输出 PNG/JPEG。
- WebView 渲染通过 loopback-only local server 加载。
- `easyinkReady`、`selector`、`load` 等待策略已实现。
- PDF 输出使用 `renderedPages` 作为页面尺寸来源。
- 图片输出使用 `.ei-viewer-page` 页面 rect 和 `renderedPages` 控制单页截图尺寸。
- `samples/minimal` 提供最小 Android app，可在 Android Studio 中运行 PDF/图片输出验证。
- `maven-publish` 和 release publication 已配置，发布仓库地址、凭据和签名流程仍需按目标仓库补齐。

待补齐：

- request normalize 单元测试。
- Android instrumentation test。
- schema PDF、离线图片、离线字体、资源失败、等待超时、多页图片、连续纸和超限错误的自动化覆盖。
- 远程 Gradle/Maven 仓库发布闭环，包括仓库配置、凭据、POM 元数据、签名和 CI 发布。

## 构建 AAR 与 Sample

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

注意：

- Gradle 下载和缓存放在 `lib/EasyInk.Android/.gradle/` 下，不在仓库根目录生成 `.gradle/`。
- `src/main/assets/easyink-viewer/` 是构建同步产物，已被 `.gitignore` 忽略，避免保留旧 runtime assets。

## Sample App

Android Studio 打开目录：

```text
lib/EasyInk.Android
```

打开后选择 `sample-minimal` 运行配置，启动到模拟器或真机。示例界面提供两个按钮：

- `Render PDF`
- `Render Images`

输出文件会发布到系统下载目录 `Download/EasyInk`，界面上会显示 PDF 文件路径或图片目录路径。

也可以直接安装 debug APK：

```bash
adb install -r lib/EasyInk.Android/samples/minimal/build/outputs/apk/debug/sample-minimal-debug.apk
```

## 最小调用

PDF 输出：

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

HTML PDF 输入：

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

## 远程 Gradle 仓库发布

Android AAR 发布到远程 Gradle 仓库时，实际使用的是 Maven repository 格式。当前工程已经配置：

- `group = "com.easyink"`
- `version = "0.1.0"`
- `artifactId = "easyink-android-render"`
- `maven-publish`
- release variant 的 sources jar 和 javadoc jar

消费方依赖坐标：

```kotlin
repositories {
    maven {
        url = uri("https://your-maven-repository.example.com/releases")
    }
}

dependencies {
    implementation("com.easyink:easyink-android-render:0.1.0")
}
```

发布前需要在 `lib/EasyInk.Android/build.gradle.kts` 增加目标仓库配置。私有 Nexus、Artifactory、GitHub Packages 可使用同一形态：

```kotlin
publishing {
    repositories {
        maven {
            name = "EasyInkRemote"
            url = uri(providers.gradleProperty("easyinkMavenUrl").get())
            credentials {
                username = providers.gradleProperty("easyinkMavenUsername").get()
                password = providers.gradleProperty("easyinkMavenPassword").get()
            }
        }
    }
}
```

凭据放在本机 `~/.gradle/gradle.properties` 或 CI secret 中，不提交到仓库：

```properties
easyinkMavenUrl=https://your-maven-repository.example.com/releases
easyinkMavenUsername=your-user
easyinkMavenPassword=your-token
```

发布命令：

```bash
pnpm render:runtime
./lib/EasyInk.Android/.gradle/android-render-sdk/gradle-9.5.1/bin/gradle \
  --no-daemon \
  --gradle-user-home lib/EasyInk.Android/.gradle/user-home \
  -p lib/EasyInk.Android \
  publishReleasePublicationToEasyInkRemoteRepository
```

GitHub Packages 示例仓库地址：

```properties
easyinkMavenUrl=https://maven.pkg.github.com/hackycy/easyink
```

Maven Central 需要额外完成：

- POM 元数据：name、description、license、developers、scm。
- GPG signing。
- Sonatype Central Portal namespace 验证。
- staging/upload/release 或 CI 发布流程。
- 发布后用一个全新的 Android 工程验证远程依赖可解析、AAR assets 可被打包。

## 实现说明

当前第一版 PDF 写入使用 `PdfDocument` 绘制 WebView 画布，避免直接依赖 Android `PrintDocumentAdapter` package-private callback 构造器。后续如果需要更贴近系统 WebView 打印输出，应单独验证 Java shim 或平台差异方案。
