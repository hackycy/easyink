# EasyInk.Printer

## 概述

EasyInk.Printer 是 EasyInk 打印服务的完整应用，以 Windows 桌面应用形式运行，提供以下能力：

- **HTTP/WebSocket 服务**：供浏览器前端（Vue）调用打印功能
- **系统托盘**：后台静默运行，不占用任务栏
- **桌面管理窗口**：查看打印机状态、打印队列、审计日志、服务配置

### 设计目标

- 浏览器通过 HTTP/WebSocket 调用本地打印能力，无需 Electron
- 兼容 Windows 7 SP1 及以上（.NET Framework 4.8）
- 默认使用 PDFium 渲染 + Windows Print Spooler，并按驱动 PrintableArea 自动适配
- 零配置启动，开箱即用

## 架构原理

### 项目关系

```
EasyInk.Printer (WinExe, 完整应用)
├── 引用 EasyInk.Engine (DLL, 打印引擎)
├── 审计日志 (SQLite + Dapper)
├── HTTP/WebSocket 服务
└── WinForms UI

EasyInk.Engine (Library, 纯打印)
├── 打印机枚举/状态查询 (WMI)
├── PDFium 位图渲染 + Windows Print Spooler 打印
├── 打印队列管理
└── 日志通过事件回传调用方
```

```
┌──────────────────────────────────────────────────────────┐
│                    浏览器 (Vue 前端)                       │
│                     │  HTTP / WebSocket                    │
├─────────────────────┼────────────────────────────────────┤
│              EasyInk.Printer                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐               │
│  │ HttpServer│  │ WebSocket│  │ WinForms  │               │
│  │ (路由+API)│  │ (实时推送)│  │ (托盘+窗口)│              │
│  └─────┬────┘  └─────┬────┘  └───────────┘               │
│        └──────┬──────┘                                    │
│         ┌─────▼─────┐  ┌─────────────┐                    │
│         │ EngineApi  │  │ AuditService│                    │
│         │ (Engine)   │  │ (SQLite)    │                    │
│         └─────┬─────┘  └─────────────┘                    │
│        ┌──────┼──────┐                                    │
│  ┌─────▼──┐┌──▼──────┐                                   │
│  │Printer ││Pdfium   │                                   │
│  │Service ││Print    │                                   │
│  │(WMI)   ││Service│                                      │
│  └────────┘└──┬───┘                                       │
│               │  PrintableArea fit                           │
│         ┌─────▼─────┐                                     │
│         │Spooler   │                                     │
│         │  .exe     │                                     │
│         └───────────┘                                     │
└──────────────────────────────────────────────────────────┘
```

### 打印链路与兼容策略

EasyInk.Printer 调用 EasyInk.Engine 执行打印，当前默认链路是：

```
浏览器上传 PDF
  → EasyInk.Printer HTTP/WebSocket
  → EasyInk.Engine PdfiumPrintService
  → PdfiumViewer 渲染为位图
  → PrintDocument 按驱动 PrintableArea 等比适配
  → Windows Spooler / 打印机驱动
```

这条链路的通用原则：

- 普通打印机默认使用 Windows 打印机首选项里的纸张和方向。
- 请求默认不应设置 `ForcePaperSize=true`，除非明确知道要覆盖驱动纸张。
- 打印区域只使用驱动 `PrintableArea`，不在软件层额外缩进或缩放设计内容。
- 打印质量由 PDFium 位图渲染 DPI 决定，默认 600，并会参考驱动分辨率，上限 1200；对 360 DPI 及以下的小票/热敏类低分辨率设备，默认贴合驱动原生 DPI 渲染，减少 GDI/驱动下采样造成的模糊。

可配置 SumatraPDF fallback：

```
浏览器上传 PDF
  → EasyInk.Printer 写入临时 PDF
  → SumatraPDF.exe -silent -exit-on-print -print-to "PrinterName" -print-settings "fit"
  → Windows Spooler / 打印机驱动
```

适合场景：

- 默认链路在某些驱动上仍错位、裁切或模糊。
- 同一份 PDF 用 Chrome/浏览器打印表现正常。

接入约束：

- `fit` 会按驱动当前默认纸张的 printable area 缩放，纸张首选项必须正确。
- 打包产物内置 `SumatraPDF\SumatraPDF.exe`，设置页默认路径指向该文件。
- Win7 环境需要随包固定一个实测可用的 SumatraPDF portable 版本，不要自动追最新版。
- 该链路应做成按打印机配置的 fallback，不建议无条件替换默认链路。

配置方式：

- 在设置页确认 `SumatraPDF.exe` 路径，默认是程序目录下的 `SumatraPDF\SumatraPDF.exe`。
- 在路径设置中确认 PDF 临时目录，默认是 `%LocalAppData%\EasyInk.Printer\temp\sumatra`。
- 在“PDF兼容打印机 / PDF fallback printers”中填写需要走 SumatraPDF 的打印机名称片段，多个用逗号分隔。
- 打印参数默认 `fit`，超时默认 60 秒。
- 保存后重启服务生效。

### 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 运行时 | .NET Framework 4.8 | Win7 SP1 兼容 |
| 打印引擎 | EasyInk.Engine | 轻量 DLL，仅 Newtonsoft.Json 依赖 |
| HTTP 服务 | HttpListener | 内置，零依赖 |
| WebSocket | HttpListener + WebSocketContext | .NET 4.8 原生支持 |
| UI | WinForms | 系统托盘 + 桌面窗口 |
| 审计存储 | SQLite + Dapper | 仅在 Printer 应用中 |

## 项目结构

```
EasyInk.Net/
├── EasyInk.Engine/              # 打印引擎 DLL
│   ├── src/
│   │   ├── EasyInk.Engine.csproj
│   │   ├── EngineApi.cs          # 公共 API，日志通过事件回传
│   │   ├── Models/               # 数据模型
│   │   └── Services/             # 打印机/打印/队列服务
│   └── tests/
├── EasyInk.Printer/             # 完整应用
│   ├── src/
│   │   ├── EasyInk.Printer.csproj
│   │   ├── Program.cs            # 入口，单实例检查
│   │   ├── Server/               # HTTP/WebSocket 服务
│   │   ├── Api/                  # API 控制器
│   │   ├── UI/                   # WinForms 界面
│   │   ├── Config/               # 配置管理
│   │   ├── Services/             # 审计日志服务
│   │   └── Utils/                # 工具类
│   └── tests/
```

## HTTP API 设计

### 基础约定

- 基地址：`http://localhost:{port}/api/`
- 响应格式与 Engine 的 `PrinterResult` 一致：

```json
{
  "id": "请求ID",
  "success": true,
  "data": {},
  "errorInfo": null
}
```

### 接口列表

#### 打印机

| 方法 | 路径 | 说明 | 对应 Engine 命令 |
|------|------|------|--------------|
| GET | `/api/printers` | 获取打印机列表 | `getPrinters` |
| GET | `/api/printers/{name}/status` | 获取打印机状态 | `getPrinterStatus` |

#### 打印

| 方法 | 路径 | 说明 | 对应 Engine 命令 |
|------|------|------|--------------|
| POST | `/api/print` | 同步打印 | `print` |
| POST | `/api/print/async` | 异步打印 | `printAsync` |
| POST | `/api/print/batch` | 批量同步打印 | `batchPrint` |
| POST | `/api/print/batch/async` | 批量异步打印 | `batchPrintAsync` |

#### 任务

| 方法 | 路径 | 说明 | 对应 Engine 命令 |
|------|------|------|--------------|
| GET | `/api/jobs` | 获取所有任务 | - |
| GET | `/api/jobs/{id}` | 获取任务状态 | `getJobStatus` |

#### 日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/logs` | 查询审计日志（Printer 自行实现） |

#### 服务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 服务运行状态 |

### PDF 数据源支持

打印接口支持三种 PDF 输入方式：

| 格式 | HTTP 传输方式 | 说明 |
|------|--------------|------|
| `pdfBase64` | JSON body | Base64 编码的 PDF 字符串 |
| `pdfUrl` | JSON body | 远程 PDF URL 地址 |
| `pdfBytes` | multipart/form-data | 二进制 PDF 数据 |

### WebSocket

- 地址：`ws://localhost:{port}/ws`
- 支持双向通信：命令请求 + 状态推送

#### 文本帧（JSON 命令）

```json
{
  "command": "print",
  "id": "uuid",
  "params": {
    "printerName": "HP LaserJet",
    "pdfBase64": "JVBERi0xLjQK...",
    "copies": 1
  }
}
```

#### 二进制帧（blob PDF）

```
┌────────────────┬─────────────────┬─────────────────┐
│ 4 字节 (uint32) │ N 字节 (JSON)    │ 剩余 (PDF 二进制) │
│ 元数据长度 N     │ 元数据           │ PDF 数据         │
└────────────────┴─────────────────┴─────────────────┘
```

#### 支持的命令

| 命令 | 说明 |
|------|------|
| `print` | 同步打印 |
| `printAsync` | 异步打印 |
| `getPrinters` | 获取打印机列表 |
| `getPrinterStatus` | 获取打印机状态 |
| `getJobStatus` | 获取任务状态 |
| `getAllJobs` | 获取所有任务 |
| `queryLogs` | 查询审计日志 |

## 配置模型

```json
{
  "httpPort": 18080,
  "autoStart": false,
  "minimizeToTray": true,
  "dbPath": null,
  "corsOrigins": ["http://localhost:*"]
}
```

配置文件路径：`%APPDATA%/EasyInk.Printer/config.json`

## 构建与部署

### 构建

```bash
cd lib/EasyInk.Net
dotnet build EasyInk.Printer/src
```

### 本地打包

本地打包脚本位于 `EasyInk.Printer/` 根目录：

- `build-portable.bat`：生成便携包 zip
- `build-installer.bat`：生成 Inno Setup 安装包 exe

打包脚本会自动准备内置 SumatraPDF；也可以手动运行：

```powershell
cd lib\EasyInk.Net\EasyInk.Printer
powershell -ExecutionPolicy Bypass -File tools\download-sumatra.ps1
```

脚本会下载固定版本的 32-bit portable SumatraPDF 到 `src\SumatraPDF\SumatraPDF.exe`。发布和安装包构建会校验该文件是否存在，并把它复制到最终产物的 `SumatraPDF\SumatraPDF.exe`。

默认情况下，脚本使用 `EasyInk.Printer.csproj` 和 `EasyInk.Engine.csproj` 中的默认版本。传入第一个参数时，会把同一个版本注入到：

- `Version`
- `AssemblyVersion`
- `FileVersion`
- `InformationalVersion`
- installer 的 `AppVersion`

示例：

```bat
cd lib\EasyInk.Net\EasyInk.Printer

build-portable.bat 1.2.3
build-installer.bat 1.2.3-beta.1
```

版本规则：

- 传入 `1.2.3` 时，程序集和文件版本为 `1.2.3.0`。
- 传入 `1.2.3-beta.1` 时，展示版本保留完整值，程序集和文件版本会归一到 `1.2.3.0`。

打包输出位置：

- `output/EasyInkPrinter-Portable.zip`
- `output/EasyInkPrinter-Setup.exe`

注意：应用界面和 `/api/status` 显示的版本优先读取 `InformationalVersion`，因此本地手动打包时传入的版本字符串会直接显示给用户。

### 发布产物

```
publish/
├── EasyInk.Printer.exe          # 主程序
├── EasyInk.Engine.dll           # 打印引擎
├── Newtonsoft.Json.dll
├── Dapper.dll
├── System.Data.SQLite.dll
├── x64/
│   └── SQLite.Interop.dll
├── x86/
│   └── SQLite.Interop.dll
└── ...
```

### 部署要求

- Windows 7 SP1 及以上
- .NET Framework 4.8 运行时
- 安装目录需保留 `x64/SQLite.Interop.dll` 与 `x86/SQLite.Interop.dll`，否则审计日志模块会在启动时失败
- 无需额外安装，复制即用
