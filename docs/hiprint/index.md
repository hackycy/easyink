---
description: Electron HiPrint 集成：支持托管 Viewer 打印 EasyInk 模板，也支持直接把 HTML 交给 HiPrint runtime 打印。
---

# Electron HiPrint {#hiprint}

HiPrint 集成适合已经有 `electron-hiprint` 运行时的桌面项目。

先看高层打印器：

```ts
import { compileBuiltinMaterialProfile } from '@easyink/builtin/all'
import { createHiPrintClient, createHiPrintPrinter } from '@easyink/print-integration-hiprint'

const client = createHiPrintClient({
  serviceUrl: 'http://localhost:17521',
})

const printer = createHiPrintPrinter({
  client,
  viewer: 'iframe',
  profile: compileBuiltinMaterialProfile('all'),
})

await client.useDefaultPrinter()
await printer.print({ schema, data })
```

这段代码会创建托管 Viewer，把 `schema + data` 渲染成页面，再把每一页序列化成 HTML 交给 HiPrint。

如果你的业务已经有 HTML，也可以直接打印：

```ts
await client.printHtml({
  html: '<main class="receipt">Hello</main>',
  width: 80,
  height: 120,
  printerName: 'XP-80C',
})
```

这条路径不会创建 Viewer。你负责提供 HTML 和页面尺寸，集成负责创建 HiPrint `PrintTemplate` 并调用 `print2()`。

## 工作链路 {#pipeline}

HiPrint 路径不是 PDF 上传路径。它的链路是：

```text
schema + data -> 托管 Viewer -> 页面 HTML
HTML -> HiPrint PrintTemplate -> 系统打印机
```

实现里 `createHiPrintDriver()` 会读取 Viewer 页面尺寸，并调用客户端的 `printPages()`。官方 `HiPrintClient` 会逐页调用 `printHtml()`，再通过 `hiprint.PrintTemplate().print2()` 提交给 HiPrint runtime。

也就是说，`printHtml()` 是底层能力，高层打印器只是复用了它。

## 默认纸张策略 {#paper-policy}

HiPrint 高层打印器默认使用 `pageSizeMode: 'driver'`。

```ts
await printer.print({
  schema,
  data,
  forcePageSize: false,
})
```

这表示 Viewer 不会强行把模板尺寸变成驱动纸张设置。对小票机、连续纸或驱动已经配置好介质的场景，这个默认值更贴近 HiPrint 的使用方式。

需要明确按模板尺寸下发给 HiPrint 时，再打开：

```ts
await printer.print({
  schema,
  data,
  forcePageSize: true,
})
```

打开后，集成会把毫米尺寸换算成 HiPrint 需要的微米 `pageSize`，并设置 `scaleFactor: 100`。

## 适用场景 {#use-cases}

如果你的项目符合下面任一条件，HiPrint 会比较顺手：

- 已经部署 `electron-hiprint` 或 `vue-plugin-hiprint`。
- 打印内容主要是小票、卡片、标签这类驱动主导纸张的任务。
- 业务已经能产出 HTML，只需要借 HiPrint runtime 送到打印机。
- 你希望复用现有 HiPrint 打印机连接、状态和配置。

如果你的场景更像 Windows 正式单据、A4 报表，或者你更想走 PDF 上传路径，先看 [EasyInk Printer](/dotnet/)。

## 两种接入方式 {#client-options}

你可以让 EasyInk 管理 HiPrint 连接：

```ts
const client = createHiPrintClient({
  serviceUrl: 'http://localhost:17521',
  namespace: 'easyink',
})
```

也可以复用你现有的 HiPrint runtime：

```ts
import { hiprint } from 'vue-plugin-hiprint'
import { createHiPrintRuntimeClient } from '@easyink/print-integration-hiprint'

const client = createHiPrintRuntimeClient({
  hiprint,
  printerName: () => settings.printerName,
  defaultCopies: settings.copies,
})
```

两种方式都能配合 `createHiPrintPrinter()`。区别只是连接层归谁管理。

关于 HiPrint 的整体边界，目前知道这些就够了。下一步继续看 [快速上手](/hiprint/getting-started)。
