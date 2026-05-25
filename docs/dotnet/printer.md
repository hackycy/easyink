# EasyInk.Printer

EasyInk.Printer 是完整的 Windows 桌面打印服务应用，以内置 HTTP/WebSocket 服务器接收浏览器端的打印请求，无需 Electron。

## 功能一览

- **HTTP 服务**：RESTful API，供浏览器前端调用
- **WebSocket 服务**：实时双向通信，支持大文件分块上传
- **系统托盘**：后台静默运行，不占用任务栏
- **桌面管理窗口**：仪表盘、打印机列表、任务队列、审计日志、设置
- **审计日志**：SQLite 持久化，按打印机/状态/时间查询
- **安全**：API Key 认证（常量时间比较）、CORS 控制、SSRF 防护

## 架构

```
浏览器 (Vue)
    │  HTTP / WebSocket
    ▼
EasyInk.Printer
├── HttpServer              ← 路由 + API + CORS + 认证
├── WebSocketHandler         ← 实时通信 + 二进制帧 + 分块上传
├── WebSocketCommandHandler  ← 命令分发（print / getPrinters / uploadPdfChunk 等）
├── EngineApi                ← 引用 EasyInk.Engine.dll
├── AuditService             ← SQLite + Dapper
├── PrintDebugLogService     ← 打印调试日志（请求/响应/PDF 摘要）
└── WinForms UI              ← 系统托盘 + 管理窗口（仪表盘/打印机/任务/日志/设置）
```

## 安装

### 方式一：便携包

从 [EasyInk 最新应用发布](https://github.com/hackycy/easyink/releases/latest) 的 Release assets 下载 `EasyInkPrinter-Portable-*.zip`，解压后运行 `EasyInk.Printer.exe`。

### 方式二：安装包

从 [EasyInk 最新应用发布](https://github.com/hackycy/easyink/releases/latest) 的 Release assets 下载 `EasyInkPrinter-Setup-*.exe`，运行安装向导。

### 方式三：从源码构建

```bash
cd lib/EasyInk.Net

# 构建
dotnet build EasyInk.Printer/src
```

## 管理界面

首次启动 `EasyInk.Printer.exe` 后，可以打开桌面管理窗口确认服务状态。默认会进入仪表盘页，这一页适合做第一次自检，也适合排查“服务是否真的已经起来了”。

![EasyInk Printer 仪表盘界面](/images/easyink-printer-app.png)

从这个界面里，通常先看这几项：

- **服务状态**：是否已经进入“运行中”
- **端口**：当前 HTTP / WebSocket 监听端口，默认是 `18080`
- **WebSocket 连接**：前端接入后这里会显示活跃连接数
- **打印队列**：可以快速判断是否有任务堆积或阻塞

下方设备信息区域会展示服务地址、设备编号、应用版本和 MAC 地址。当前端提示无法连接本地打印服务时，先核对这里显示的地址和端口，再检查配置文件里的 `httpPort`、`apiKey` 和 CORS 设置是否一致。

顶部导航分为 **仪表盘**、**打印机**、**任务**、**日志**、**设置** 五个页面，分别用于查看整体状态、管理打印机、跟踪任务、审计日志和修改运行参数。

## 本地打包

```bat
cd lib\EasyInk.Net\EasyInk.Printer

# 便携包
build-portable.bat 1.2.3

# 安装包
build-installer.bat 1.2.3-beta.1
```

打包产物：

- `output/EasyInkPrinter-Portable.zip`
- `output/EasyInkPrinter-Setup.exe`

## 配置

配置文件路径：`%APPDATA%/EasyInk.Printer/config.json`（首次运行自动生成）

```json
{
  "httpPort": 18080,
  "autoStart": false,
  "minimizeToTray": true,
  "startMinimized": true,
  "dbPath": null,
  "crashLogDir": null,
  "printDebugLoggingEnabled": false,
  "printDebugArtifactsDir": null,
  "trustAllOrigins": false,
  "apiKey": null,
  "language": "",
  "lowDpiPrintEnhancement": "boost",
  "rawPrinterNames": [],
  "rawPrintDpi": 203,
  "rawPrintMaxDotsWidth": 576,
  "sumatraPdfPath": null,
  "sumatraTempDir": null,
  "sumatraPrinterNames": [],
  "sumatraPrintSettings": "fit",
  "sumatraTimeoutSeconds": 60,
  "maxWebSocketConnections": 100,
  "maxQueueSize": 100,
  "printTimeoutSeconds": 30,
  "maxConcurrentRequests": 50,
  "auditLogRetentionDays": 90,
  "fileLogRetentionDays": 7,
  "printDebugArtifactRetentionCount": 10
}
```

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `httpPort` | HTTP/WebSocket 监听端口 | `18080` |
| `autoStart` | 开机自动启动（写入注册表） | `false` |
| `minimizeToTray` | 关闭窗口时最小化到托盘 | `true` |
| `startMinimized` | 启动时最小化 | `true` |
| `dbPath` | 审计数据库路径（null 为默认位置） | `null` |
| `crashLogDir` | 崩溃日志目录 | `null` |
| `printDebugLoggingEnabled` | 启用打印调试日志 | `false` |
| `printDebugArtifactsDir` | 打印调试产物目录 | `null` |
| `trustAllOrigins` | 允许所有 CORS 来源 | `false` |
| `apiKey` | API Key（null 为不启用认证） | `null` |
| `language` | 界面语言（空为系统默认） | `""` |
| `lowDpiPrintEnhancement` | 低 DPI 小票打印位图增强模式：`normal` / `boost` / `monochrome` | `"boost"` |
| `rawPrinterNames` | 使用 Raw ESC/POS 直发模式的打印机名列表（模糊匹配） | `[]` |
| `rawPrintDpi` | Raw 打印 DPI | `203` |
| `rawPrintMaxDotsWidth` | Raw 打印最大宽度（点数，576 = 80mm 纸宽 @ 8 dots/mm） | `576` |
| `sumatraPdfPath` | SumatraPDF.exe 路径（null = 不启用 SumatraPDF fallback） | `null` |
| `sumatraTempDir` | SumatraPDF 临时 PDF 目录 | `null` |
| `sumatraPrinterNames` | 使用 SumatraPDF 的打印机名列表（模糊匹配） | `[]` |
| `sumatraPrintSettings` | SumatraPDF -print-settings 参数 | `"fit"` |
| `sumatraTimeoutSeconds` | SumatraPDF 超时时间（秒） | `60` |
| `maxWebSocketConnections` | WebSocket 最大连接数（下限 10） | `100` |
| `maxQueueSize` | 打印队列最大长度（下限 10） | `100` |
| `printTimeoutSeconds` | 单次打印超时（秒，下限 5） | `30` |
| `maxConcurrentRequests` | HTTP 最大并发请求数（下限 5） | `50` |
| `auditLogRetentionDays` | 审计日志保留天数（1-3650） | `90` |
| `fileLogRetentionDays` | 文件日志保留天数（1-3650） | `7` |
| `printDebugArtifactRetentionCount` | 打印调试产物保留份数（下限 1） | `10` |

## 安全

### API Key 认证

设置 `apiKey` 后，所有请求需携带 `X-API-Key` 头：

```bash
curl -H "X-API-Key: your-secret-key" http://localhost:18080/api/printers
```

认证使用常量时间比较（XOR），防止时序攻击。

### CORS

默认只允许本地来源（`localhost`、`127.0.0.1`、`::1`）。设置 `trustAllOrigins: true` 可放行所有来源。

### 请求限制

| 类型 | 限制 |
|------|------|
| HTTP 请求体 | 10 MB |
| WebSocket 二进制消息 | 60 MB |
| PDF 文件大小 | 50 MB |
| WebSocket 分块大小 | 2 MB |

## 发布产物

```
publish/
├── EasyInk.Printer.exe          # 主程序
├── EasyInk.Engine.dll           # 打印引擎
├── Newtonsoft.Json.dll
├── Dapper.dll
├── System.Data.SQLite.dll
└── ...
```

## 部署要求

- Windows 7 SP1 及以上
- .NET Framework 4.8 运行时（Windows 10 1903+ 已内置，Windows 7/8/8.1 需[单独安装](https://dotnet.microsoft.com/download/dotnet-framework/net48)）
- 无需额外安装，复制即用
