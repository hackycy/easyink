# EasyInk.Net

EasyInk 的 Windows 本地打印包集合，目标框架为 .NET Framework 4.8，面向 Windows 7 SP1 及以上系统。

## 包列表

| 包 | 类型 | 说明 |
|----|------|------|
| [EasyInk.Engine](EasyInk.Engine/) | DLL | 打印引擎。负责打印机查询、PDF 获取、打印队列和打印执行，不包含 UI、HTTP 服务或持久化。 |
| [EasyInk.Printer](EasyInk.Printer/) | WinExe | 本地打印服务应用。提供 HTTP/WebSocket API、系统托盘、WinForms 管理界面、审计日志和配置管理。 |

## 当前架构

```
浏览器 / 前端
  -> HTTP / WebSocket
EasyInk.Printer
  -> EngineApi
EasyInk.Engine
  -> RenderAwarePrintService (可选：HTML/EasyInk -> PDF)
  -> RoutingPrintService
     -> PdfiumPrintService       默认：PDFium 位图渲染 + PrintDocument + Windows Spooler
     -> SumatraPdfPrintService   可选：指定打印机走 SumatraPDF CLI fallback
     -> EscPosRawPrintService    可选：指定打印机走 ESC/POS raw 直发
```

路由优先级为 SumatraPDF fallback、ESC/POS raw、默认 PDFium/GDI。

启用 Render 后，`renderSource` 请求会先通过本地 `easyink-render` 转成 PDF，再进入同一套物理打印路由；纯 PDF 请求保持原路径不变。

## 打印路径

### 默认 PDFium/GDI

- `PDF -> PdfiumViewer -> System.Drawing.Printing.PrintDocument -> Windows Spooler`。
- 默认 `ForcePaperSize=false`，由打印机驱动使用当前默认纸张。
- 每页按驱动返回的 `PrintableArea` 等比缩放并居中。
- 默认渲染 DPI 为 600，并参考驱动分辨率，上限 1200；低分辨率小票/热敏设备会按配置进行增强或贴合。

### SumatraPDF fallback

- 对 `SumatraPrinterNames` 命中的打印机启用。
- 命令形态：`SumatraPDF.exe -silent -exit-on-print -print-to "PrinterName" -print-settings "fit" "file.pdf"`。
- 默认路径为程序目录下 `SumatraPDF\SumatraPDF.exe`，默认参数为 `fit`，默认超时 60 秒。
- 适合默认链路在特定驱动上错位、裁切或模糊，而浏览器打印正常的场景。

### ESC/POS raw

- 对 `RawPrinterNames` 命中的打印机启用。
- `PDF -> PdfiumViewer 位图 -> ESC/POS GS v 0 光栅指令 -> WritePrinter`。
- 绕过 Windows 打印驱动的纸张、缩放和硬边距逻辑，主要用于热敏小票打印机。
- 默认 `RawPrintDpi=203`、`RawPrintMaxDotsWidth=576`。

### Render 前置归一化

- 对带 `renderSource` 的请求启用，支持 `type=html` 和 `type=easyink`。
- Printer 调用本地 `easyink-render.exe render` CLI。CLI 会自动通过本机 IPC 启动并复用 Render daemon，不再暴露或配置 Render HTTP 端口。
- 成功后把 Render 输出的 PDF bytes 交回既有 `RoutingPrintService`，继续走 PDFium、ESC/POS raw 或 SumatraPDF。
- 若同时提供 PDF 输入和 `renderSource`，请求会返回 `INVALID_PARAMS`。
- Render CLI 随 Printer 内置在发布目录 `render\host\win-x64\easyink-render.exe` 与 `render\host\win-x86\easyink-render.exe`；C# 默认按操作系统位数自动选择对应架构，若目标缺失会回退到另一架构。设置页只暴露浏览器类型、Chrome 版本和浏览器目录。C# 会按浏览器类型在内置 `render\browser`、所选浏览器目录、版本子目录和系统浏览器中解析实际 exe，并把 `browser.kind` 与解析后的路径传给 Render CLI。下载行为按浏览器类型分流: `chrome-for-testing` / `headless-shell` / `chrome` 使用 Chrome for Testing 索引，`chromium` 使用 Chromium snapshot，当前支持 109 的固定 snapshot 下载，`edge` / `custom` 默认使用系统浏览器、目录或 runtime manifest。Windows 7/8.1 自动推荐 Chrome/Chromium 109；Chrome 109 不在 Chrome for Testing 索引中，运行时会自动检测本机已安装 Chrome 109，也支持手动目录或内网 runtime manifest 包。仪表盘会显示 Render daemon 状态，设置页支持手动启动/停止 daemon。

## 目录结构

```
EasyInk.Net/
├── EasyInk.Engine/
│   ├── src/
│   └── tests/
├── EasyInk.Printer/
│   ├── src/
│   │   ├── Api/
│   │   ├── Config/
│   │   ├── Server/
│   │   ├── Services/
│   │   └── UI/
│   ├── tests/
│   ├── build-portable.bat
│   ├── build-installer.bat
│   └── installer.iss
└── EasyInk.Net.sln
```

## 构建与测试

```bash
cd lib/EasyInk.Net

dotnet build EasyInk.Engine/src
dotnet build EasyInk.Printer/src

dotnet test EasyInk.Engine/tests
dotnet test EasyInk.Printer/tests
```

本地打包在 Windows 下运行：

```bat
cd lib\EasyInk.Net\EasyInk.Printer

build-portable.bat 1.2.3
build-installer.bat 1.2.3-beta.1
```

脚本会准备内置 SumatraPDF，并把同一个版本写入 Printer、Engine 和安装包元数据。预发布版本会保留在 `InformationalVersion`，程序集版本归一为四段数字，例如 `1.2.3.0`。

## 运行与部署

- 目标机器需要 .NET Framework 4.8 运行时。
- Printer 发布目录必须保留 `x86/SQLite.Interop.dll` 和 `x64/SQLite.Interop.dll`，否则审计日志会退化或不可用。
- 若启用 SumatraPDF fallback，发布目录需要包含 `SumatraPDF\SumatraPDF.exe`。
- 若启用 Render，发布目录需要包含 `render\host\win-x64\easyink-render.exe` 与 `render\host\win-x86\easyink-render.exe`。Chrome for Testing / headless shell 可随包放入 `render\browser`，也可以在 Printer 设置页按版本下载到本地缓存；离线环境可从 `https://googlechromelabs.github.io/chrome-for-testing/` 下载普通版本。Win7/8.1 使用 Chrome 109 时，可安装本机 Chrome 109、把历史离线包/已安装目录解压到 `%LOCALAPPDATA%\EasyInk.Printer\render\browser\versions\<version>`，或通过 `render\runtime-manifest.json` 指向内网包。Render daemon 默认常驻，设置里的空闲时间为 `0` 表示不因空闲退出；填入非 0 毫秒值才启用空闲退出。Go Render CLI 的构建请在 Docker 中执行，避免依赖本机 Go 环境。

## 兼容性

| 系统 | 支持情况 |
|------|----------|
| Windows 7 SP1 | 支持，需安装 .NET Framework 4.8 |
| Windows 8/8.1 | 支持 |
| Windows 10 | 支持 |
| Windows 11 | 支持 |

## License

MIT
