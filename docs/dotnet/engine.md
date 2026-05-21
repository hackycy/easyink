# EasyInk.Engine

EasyInk.Engine 是纯打印引擎 DLL，仅负责打印链路，不包含 UI、HTTP 服务或持久化逻辑。适合嵌入到自有 .NET 应用中。

## 设计原则

- **无 UI 依赖**：不引用 WinForms/WPF，可嵌入任何宿主
- **无持久化**：日志和打印完成通知通过实例事件回传，由宿主决定存储方式
- **策略模式**：PDF 来源（Base64 / URL / Binary）通过 `IPdfProvider` 抽象，可扩展
- **接口驱动**：`IPrinterService` 和 `IPrintService` 可替换默认实现

## 架构

```
EngineApi (公共入口)
├── IPrinterService              ← 打印机枚举/状态查询
│   └── PrinterService           ← 默认实现：WMI 查询
├── IPrintService                ← 打印执行
│   └── RoutingPrintService      ← 路由层：按打印机名分发到不同实现
│       ├── PdfiumPrintService   ← GDI 路径：Pdfium 渲染 + Win32 GDI 打印
│       ├── EscPosRawPrintService← Raw 路径：位图转 ESC/POS 直发
│       └── SumatraPdfPrintService← SumatraPDF 路径：外部 PDF 引擎打印
├── PrintJobQueue                ← 异步队列（BlockingCollection + 后台线程）
├── NativePrintApi               ← Win32 GDI 底层打印 API
└── IPdfProvider                 ← PDF 数据源策略
    ├── Base64PdfProvider
    ├── BlobPdfProvider
    └── UrlPdfProvider           ← 含 SSRF 防护（屏蔽私有 IP）
```

## 引入方式

### 方式一：构建源码

```bash
cd lib/EasyInk.Net
dotnet build EasyInk.Engine/src
```

产物在 `EasyInk.Engine/src/bin/Debug/net48/EasyInk.Engine.dll`。

### 方式二：使用 CI 产物

从 GitHub Actions 的 `build-easyink-dotnet.yml` workflow 下载 `easyink-engine-sdk-*` zip，解压后引用 `EasyInk.Engine.dll`。

## 基本用法

```csharp
using EasyInk.Engine;

// 创建引擎（默认使用 Pdfium + Windows Print Spooler）
using var api = new EngineApi();

// 构造函数完整签名：
// EngineApi(
//     IPrinterService? printerService = null,        // 打印机服务（null = WMI 默认）
//     IPrintService? printService = null,            // 打印服务（null = RoutingPrintService）
//     int? maxQueueSize = null,                      // 异步队列上限（null = 100）
//     IEnumerable<string>? rawPrinterNames = null,   // 使用 ESC/POS raw 直发的打印机名列表
//     int rawPrintDpi = 203,                         // Raw 打印 DPI
//     int rawPrintMaxDotsWidth = 576,                // Raw 打印最大宽度（点数）
//     string? sumatraPdfPath = null,                 // SumatraPDF.exe 路径
//     IEnumerable<string>? sumatraPrinterNames = null,// 使用 SumatraPDF 的打印机名列表
//     string? sumatraPrintSettings = null,           // SumatraPDF -print-settings 参数
//     int sumatraTimeoutSeconds = 60,                // SumatraPDF 超时（秒）
//     LowDpiPrintEnhancementMode lowDpiPrintEnhancementMode = LowDpiPrintEnhancementMode.Boost,
//     string? sumatraTempDir = null                  // SumatraPDF 临时目录
// )
```

## 核心 API

### 列出打印机

```csharp
PrinterResult result = api.GetPrinters();
```

### 获取打印机状态

```csharp
PrinterResult result = api.GetPrinterStatus("HP LaserJet");
```

### 查询任务

```csharp
PrinterResult result = api.GetJobStatus("jobId");
PrinterResult all = api.GetAllJobs();
```

### 命令协议（统一入口）

EngineApi 通过 `HandleCommand` 统一处理所有打印操作：

```csharp
// 同步打印
PrinterResult result = api.HandleCommand(new PrinterCommand {
    Command = "print",
    Id = "req-1",
    Params = new Dictionary<string, object> {
        ["printerName"] = "HP LaserJet",
        ["pdfBase64"] = "...",
        ["copies"] = 2
    }
});

// 也可以通过 JSON 字符串调用
PrinterResult result = api.HandleCommand(jsonString);
```

支持的命令：

| 命令 | 参数 | 说明 |
|------|------|------|
| `getPrinters` | - | 获取打印机列表 |
| `getPrinterStatus` | `printerName` | 获取打印机状态 |
| `print` | `printerName`, `pdfBase64`/`pdfUrl`/`pdfBytes`, `copies`?, `landscape`?, `dpi`?, `paperSize`?, `forcePaperSize`?, `offset`?, `userData`? | 同步打印 |
| `printAsync` | 同上 | 异步打印，立即返回 jobId |
| `getJobStatus` | `jobId` | 查询任务状态 |
| `getAllJobs` | - | 获取所有任务 |
| `batchPrint` | `jobs[]` | 批量同步打印 |
| `batchPrintAsync` | `jobs[]` | 批量异步打印 |

## 方法一览

| 方法 | 说明 |
|------|------|
| `GetPrinters()` | 获取打印机列表 |
| `GetPrinterStatus(printerName)` | 获取打印机状态 |
| `GetJobStatus(jobId)` | 查询任务状态 |
| `GetAllJobs()` | 获取所有任务 |
| `HandleCommand(string json)` | JSON 命令入口 |
| `HandleCommand(PrinterCommand command)` | 命令入口（对象），避免序列化往返 |
| `Dispose()` | 释放资源（停止队列） |

## 事件

### 日志订阅

```csharp
// 基础日志
api.Log += (level, message) =>
{
    Console.WriteLine($"[{level}] {message}");
};

// 带任务上下文的日志（jobId 可能为 null）
api.LogWithContext += (level, message, jobId) =>
{
    Console.WriteLine($"[{level}][{jobId}] {message}");
};
```

`LogLevel` 枚举：`Info` / `Error`

### 打印完成回调

```csharp
api.PrintCompleted += (requestId, requestParams, result) =>
{
    // requestId:   请求 ID
    // requestParams: 原始打印请求参数
    // result:       打印结果（Success + Data 或 ErrorInfo）
    Console.WriteLine($"打印完成: {requestId}, 成功: {result.Success}");
};
```

宿主应用通过 `PrintCompleted` 实现审计日志持久化，无需修改引擎代码。

## 数据模型

### PrintRequestParams

| 属性 | 类型 | 说明 |
|------|------|------|
| PrinterName | string | 打印机名称（必填） |
| PdfBase64 | string? | Base64 编码的 PDF |
| PdfUrl | string? | 远程 PDF URL |
| PdfBytes | byte[]? | 二进制 PDF |
| Copies | int | 份数，默认 1 |
| Landscape | bool | 横向打印，默认 false |
| Dpi | int | 分辨率，默认 600 |
| PaperSize | PaperSizeParams? | PDF/模板纸张尺寸 `{ Width, Height, Unit }` |
| ForcePaperSize | bool | 是否强制把 PaperSize 下发为驱动纸张参数，默认 false |
| Offset | OffsetParams? | 打印偏移 `{ X, Y }` |
| UserData | UserDataParams? | 用户数据（用于审计日志）`{ UserId, DocumentType }` |

热敏小票机、连续纸建议保持 `ForcePaperSize=false`，让驱动使用当前介质。只有设备驱动不收到自定义尺寸会回退到 A4 时，才设为 `true`。

三种 PDF 来源互斥，只能提供其一。`CreatePdfProvider()` 按 Base64 > URL > Bytes 优先级选择。

### PrinterResult

```csharp
{
    Id: string,          // 请求 ID
    Success: bool,       // 是否成功
    Data: object,        // 返回数据
    ErrorInfo: { Code: string, Message: string }  // 错误信息
}
```

### JobStatus

`Queued` / `Printing` / `Completed` / `Failed`

### PrinterStatusCode

`Ready` / `PrinterOffline` / `PaperJam` / `PaperOut` / `PrinterStopped` / `PrinterError` / `PrinterNotFound` / `WmiUnavailable`

## 扩展点

### 自定义打印服务

实现 `IPrintService` 接口可替换默认打印实现：

```csharp
public class MyPrintService : IPrintService
{
    public PrinterResult Print(string requestId, PrintRequestParams request,
        CancellationToken cancellationToken = default)
    {
        // 自定义打印逻辑
        return PrinterResult.Ok(requestId, PrintResult.Success(requestId));
    }
}

using var api = new EngineApi(printService: new MyPrintService());
```

### 自定义打印机服务

实现 `IPrinterService` 接口可替换 WMI 查询，例如对接远程打印机管理。

## 依赖

| 包 | 说明 |
|----|------|
| Newtonsoft.Json | JSON 序列化 |
| PdfiumViewer | PDF 渲染（Chromium 同款 PDF 引擎） |
| System.Drawing | 图像处理 / 打印输出 |
| System.Management | WMI 查询（打印机状态） |
