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
import { registerBuiltinViewerMaterials } from '@easyink/builtin/all'
import { createEasyInkPrinter } from '@easyink/print-integration-easyink-printer'

const printer = createEasyInkPrinter({
  serviceUrl: 'http://localhost:18080',
  viewer: 'iframe',
  setupViewer(viewer) {
    registerBuiltinViewerMaterials((type, binding, extension) => {
      viewer.registerMaterial(type, binding, extension)
    })
  },
})

await printer.ready()

await printer.print({
  schema,
  data,
})
```

这段代码会在浏览器端创建托管 Viewer，把页面导出成 PDF Blob，再通过 WebSocket 分片上传给 `EasyInk.Printer`。默认会等待异步任务完成；如果只想提交任务，可以传 `waitForCompletion: false`。

如果你想先做预检，`printer.ready()` 可以提前确认服务可连、打印机可见；如果你已经有别的连接检查流程，也可以直接调用 `printer.print()`。

## 指定打印参数 {#print-options}

打印机、份数、纸张策略和审计字段都可以跟着单次打印走：

```ts
await printer.print({
  schema,
  data,
  printerName: 'HP LaserJet',
  copies: 2,
  paper: 'template',
  userData: {
    userId: 'u-001',
    documentType: 'invoice',
  },
})
```

`paper: 'template'` 表示按模板尺寸下发纸张；`paper: 'driver'` 表示使用打印机驱动当前介质。

## Printer-side Render {#printer-side-render}

如果你要让本地 Printer 服务调用 Render，而不是在浏览器端生成 PDF，可以选择 `printer-template` 策略：

```ts
await printer.print({
  schema,
  data,
  strategy: 'printer-template',
})
```

这条路径提交的是模板和数据，等待条件、背景打印等 Render 细节由 SDK 设置。服务端必须启用并配置 Render，否则会返回 `RENDER_FAILED`。

连续纸模板也适合这条路径。Printer-side Render 会让内嵌 Viewer 先算出实际输出高度，再生成 PDF。

如果你想打印的是当前预览结果，而不是重新生成 PDF，可以改用 `preview-html` 策略：

```ts
await printer.print({
  schema,
  data,
  strategy: 'preview-html',
  paper: 'template',
})
```

这条路径会把托管 Viewer 当前渲染出的页面序列化成 HTML，再交给 Printer 去打印。它适合你想保留预览效果、但不想直接操作底层 Render 协议的时候。
SDK 会让 Render 尊重序列化 HTML 里的 `@page`，所以固定页和连续纸都会按预览尺寸生成 PDF。

## 直接打印 PDF {#print-pdf}

业务已经有 PDF 时，不需要再走 Viewer：

```ts
const file = await fetch('/invoice.pdf').then(res => res.blob())

await printer.printPdf({
  pdf: file,
  printerName: 'HP LaserJet',
  copies: 1,
})
```

SDK 会把 PDF 按 1 MB 分片上传，再调用本地服务打印。服务端单片上限是 2 MB，总 PDF 上限是 50 MB。

## 直接打印 HTML {#print-html}

业务已经有 HTML 时，可以直接打印 HTML：

```ts
await printer.printHtml({
  html: '<!doctype html><html><body><main class="ready">Hello</main></body></html>',
  paper: { widthMm: 80, heightMm: 120 },
  readySelector: '.ready',
})
```

HTML 渲染仍由本地 Printer 服务完成。你只需要提供 HTML、纸张和可选的就绪选择器，不需要手写 Render 协议参数。

## 高级客户端 {#advanced-client}

如果你要调试底层协议或接入自定义上传流程，可以直接创建客户端：

```ts
import { createEasyInkPrinterClient } from '@easyink/print-integration-easyink-printer'

const client = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
})

await client.printPdfAndWait(file, {
  printerName: 'HP LaserJet',
})
```

客户端暴露的是底层 Printer/Render 能力，适合封装 SDK、排查协议问题或做非标准集成；业务页面优先使用 `createEasyInkPrinter()`。

## API Key {#api-key}

如果 Printer 配置了 API Key，创建客户端时传入同一个值：

```ts
const printer = createEasyInkPrinter({
  serviceUrl: 'http://localhost:18080',
  apiKey: 'your-secret-key',
  viewer: 'iframe',
  setupViewer(viewer) {
    registerBuiltinViewerMaterials((type, binding, extension) => {
      viewer.registerMaterial(type, binding, extension)
    })
  },
})
```

集成包会自动处理 HTTP 的 `X-API-Key` 和 WebSocket URL 上的 `apiKey` 参数。

## 生命周期 {#lifecycle}

业务页面卸载时分开清理 Viewer 和连接：

```ts
printer.destroy()
printer.client.disconnect()
```

`printer.destroy()` 清理托管 Viewer。`printer.client.disconnect()` 关闭 WebSocket 并拒绝还没完成的请求。

## 最小验收 {#acceptance}

第一张单不要只看“代码没报错”。我们建议你确认这三件事：

1. 如果先做预检，`printer.ready()` 能拿到打印机。
2. `printer.print()` 返回前没有抛错。
3. EasyInk.Printer 任务列表里能看到任务，目标打印机真的输出纸张。

如果你还带了 `userData`，再打开日志页确认 `User` 和 `Document Type` 列值是否落库展示。
