---
description: EasyInk Printer 快速上手：启动 Windows 本地服务，让浏览器端打出第一张单。
---

# 快速上手 {#getting-started}

这页只做一件事：让浏览器端通过 EasyInk Printer 打出第一张单。

## 检查本地服务 {#check-service}

启动 `EasyInk.Printer.exe` 后，先确认 HTTP 服务能响应：

```bash
curl http://localhost:18080/api/status
curl http://localhost:18080/api/printers
```

默认端口是 `18080`。如果这一步失败，先排查桌面应用、端口和系统打印机，不要急着改模板。

## 安装前端包 {#install}

安装 EasyInk Printer 集成包：

```bash
pnpm add @easyink/print-integration-easyink-printer
```

这个包同时封装了 HTTP 打印机列表、WebSocket 打印提交、PDF 分片上传和高层托管 Viewer。

## 打印第一张单 {#first-print}

先用默认 PDF 提交路径：

```ts
import { createEasyInkPrinter, createEasyInkPrinterClient } from '@easyink/print-integration-easyink-printer'

const client = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
})

const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
})

await client.useDefaultPrinter()

await printer.print({
  schema,
  data,
})
```

这段代码会在浏览器端创建托管 Viewer，把页面导出成 PDF Blob，再通过 WebSocket 分片上传给 `EasyInk.Printer`。默认会等待异步任务完成；如果只想提交任务，可以传 `waitForCompletion: false`。

## 指定打印参数 {#print-options}

打印机、份数、纸张策略和审计字段都可以跟着单次打印走：

```ts
await printer.print({
  schema,
  data,
  printerName: 'HP LaserJet',
  copies: 2,
  forcePageSize: true,
  requestOptions: {
    dpi: 600,
    userData: {
      userId: 'u-001',
      documentType: 'invoice',
    },
  },
})
```

`forcePageSize: true` 时，打印器会把 Viewer 解析出的模板尺寸作为 `paperSize` 传给服务端。默认不强制纸张，由打印机驱动使用当前介质。

## Printer-side Render {#printer-side-render}

如果你要让本地 Printer 服务调用 Render，而不是在浏览器端生成 PDF，可以打开 `renderSource` 提交模式：

```ts
const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
  submitMode: 'renderSource',
  resolveRequestOptions: () => ({
    renderOptions: {
      pdf: { printBackground: true },
      wait: { until: 'easyinkReady', timeoutMs: 5000 },
    },
  }),
})

await printer.print({ schema, data })
```

这条路径仍然会用托管 Viewer 统一打印入口，但提交给本地服务的是 `renderSource.type=easyink`。服务端必须启用并配置 Render，否则会返回 `RENDER_FAILED`。

## 直接打印 PDF {#print-pdf}

业务已经有 PDF 时，不需要再走 Viewer：

```ts
const client = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
})

const file = await fetch('/invoice.pdf').then(res => res.blob())

await client.printPdfAndWait(file, {
  printerName: 'HP LaserJet',
  copies: 1,
})
```

`printPdf()` 会把 PDF 按 1 MB 分片上传，再调用 `printUploadedPdfAsync`。服务端单片上限是 2 MB，总 PDF 上限是 50 MB。

## 直接打印 HTML 或 EasyInk {#print-render-source}

你也可以不创建高层打印器，直接走客户端 API：

```ts
const client = createEasyInkPrinterClient()
await client.useDefaultPrinter()

await client.printEasyInkAndWait(
  { schema, data },
  {
    renderOptions: {
      pdf: { printBackground: true },
      wait: { until: 'easyinkReady', timeoutMs: 5000 },
    },
  },
)
```

HTML 输入使用 `printHtmlAndWait()`：

```ts
await client.printHtmlAndWait(
  '<!doctype html><html><body><main class="easyink-ready">Hello</main></body></html>',
  {
    paperSize: { width: 80, height: 120, unit: 'mm' },
    renderOptions: {
      pdf: {
        printBackground: true,
        marginMm: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      wait: { selector: '.easyink-ready' },
    },
  },
)
```

这两条 API 都会提交 `renderSource`。不要在同一笔请求里再放 PDF 输入。

## API Key {#api-key}

如果 Printer 配置了 API Key，创建客户端时传入同一个值：

```ts
const client = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
  apiKey: 'your-secret-key',
})
```

集成包会自动处理 HTTP 的 `X-API-Key` 和 WebSocket URL 上的 `apiKey` 参数。

## 生命周期 {#lifecycle}

业务页面卸载时分开清理 Viewer 和连接：

```ts
printer.destroy()
client.disconnect()
```

`printer.destroy()` 清理托管 Viewer。`client.disconnect()` 关闭 WebSocket 并拒绝还没完成的请求。

## 最小验收 {#acceptance}

第一张单不要只看“代码没报错”。我们建议你确认这三件事：

1. `client.refreshPrinters()` 能拿到打印机。
2. `printer.print()` 返回前没有抛错。
3. EasyInk.Printer 任务列表里能看到任务，目标打印机真的输出纸张。

如果你还带了 `userData`，再打开日志页确认 `User` 和 `Document Type` 列值是否落库展示。
