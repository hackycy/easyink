---
description: HiPrint 快速上手：5 分钟跑通第一张打印单，包含 Runtime 检查和最小调用示例。
---

# HiPrint 快速上手

这页的目标很简单：先让 HiPrint 跑出第一张单。

## Runtime 检查

HiPrint 这条链路依赖本地的 `electron-hiprint` 运行时。先把它启动起来，再继续接代码。

默认服务地址通常是：

```text
http://localhost:17521
```

如果这一层没起来，后面再怎么调模板也不会有结果。

## 前端集成包安装

```bash
pnpm add @easyink/print-integration-hiprint
```

## 打印机验证

```ts
import { createHiPrintClient } from '@easyink/print-integration-hiprint'

const hiPrint = createHiPrintClient({
  serviceUrl: 'http://localhost:17521',
})

await hiPrint.connect()
const printers = await hiPrint.refreshPrinters()
console.log(printers)
```

如果这里就拿不到打印机，优先排查本地运行时和系统打印机，不要急着继续调 Viewer。

## 打印器创建

```ts
import { createHiPrintClient, createHiPrintPrinter } from '@easyink/print-integration-hiprint'

const hiPrint = createHiPrintClient({
  serviceUrl: 'http://localhost:17521',
})

const printer = createHiPrintPrinter({
  client: hiPrint,
  viewer: 'iframe',
})

await hiPrint.useDefaultPrinter()
await printer.print({ schema, data })
```

当前高层打印器会在内部托管 Viewer，并默认走 `pageSizeMode: 'driver'`。这很适合小票和驱动主导介质的场景。

## Viewer 自动创建

这是 HiPrint 集成里最容易省心的一点。

`createHiPrintPrinter()` 返回的是一个高层打印器，不是一个要你自己挂到页面上的预览组件。它会在打印时创建托管 Viewer，完成渲染后再把结果提交给 HiPrint。

如果你真的想复用自己的容器，也可以显式传入：

```ts
const printer = createHiPrintPrinter({
  client: hiPrint,
  viewer: 'iframe',
  iframe: document.getElementById('print-frame') as HTMLIFrameElement,
})
```

## 现有 HiPrint 封装集成

那就不要再让 EasyInk 接管连接层了，直接包一层 runtime client 即可：

```ts
import { hiprint } from 'vue-plugin-hiprint'
import {
  createHiPrintPrinter,
  createHiPrintRuntimeClient,
} from '@easyink/print-integration-hiprint'

const hiPrint = createHiPrintRuntimeClient({
  hiprint,
  printerName: () => settings.printerName,
  defaultCopies: settings.copies,
  forcePageSize: settings.forcePageSize,
})

const printer = createHiPrintPrinter({
  client: hiPrint,
  viewer: 'iframe',
})

await printer.print({ schema, data })
```

这样 Viewer 打印链路是 EasyInk 负责，HiPrint 连接和状态管理仍然是你现有系统负责。

## 销毁与断开连接

- `printer.destroy()`：清理托管 Viewer
- `hiPrint.disconnect()`：关闭官方 client 管理的连接

这两件事职责不同，最好在业务里也分开处理。
