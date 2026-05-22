# EasyInk.Engine

EasyInk.Engine 是 EasyInk 的打印引擎类库，目标框架为 .NET Framework 4.8。它只处理打印链路，不包含 UI、HTTP 服务或持久化逻辑。

## 职责边界

- 打印机列表和状态查询。
- PDF 来源读取：Base64、URL、二进制。
- 同步打印和异步队列。
- 按打印机名称路由到 PDFium/GDI、SumatraPDF fallback 或 ESC/POS raw。
- 通过事件把日志和打印完成结果交给宿主处理。

## 核心结构

```
EngineApi
├── PrinterService             WMI 打印机查询
├── PrintJobQueue              异步打印队列
├── RoutingPrintService        按打印机名称选择打印路径
│   ├── PdfiumPrintService     默认 PDFium 位图渲染 + PrintDocument
│   ├── SumatraPdfPrintService 可选 SumatraPDF 命令行 fallback
│   └── EscPosRawPrintService  可选 ESC/POS raw 直发
└── IPdfProvider
    ├── Base64PdfProvider
    ├── BlobPdfProvider
    └── UrlPdfProvider
```

## EngineApi

```csharp
using var api = new EngineApi();

// 或注入服务、队列和路由配置
using var api = new EngineApi(
    printerService: null,
    printService: null,
    maxQueueSize: 100,
    rawPrinterNames: new[] { "thermal" },
    sumatraPdfPath: @"C:\EasyInk\SumatraPDF\SumatraPDF.exe",
    sumatraPrinterNames: new[] { "HP" });
```

常用方法：

| 方法 | 说明 |
|------|------|
| `GetPrinters()` | 获取打印机列表。 |
| `GetPrinterStatus(printerName)` | 获取打印机状态。 |
| `HandleCommand(json)` | JSON 命令入口。 |
| `HandleCommand(command)` | 对象命令入口，避免序列化往返。 |
| `GetJobStatus(jobId)` | 查询异步任务状态。 |
| `GetAllJobs()` | 获取队列中记录的任务。 |

所有直接入口返回 `PrinterResult`；`HandleCommand(string)` 会解析 JSON 后返回同一响应结构。

## 命令协议

`PrinterCommand` 字段：

| 字段 | 说明 |
|------|------|
| `command` | 命令名称。 |
| `id` | 请求 ID，原样带回响应。 |
| `params` | 命令参数。 |

支持命令：

| 命令 | 参数 | 说明 |
|------|------|------|
| `getPrinters` | - | 获取打印机列表。 |
| `getPrinterStatus` | `printerName` | 获取打印机状态。 |
| `print` | `PrintRequestParams` | 同步打印。 |
| `printAsync` | `PrintRequestParams` | 入队打印，返回 `jobId`。 |
| `getJobStatus` | `jobId` | 查询异步任务。 |
| `getAllJobs` | - | 获取所有任务记录。 |

## 打印参数

`PrintRequestParams`：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `printerName` | 必填 | 打印机名称。 |
| `pdfBase64` | - | Base64 PDF。 |
| `pdfUrl` | - | 远程 PDF URL，仅支持 http/https，会拦截 localhost、内网 IP 和重定向到内网的地址。 |
| `pdfBytes` | - | PDF 二进制。 |
| `copies` | `1` | 打印份数。 |
| `paperSize` | `null` | 纸张尺寸，单位支持 `mm` 或 `inch`。 |
| `forcePaperSize` | `false` | 是否强制把 `paperSize` 传给底层打印设置。 |
| `dpi` | `600` | PDFium/GDI 渲染 DPI。 |
| `offset` | `null` | 打印偏移，单位支持 `mm` 或 `inch`。 |
| `landscape` | `false` | 是否横向。 |
| `userData` | `null` | 宿主审计用数据。 |

三种 PDF 来源互斥，必须提供其中一种。

`pdfUrl` 下载超时为 30 秒，单个 PDF 上限为 50MB。

## 打印路径

### PDFium/GDI 默认路径

- 使用 PdfiumViewer 渲染 PDF，再通过 `PrintDocument` 输出到 Windows Spooler。
- 默认不强制纸张，按驱动当前默认纸张和 `PrintableArea` 等比适配。
- 适合普通办公打印机和大多数 PDF 打印场景。

### SumatraPDF fallback

- 仅当传入 `sumatraPdfPath` 且 `sumatraPrinterNames` 非空时启用。
- 打印机名称包含任一 `sumatraPrinterNames` 片段时命中，大小写不敏感。
- 默认参数为 `fit`，默认超时 60 秒。
- 适合默认路径受某些驱动影响而错位、裁切或模糊的打印机。

### ESC/POS raw

- 打印机名称包含任一 `rawPrinterNames` 片段时启用，大小写不敏感。
- 将 PDF 渲染为光栅位图后生成 ESC/POS `GS v 0` 指令，通过 `WritePrinter` 直发。
- 默认 `rawPrintDpi=203`、`rawPrintMaxDotsWidth=576`，适合 80mm 热敏小票打印机。

## 响应模型

```json
{
  "id": "request-id",
  "success": true,
  "data": {},
  "errorInfo": null
}
```

常见状态与错误：

| 类型 | 值 |
|------|----|
| `JobStatus` | `Queued`、`Printing`、`Completed`、`Failed` |
| `PrinterStatusCode` | `READY`、`PRINTER_OFFLINE`、`PAPER_JAM`、`PAPER_OUT`、`PRINTER_STOPPED`、`PRINTER_ERROR`、`PRINTER_NOT_FOUND`、`WMI_UNAVAILABLE` |
| `ErrorCode` | `INVALID_PARAMS`、`INVALID_JSON`、`UNKNOWN_COMMAND`、`JOB_NOT_FOUND`、`QUEUE_FULL`、`PRINT_FAILED`、`PRINT_TIMEOUT`、`INVALID_PDF_SOURCE`、`UNAUTHORIZED`、`NOT_FOUND` 等 |

## 事件

```csharp
api.Log += (level, message) => { };
api.LogWithContext += (level, message, jobId) => { };
api.PrintCompleted += (requestId, request, result) => { };
```

Engine 不写数据库、不持久化日志，宿主自行处理这些事件。

## 依赖

| 依赖 | 用途 |
|------|------|
| Newtonsoft.Json | JSON 命令和模型序列化。 |
| PdfiumViewer + native pdfium | PDF 渲染。 |
| System.Drawing | 位图处理和 GDI 打印。 |
| System.Management | WMI 打印机查询。 |

## 构建

```bash
cd lib/EasyInk.Net
dotnet build EasyInk.Engine/src
dotnet test EasyInk.Engine/tests
```
