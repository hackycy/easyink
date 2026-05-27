---
description: EasyInk.Printer Windows 桌面打印服务：HTTP/WebSocket、本地管理界面、审计日志、配置和 Printer-side Render。
---

# EasyInk.Printer {#printer}

`EasyInk.Printer` 是 Windows 桌面打印服务。浏览器通常通过它访问本地打印机。

先看一个 HTTP 验证：

```bash
curl http://localhost:18080/api/status
curl http://localhost:18080/api/printers
```

如果这两条能返回 JSON，说明本地服务和打印机查询入口已经通了。

## 应用组成 {#parts}

应用内部大致是这样：

```text
HTTP / WebSocket
  -> PrintController / WebSocketCommandHandler
  -> EngineApi
  -> Windows 打印通道
```

当前实现包含：

- HTTP 服务，默认端口 `18080`。
- WebSocket 命令通道，默认最大连接数 `100`，小于 `10` 的配置会自动提升到 `10`。
- WinForms 管理界面和系统托盘。
- SQLite 审计日志；初始化失败时退化为 `NullAuditService`。
- 可选 Printer-side Render，调用本机 `easyink-render.exe render`。

## 管理界面检查 {#ui-checks}

前端说“连不上”时，先别急着看模板。先在桌面管理界面检查：

```text
服务状态 -> 端口 -> WebSocket 连接数 -> 打印队列 -> 日志
```

这能把连接问题、设备问题和模板问题拆开。尤其是打印队列和日志页，能直接看到任务有没有进入本地服务。

## 常用配置 {#config}

配置文件在 `%APPDATA%\EasyInk.Printer\config.json`。应用保存时使用 `HostConfig` 的 PascalCase 字段名。

```json
{
  "HttpPort": 18080,
  "TrustAllOrigins": false,
  "ApiKey": null,
  "MaxWebSocketConnections": 100,
  "MaxQueueSize": 100,
  "PrintTimeoutSeconds": 30,
  "RenderEnabled": false
}
```

常用字段按职责分几组看：

- 服务入口：`HttpPort`、`TrustAllOrigins`、`ApiKey`。
- 队列和并发：`MaxWebSocketConnections`、`MaxQueueSize`、`MaxConcurrentRequests`、`PrintTimeoutSeconds`。
- 日志和审计：`DbPath`、`CrashLogDir`、`PrintDebugLoggingEnabled`、`AuditLogRetentionDays`、`FileLogRetentionDays`。
- 打印路径：`RawPrinterNames`、`RawPrintDpi`、`RawPrintMaxDotsWidth`、`SumatraPdfPath`、`SumatraPrinterNames`、`SumatraPrintSettings`、`SumatraTimeoutSeconds`。
- Render：`RenderEnabled`、`RenderHostPath`、`RenderBrowserKind`、`RenderBrowserExecutablePath`、`RenderBrowserHeadlessMode`、`RenderBrowserDir`、`RenderRequestTimeoutMs`、`RenderIdleTimeoutMs`、`RenderMaxConcurrency`、`RenderMaxQueueSize`。

如果你刚开始部署，先盯住端口、认证、队列和目标打印路径。Render、Raw、Sumatra 都可以第二阶段再打开。

## API Key {#api-key}

设置了 `ApiKey` 后，HTTP 请求必须带 `X-API-Key`：

```bash
curl -H "X-API-Key: your-secret-key" http://localhost:18080/api/printers
```

WebSocket 连接要把同一个值放到查询参数：

```text
ws://localhost:18080/ws?apiKey=your-secret-key
```

官方前端集成包会自动处理这两处。你只有手写协议时才需要自己拼。

## CORS 边界 {#cors}

默认情况下，Printer 只会给本机来源返回 CORS 允许头。

```json
{
  "TrustAllOrigins": false
}
```

如果你把 `TrustAllOrigins` 改成 `true`，服务会返回 `Access-Control-Allow-Origin: *`。这适合受控内网调试，不适合没有认证的公开网络。

## Printer-side Render {#render}

启用 Render 后，Printer 可以接收 `renderSource`：

```json
{
  "printerName": "HP LaserJet",
  "renderSource": {
    "type": "html",
    "html": "<!doctype html><html><body><main class=\"ready\">Hello</main></body></html>"
  },
  "renderOptions": {
    "wait": { "selector": ".ready", "timeoutMs": 5000 },
    "pdf": { "printBackground": true }
  }
}
```

Printer 会把这类请求写成 Render request，调用 `easyink-render.exe render --json --diagnostics-out ...`，拿到 PDF bytes 后再交给 Engine 的物理打印路径。

:::warning 注意
`RenderEnabled=false` 时，`renderSource` 请求会返回 `RENDER_FAILED`。纯 PDF 请求不依赖 Render。
:::

## 打印路径配置 {#print-paths}

Raw 和 Sumatra 都是按打印机名称片段匹配，大小写不敏感。

```json
{
  "RawPrinterNames": ["XP-80"],
  "SumatraPrinterNames": ["HP LaserJet"],
  "SumatraPrintSettings": "fit"
}
```

命中顺序来自 Engine：先 SumatraPDF fallback，再 ESC/POS raw，最后默认 PDFium/GDI。不要把同一台打印机同时放进两个列表，除非你明确知道想让 Sumatra 优先。

关于 Printer 应用，目前知道这些就够用了。接口细节继续看 [API 参考](/dotnet/api-reference)。
