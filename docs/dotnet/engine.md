---
description: EasyInk.Engine 纯打印引擎：无 UI 的 .NET Framework 4.8 类库，负责打印机查询、打印执行、队列和打印路径路由。
---

# EasyInk.Engine {#engine}

`EasyInk.Engine` 是纯打印引擎。它没有 UI，也不提供 HTTP 服务。

最小用法是：

```csharp
using EasyInk.Engine;

using var api = new EngineApi();

var printers = api.GetPrinters();
```

这段代码会使用默认实现：打印机查询走 WMI / `PrinterSettings`，PDF 打印走 PDFium/GDI，异步任务走内部 `PrintJobQueue`。

## 常用方法 {#methods}

Engine 的直接方法都返回 `PrinterResult`：

```csharp
var printers = api.GetPrinters();
var status = api.GetPrinterStatus("HP LaserJet");
var job = api.GetJobStatus("job-id");
var jobs = api.GetAllJobs();
```

如果你只是在自己的 .NET 应用里嵌打印能力，上面这组通常是第一批要接的接口。

## 同步和异步打印 {#print}

统一命令入口使用 `PrinterCommand`：

```csharp
using EasyInk.Engine.Models;

var result = api.HandleCommand(new PrinterCommand
{
    Command = "printAsync",
    Id = "req-1",
    Params = new Dictionary<string, object>
    {
        ["printerName"] = "HP LaserJet",
        ["pdfBase64"] = "JVBERi0xLjQK...",
        ["copies"] = 2,
    },
});
```

当前 `EngineApi.HandleCommand()` 支持这些命令：

- `getPrinters`
- `getPrinterStatus`
- `print`
- `printAsync`
- `getJobStatus`
- `getAllJobs`
- `testPrinter`

`print` 会同步调用打印服务。`printAsync` 会进入 `PrintJobQueue`，返回 `jobId`。

## 打印参数 {#print-params}

`PrintRequestParams` 的核心字段是：

```json
{
  "printerName": "HP LaserJet",
  "pdfBase64": "JVBERi0xLjQK...",
  "copies": 1,
  "dpi": 600,
  "forcePaperSize": false
}
```

常用字段：

- `printerName`：目标打印机名称。
- `pdfBase64` / `pdfUrl` / `pdfBytes`：三种 PDF 输入。
- `renderSource`：HTML 或 EasyInk schema + data 输入，需要 Engine 构造时注入 `IRenderPdfService`。
- `renderOptions`：Render 的 `pdf`、`wait`、`security`、`diagnostics` 选项。
- `copies`：默认 `1`。
- `dpi`：默认 `600`。
- `paperSize`：单位支持 `mm` 或 `inch`。
- `forcePaperSize`：默认 `false`。
- `offset`、`landscape`、`userData`：偏移、横向和宿主审计数据。

:::warning 注意
PDF 输入和 `renderSource` 互斥。都不传或同时传，Engine 会返回 `INVALID_PARAMS`。
:::

## 打印路径 {#paths}

默认构造函数会创建路由打印服务：

```csharp
using var api = new EngineApi(
    rawPrinterNames: new[] { "XP-80" },
    sumatraPdfPath: @"C:\EasyInk\SumatraPDF\SumatraPDF.exe",
    sumatraPrinterNames: new[] { "HP LaserJet" });
```

路由优先级是：

```text
SumatraPDF fallback -> ESC/POS raw -> PDFium/GDI
```

- `sumatraPrinterNames` 命中且 `sumatraPdfPath` 可用时，走 SumatraPDF CLI。
- `rawPrinterNames` 命中时，走 ESC/POS raw 直发。
- 其他打印机走默认 PDFium/GDI。

名称匹配是大小写不敏感的包含匹配。

## Render 支持 {#render}

Engine 本身不启动 Render。只有构造时传入 `IRenderPdfService`，它才会把 `renderSource` 转成 PDF：

```csharp
using var api = new EngineApi(
    renderPdfService: myRenderPdfService);
```

在 `EasyInk.Printer` 应用里，这个服务由 Printer 负责实现：它会调用本机 `easyink-render.exe render`，成功后把 PDF bytes 交回 Engine。

如果没有注入 `IRenderPdfService`，带 `renderSource` 的打印请求会返回 `RENDER_FAILED`。

## 事件 {#events}

Engine 不写数据库。日志、审计和业务事件都交给宿主处理：

```csharp
api.Log += (level, message) =>
{
    Console.WriteLine($"[{level}] {message}");
};

api.LogWithContext += (level, message, jobId) =>
{
    Console.WriteLine($"[{level}][{jobId}] {message}");
};

api.PrintCompleted += (requestId, request, result) =>
{
    Console.WriteLine($"打印完成: {requestId}, 成功: {result.Success}");
};
```

如果你要做审计落库或状态转发，就挂在这些事件上。

## 替换实现 {#replace-services}

你可以替换底层打印服务：

```csharp
using EasyInk.Engine.Models;
using EasyInk.Engine.Services.Abstractions;

public class MyPrintService : IPrintService
{
    public PrinterResult Print(
        string requestId,
        PrintRequestParams request,
        CancellationToken cancellationToken = default)
    {
        return PrinterResult.Ok(requestId, PrintResult.Success(requestId));
    }
}

using var api = new EngineApi(printService: new MyPrintService());
```

这适合你已经有自己的打印执行层，只想复用 EasyInk 的命令、队列和模型。
