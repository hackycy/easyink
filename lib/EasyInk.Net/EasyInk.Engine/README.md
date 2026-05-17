# EasyInk.Engine

EasyInk 的打印引擎，纯 .NET 类库（DLL），仅负责打印链路，不包含 UI、HTTP 服务或持久化逻辑。

## 设计原则

- **无 UI 依赖**：不引用 WinForms/WPF，可嵌入任何宿主
- **无持久化**：日志通过静态事件 `EngineApi.Log` 回传，由宿主决定存储方式
- **策略模式**：PDF 来源（Base64/URL/Binary）通过 `IPdfProvider` 抽象，可扩展
- **接口驱动**：`IPrinterService` 和 `IPrintService` 可替换默认实现

## 架构

```
EngineApi (公共入口)
├── IPrinterService          ← 打印机枚举/状态查询
│   └── PrinterService       ← 默认实现：WMI 查询
├── IPrintService            ← 打印执行
│   └── PdfiumPrintService   ← 默认实现：Pdfium 位图渲染 + Windows Print Spooler
├── PrintJobQueue            ← 异步队列（BlockingCollection + 后台线程）
└── IPdfProvider             ← PDF 数据源策略
    ├── Base64PdfProvider
    ├── BlobPdfProvider
    └── UrlPdfProvider       ← 含 SSRF 防护（屏蔽私有 IP）
```

## 公共 API

### EngineApi

```csharp
// 使用默认实现（WMI + Pdfium/Spooler）
using var api = new EngineApi();

// 或注入自定义实现
using var api = new EngineApi(printerService, printService);
```

#### 方法一览

| 方法 | 说明 |
|------|------|
| `GetPrinters()` | 获取打印机列表 |
| `GetPrinterStatus(printerName)` | 获取打印机状态 |
| `Print(printerName, pdfBase64?, pdfUrl?, pdfBytes?, ...)` | 同步打印 |
| `EnqueuePrint(printerName, pdfBase64?, pdfUrl?, pdfBytes?, ...)` | 入队打印（立即返回 jobId） |
| `BatchPrint(jobsJson)` | 批量同步打印 |
| `EnqueueBatchPrint(jobsJson)` | 批量入队打印 |
| `GetJobStatus(jobId)` | 查询任务状态 |
| `GetAllJobs()` | 获取所有任务 |
| `HandleCommand(json)` | JSON 命令入口（字符串） |
| `HandleCommand(command)` | 命令入口（对象，避免序列化往返） |

所有方法返回 JSON 字符串（`HandleCommand(PrinterCommand)` 返回 `PrinterResult` 对象）。

### 命令协议

`HandleCommand` 接收 `PrinterCommand`，支持以下命令：

| 命令 | 参数 | 说明 |
|------|------|------|
| `getPrinters` | - | 获取打印机列表 |
| `getPrinterStatus` | `printerName` | 获取打印机状态 |
| `print` | `printerName`, `pdfBase64`/`pdfUrl`/`pdfBytes`, `copies`? | 同步打印 |
| `printAsync` | 同上 | 异步打印 |
| `getJobStatus` | `jobId` | 查询任务 |
| `getAllJobs` | - | 所有任务 |
| `batchPrint` | `jobs[]` | 批量同步 |
| `batchPrintAsync` | `jobs[]` | 批量异步 |

## 数据模型

### PrinterResult

统一响应格式：

```csharp
{
    Id: string,
    Success: bool,
    Data: object,
    ErrorInfo: { Code: string, Message: string }
}
```

### PrintRequestParams

| 属性 | 类型 | 说明 |
|------|------|------|
| PrinterName | string | 打印机名称 |
| PdfBase64 | string | Base64 编码的 PDF |
| PdfUrl | string | 远程 PDF URL |
| PdfBytes | byte[] | 二进制 PDF |
| Copies | int | 份数，默认 1 |
| Landscape | bool | 横向打印 |
| Dpi | int | 渲染分辨率，默认 600 |
| PaperSize | PaperSizeParams | PDF/模板纸张尺寸 |
| ForcePaperSize | bool | 是否强制把 PaperSize 下发为驱动纸张参数，默认 false |
| Offset | OffsetParams | 打印偏移 |
| UserData | UserDataParams | 自定义数据（用户ID、标签类型） |

三种 PDF 来源互斥，只能提供其一。

## 打印适配策略

### 默认 PDFium/Spooler 链路

当前默认链路是：

```
PDF → PdfiumViewer 渲染为位图 → PrintDocument → Windows Spooler → 打印机驱动
```

该链路的目标是兼容 Win7 SP1，并尽量接近 Chrome 打印时的自动适配行为：

- 默认不强制自定义纸张。`ForcePaperSize=false` 时，驱动使用打印机当前默认纸张。
- 每页打印时读取 `PageSettings.PrintableArea`，把 PDF 内容等比缩放并居中到驱动报告的可打印区域内。
- 渲染 DPI 默认 600，并参考驱动 `PrinterResolution`，最高限制到 1200；对 360 DPI 及以下的小票/热敏类低分辨率设备，默认贴合驱动原生 DPI 渲染，避免 600 DPI 位图再被 GDI/驱动下采样导致文字变软。

不要为了修复某一台打印机的问题，把 `ForcePaperSize` 改成全局默认值。优先确认该打印机的 Windows 默认纸张、方向和驱动设置是否正确。

### SumatraPDF fallback 链路

对于默认链路仍然偏移、裁切或模糊，而 Chrome/浏览器打印正常的打印机，可按打印机配置外部 PDF 打印 fallback：

```bat
SumatraPDF.exe -silent -exit-on-print -print-to "PrinterName" -print-settings "fit" "file.pdf"
```

`fit` 由 SumatraPDF 负责将 PDF 页面缩放到驱动当前纸张的 printable area 内。该链路已作为 `SumatraPdfPrintService` 接入，并由 `RoutingPrintService` 按打印机名称选择。

启用所需配置：

- `sumatraPdfPath`：`SumatraPDF.exe` 的绝对路径；EasyInk.Printer 默认指向程序目录下的 `SumatraPDF\SumatraPDF.exe`。
- `sumatraPrinterNames`：走 SumatraPDF 的打印机名称片段列表，大小写不敏感、模糊匹配。
- `sumatraPrintSettings`：默认 `fit`。
- `sumatraTimeoutSeconds`：默认 60。
- `sumatraTempDir`：写入 SumatraPDF 命令行打印临时 PDF 的目录；EasyInk.Printer 默认使用 `%LocalAppData%\EasyInk.Printer\temp\sumatra`。

注意事项：

- SumatraPDF 依赖 Windows 打印机首选项中的默认纸张；纸张设错时，fit 也会按错误纸张计算。
- Win7 需要固定一个经过实测的 portable 版本随包分发。
- 它适合普通 PDF/办公打印机 fallback，不替代 ESC/POS、ZPL、TSPL 等原生命令打印。

### PrinterStatus

| 属性 | 说明 |
|------|------|
| IsReady | 是否就绪 |
| StatusCode | 状态码（`READY`/`PRINTER_OFFLINE`/`PAPER_JAM` 等） |
| Message | 人类可读描述 |
| IsOnline | 是否在线 |
| HasPaper | 是否有纸 |

## 常量定义

| 类 | 常量 | 用途 |
|----|------|------|
| `JobStatus` | `Queued`, `Printing`, `Completed`, `Failed` | 任务状态 |
| `PrinterStatusCode` | `Ready`, `PrinterOffline`, `PaperJam`, `PaperOut`, `PrinterStopped`, `PrinterError`, `PrinterNotFound` | 打印机状态码 |
| `ErrorCode` | `InvalidParams`, `InvalidJson`, `UnknownCommand`, `JobNotFound`, `QueueFull`, `PrintFailed`, `PrintTimeout`, `InvalidPdfSource`, `Unauthorized`, `NotFound` 等 | 错误码 |

## 日志订阅

```csharp
EngineApi.Log += (level, message) =>
{
    // level: LogLevel.Info / LogLevel.Error
    Console.WriteLine($"[{level}] {message}");
};
```

## 扩展点

### 自定义打印服务

实现 `IPrintService` 接口可替换默认实现：

```csharp
public class MyPrintService : IPrintService
{
    public PrinterResult Print(string requestId, PrintRequestParams request)
    {
        // 自定义打印逻辑
        return PrinterResult.Ok(requestId, PrintResult.Success(requestId));
    }
}

using var api = new EngineApi(printService: new MyPrintService());
```

### 自定义打印机服务

实现 `IPrinterService` 接口可替换 WMI 查询（例如远程打印机管理）。

## 依赖

| 包 | 说明 |
|----|------|
| Newtonsoft.Json | JSON 序列化 |
| PdfiumViewer | PDF 渲染（Chromium 同款 PDF 引擎） |
| System.Drawing | 图像处理 / 打印输出 |
| System.Management | WMI 查询（打印机状态） |

## 构建

```bash
cd lib/EasyInk.Net
dotnet build EasyInk.Engine/src
dotnet test EasyInk.Engine/tests
```
