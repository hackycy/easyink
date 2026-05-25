# EasyInk.Engine

`EasyInk.Engine` 是纯打印引擎层。它没有 UI，也不负责 HTTP 服务。你把它嵌进 .NET 宿主里，它就负责打印机查询、打印执行和任务队列这些能力。

## 先看入口

```csharp
using EasyInk.Engine;

using var api = new EngineApi();
```

这就是引擎最直接的使用方式。

## 你会最常用到哪些方法

```csharp
var printers = api.GetPrinters();
var status = api.GetPrinterStatus("HP LaserJet");
var job = api.GetJobStatus("job-id");
var jobs = api.GetAllJobs();
```

如果你只是在自有 .NET 应用里嵌打印能力，上面这组方法通常已经是第一批要接的接口。

## 统一命令入口也是真的存在

除了这些显式方法，`EngineApi` 还支持统一命令入口：

```csharp
var result = api.HandleCommand(new PrinterCommand
{
    Command = "print",
    Id = "req-1",
    Params = new Dictionary<string, object>
    {
        ["printerName"] = "HP LaserJet",
        ["pdfBase64"] = "...",
        ["copies"] = 2,
    },
});
```

当前命令入口至少覆盖这些动作：

- `getPrinters`
- `getPrinterStatus`
- `print`
- `printAsync`
- `getJobStatus`
- `getAllJobs`

这也是 Printer 桌面服务在内部继续复用 Engine 的原因。

## 事件是怎么给宿主用的

Engine 不负责持久化，但会把关键事件抛出来交给宿主处理。

先看日志：

```csharp
api.Log += (level, message) =>
{
    Console.WriteLine($"[{level}] {message}");
};

api.LogWithContext += (level, message, jobId) =>
{
    Console.WriteLine($"[{level}][{jobId}] {message}");
};
```

再看打印完成回调：

```csharp
api.PrintCompleted += (requestId, requestParams, result) =>
{
    Console.WriteLine($"打印完成: {requestId}, 成功: {result.Success}");
};
```

如果你要做审计、日志或业务事件转发，这里就是最自然的挂点。

## 打印请求里最关键的参数

第一次集成时，先盯住这几个字段就够了：

- `PrinterName`
- `PdfBase64` / `PdfUrl` / `PdfBytes`
- `Copies`
- `Dpi`
- `PaperSize`
- `ForcePaperSize`
- `UserData`

特别是 `ForcePaperSize`，不要一开始就默认开。很多连续纸和热敏机更适合先让驱动决定当前介质。

## 如果你要换底层实现

Engine 也允许你替换服务实现。

```csharp
public class MyPrintService : IPrintService
{
    public PrinterResult Print(string requestId, PrintRequestParams request, CancellationToken cancellationToken = default)
    {
        return PrinterResult.Ok(requestId, PrintResult.Success(requestId));
    }
}

using var api = new EngineApi(printService: new MyPrintService());
```

如果你已经有自己的打印执行层，而你又想复用 EasyInk 的外围协议和任务入口，这条扩展点就很有用。
