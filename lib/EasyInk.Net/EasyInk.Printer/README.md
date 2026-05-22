# EasyInk.Printer

EasyInk.Printer 是 EasyInk 的 Windows 本地打印服务应用，目标框架为 .NET Framework 4.8。它封装 EasyInk.Engine，并提供 HTTP/WebSocket API、系统托盘、WinForms 管理界面、配置管理和 SQLite 审计日志。

## 运行能力

- `HttpListener` 本地 HTTP 服务，默认端口 `18080`。
- WebSocket 命令通道和连接数统计。
- 系统托盘后台运行，桌面窗口查看仪表盘、打印机、任务、日志和设置。
- 审计日志存储到 SQLite；初始化失败时退化为 `NullAuditService`。
- 支持 PDFium/GDI、SumatraPDF fallback、ESC/POS raw 三种打印路径。

## HTTP API

基础地址：`http://localhost:{port}`。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/status` | 服务状态、版本、启动时间、内存。 |
| `GET` | `/api/status/connections` | 当前 WebSocket 连接数。 |
| `GET` | `/api/printers` | 打印机列表。 |
| `GET` | `/api/printers/{name}/status` | 指定打印机状态，`name` 需 URL 编码。 |
| `POST` | `/api/print` | 同步打印。 |
| `POST` | `/api/print/async` | 异步打印，返回 `jobId`。 |
| `GET` | `/api/jobs` | 获取任务记录。 |
| `GET` | `/api/jobs/{id}` | 查询任务状态。 |
| `GET` | `/api/logs` | 查询审计日志。 |

响应格式与 Engine 的 `PrinterResult` 一致：

```json
{
  "id": "request-id",
  "success": true,
  "data": {},
  "errorInfo": null
}
```

当配置了 `ApiKey` 时，HTTP 请求必须带 `X-API-Key`。CORS 默认只允许本机来源；`TrustAllOrigins=true` 时返回 `Access-Control-Allow-Origin: *`。

## 打印请求

JSON 打印：

```json
{
  "printerName": "HP LaserJet",
  "pdfBase64": "JVBERi0xLjQK...",
  "copies": 1,
  "forcePaperSize": false,
  "dpi": 600
}
```

支持的 PDF 来源：

| 来源 | 传输方式 | 说明 |
|------|----------|------|
| `pdfBase64` | JSON | Base64 PDF。 |
| `pdfUrl` | JSON | 远程 PDF URL，Engine 会拦截 localhost 和内网地址。 |
| `pdfBytes` | multipart | 二进制 PDF。 |

`multipart/form-data` 请求需要包含：

- `params`：JSON 参数。
- `pdf`：PDF 文件字段。

HTTP 层请求体总上限为 10MB。Multipart 解析器内部的 PDF 上限为 50MB，但经 HTTP API 到达时会先受 10MB 总请求限制。

## WebSocket

地址：`ws://localhost:{port}/ws`。

文本命令：

```json
{
  "command": "printAsync",
  "id": "request-id",
  "params": {
    "printerName": "HP LaserJet",
    "pdfBase64": "JVBERi0xLjQK..."
  }
}
```

二进制消息格式：

```
4 字节大端 metadata 长度 + metadata JSON + PDF bytes
```

WebSocket 支持命令：

| 命令 | 说明 |
|------|------|
| `print`、`printAsync` | 直接打印，支持文本参数或二进制 PDF。 |
| `uploadPdfChunk` | 分片上传 PDF，单片上限 2MB，总 PDF 上限 50MB，上传会话 10 分钟过期。 |
| `printUploadedPdf`、`printUploadedPdfAsync` | 使用已上传 PDF 打印。 |
| `getPrinters`、`getPrinterStatus` | 打印机查询。 |
| `getJobStatus`、`getAllJobs` | 任务查询。 |
| `queryLogs` | 审计日志查询。 |

完整 WebSocket 消息上限为 60MB，默认最大连接数为 100，低于 10 的配置会自动提升到 10。

## 配置

配置文件：`%APPDATA%\EasyInk.Printer\config.json`。应用保存配置时使用 `HostConfig` 的 PascalCase 字段名；读取时 Json.NET 也能兼容不同大小写。

常用字段：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `HttpPort` | `18080` | HTTP/WebSocket 端口。 |
| `AutoStart` | `false` | 是否写入当前用户开机启动。 |
| `MinimizeToTray` | `true` | 关闭/最小化到托盘。 |
| `StartMinimized` | `true` | 启动后最小化。 |
| `DbPath` | `%LocalAppData%\EasyInk.Printer\data\audit.db` | 审计数据库路径。 |
| `CrashLogDir` | `%LocalAppData%\EasyInk.Printer\data\crash` | 崩溃日志目录。 |
| `PrintDebugLoggingEnabled` | `false` | 是否保存打印调试材料。 |
| `TrustAllOrigins` | `false` | 是否放开 CORS。 |
| `ApiKey` | `null` | HTTP API Key。 |
| `Language` | `""` | 语言，空值跟随默认逻辑。 |
| `MaxWebSocketConnections` | `100` | WebSocket 连接上限，最小 10。 |
| `MaxQueueSize` | `100` | Engine 异步队列上限，最小 10。 |
| `MaxConcurrentRequests` | `50` | HTTP 并发处理上限，最小 5。 |
| `AuditLogRetentionDays` | `90` | 审计日志保留天数。 |
| `FileLogRetentionDays` | `7` | 文件日志保留天数。 |
| `LowDpiPrintEnhancement` | `boost` | 低 DPI 增强：`normal`、`boost`、`monochrome`。 |
| `RawPrinterNames` | `[]` | ESC/POS raw 打印机名称片段。 |
| `RawPrintDpi` | `203` | Raw 打印 DPI。 |
| `RawPrintMaxDotsWidth` | `576` | Raw 最大点宽。 |
| `SumatraPdfPath` | 程序目录 `SumatraPDF\SumatraPDF.exe` | SumatraPDF 路径。 |
| `SumatraPrinterNames` | `[]` | SumatraPDF fallback 打印机名称片段。 |
| `SumatraPrintSettings` | `fit` | SumatraPDF `-print-settings`。 |
| `SumatraTimeoutSeconds` | `60` | SumatraPDF 进程超时。 |
| `SumatraTempDir` | `%LocalAppData%\EasyInk.Printer\temp\sumatra` | SumatraPDF 临时 PDF 目录。 |

打印机名称片段匹配均为大小写不敏感的包含匹配。打印路径优先级为 SumatraPDF fallback、ESC/POS raw、默认 PDFium/GDI。

## 构建与打包

```bash
cd lib/EasyInk.Net
dotnet build EasyInk.Printer/src
dotnet test EasyInk.Printer/tests
```

Windows 本地打包：

```bat
cd lib\EasyInk.Net\EasyInk.Printer

build-portable.bat 1.2.3
build-installer.bat 1.2.3-beta.1
```

脚本会准备固定版本的 32-bit portable SumatraPDF 到 `src\SumatraPDF\SumatraPDF.exe`，并复制到最终产物的 `SumatraPDF\SumatraPDF.exe`。

版本规则：

- `1.2.3` -> `AssemblyVersion=1.2.3.0`、`FileVersion=1.2.3.0`。
- `1.2.3-beta.1` -> 展示版本保留预发布标签，程序集和文件版本归一到 `1.2.3.0`。

## 部署要求

- Windows 7 SP1 及以上。
- .NET Framework 4.8 运行时。
- 局域网访问依赖 Windows 防火墙入站规则。安装器会为默认端口 `18080` 添加 `EasyInk Printer HTTP 18080` 规则；若运行时改端口，应用会提示管理员授权并为新端口添加覆盖专用、域和公用网络的入站规则，以适配门店、仓库、收银机等网络常被 Windows 识别为公用网络的场景。
- 发布目录保留 `x86\SQLite.Interop.dll`、`x64\SQLite.Interop.dll`。
- 若启用 SumatraPDF fallback，发布目录保留 `SumatraPDF\SumatraPDF.exe`。
