---
description: EasyInk Printer .NET 打印服务：Windows 本地打印方案，包含桌面服务 EasyInk.Printer 和底层引擎 EasyInk.Engine。
---

# EasyInk Printer (.NET) {#dotnet}

EasyInk 的 .NET 链路解决的是 Windows 本地打印。

前端最常见的入口是：

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
await printer.print({ schema, data })
```

这段代码会连接本机 `EasyInk.Printer`，创建托管 Viewer，默认生成 PDF，再把 PDF 提交给 Windows 本地打印服务。

## 两层组件 {#components}

.NET 部分拆成两层：

```text
浏览器前端
  -> EasyInk.Printer HTTP/WebSocket
  -> EasyInk.Engine
  -> Windows 打印通道
```

| 组件 | 作用 |
| --- | --- |
| `EasyInk.Printer` | Windows 桌面服务，提供 HTTP/WebSocket、托盘、管理界面、审计、配置和 Render 调用 |
| `EasyInk.Engine` | 纯打印引擎，负责打印机查询、PDF 获取、队列和物理打印执行 |

如果你是浏览器项目，大多数时候直接安装并启动 `EasyInk.Printer`。如果你已经有自己的 .NET 宿主，只差打印引擎，再看 `EasyInk.Engine`。

## 打印路径 {#print-paths}

Engine 里当前有三条物理打印路径：

```text
PDF
  -> RoutingPrintService
     -> SumatraPdfPrintService
     -> EscPosRawPrintService
     -> PdfiumPrintService
```

路由优先级按代码实现是：SumatraPDF fallback、ESC/POS raw、默认 PDFium/GDI。

- `PdfiumPrintService`：默认路径，渲染 PDF 位图，再通过 `PrintDocument` 交给 Windows Spooler。
- `EscPosRawPrintService`：命中 `RawPrinterNames` 时，把 PDF 转成 ESC/POS 光栅指令直发。
- `SumatraPdfPrintService`：命中 `SumatraPrinterNames` 且配置了 SumatraPDF 路径时，使用 SumatraPDF CLI 打印。

## Render 与 PDF {#render-and-pdf}

EasyInk Printer 可以接收两类输入：

```json
{
  "printerName": "HP LaserJet",
  "pdfBase64": "JVBERi0xLjQK..."
}
```

```json
{
  "printerName": "HP LaserJet",
  "renderSource": {
    "type": "easyink",
    "schema": {
      "version": "1.0.0",
      "unit": "mm",
      "page": { "mode": "fixed", "width": 80, "height": 120 },
      "guides": { "x": [], "y": [] },
      "elements": []
    },
    "data": {
      "receipt": { "no": "R-001" }
    }
  }
}
```

PDF 输入会直接进入 Engine 打印路径。`renderSource` 输入会先由 Printer 调用本机 `easyink-render.exe render` 转成 PDF，再进入同一套 Engine 路由。

:::warning 注意
一笔打印请求只能有一个来源。不要同时传 `pdfBase64` / `pdfUrl` / `pdfBytes` 和 `renderSource`，服务端会返回 `INVALID_PARAMS`。
:::

## 接下来读什么 {#next}

- 想先跑通浏览器打印：看 [快速上手](/dotnet/getting-started)。
- 想了解桌面服务配置：看 [Printer 应用](/dotnet/printer)。
- 想嵌入自己的 .NET 宿主：看 [Engine DLL](/dotnet/engine)。
- 想手写 HTTP 或 WebSocket：看 [API 参考](/dotnet/api-reference)。
