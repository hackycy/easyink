---
description: HiPrint 快速上手：连接 electron-hiprint，验证打印机列表，用托管 Viewer 或 HTML 直接打印第一张单。
---

# HiPrint 快速上手 {#getting-started}

这页只做一件事：让 HiPrint 路径先打出第一张单。

## 检查 runtime {#check-runtime}

HiPrint 集成依赖本地 `electron-hiprint` runtime。先确认服务地址能访问：

```text
http://localhost:17521
```

如果这一层没起来，后面的模板、Viewer 和打印参数都不会真的进入打印链路。

## 安装包 {#install}

安装前端集成包：

```bash
pnpm add @easyink/print-integration-hiprint
```

这个包内部使用 `vue-plugin-hiprint` 的 runtime 能力，同时提供 EasyInk 的高层打印器。

## 验证打印机 {#verify-printers}

先只连 runtime 和刷新打印机：

```ts
import { createHiPrintClient } from '@easyink/print-integration-hiprint'

const client = createHiPrintClient({
  serviceUrl: 'http://localhost:17521',
})

await client.connect()

const printers = await client.refreshPrinters()
console.log(printers)
```

`refreshPrinters()` 会在需要时自动连接。这里显式调用 `connect()` 是为了让第一步排查更清楚。

如果 `printers` 是空数组或直接报错，先排查 `electron-hiprint` 和系统打印机，不要急着改模板。

## 打印第一张单 {#first-print}

打印器创建后，业务侧只需要传 `schema + data`：

```ts
import { createHiPrintClient, createHiPrintPrinter } from '@easyink/print-integration-hiprint'

const client = createHiPrintClient({
  serviceUrl: 'http://localhost:17521',
})

const printer = createHiPrintPrinter({
  client,
  viewer: 'iframe',
})

await client.useDefaultPrinter()

await printer.print({
  schema,
  data,
})
```

这段代码会自动创建托管 Viewer，渲染完成后逐页提交给 HiPrint。默认 `pageSizeMode` 是 `driver`，默认不会强制下发自定义纸张尺寸。

## 指定打印参数 {#print-options}

打印机、份数和纸张策略可以在单次打印里传：

```ts
await printer.print({
  schema,
  data,
  printerName: 'XP-80C',
  copies: 2,
  forcePageSize: true,
})
```

`forcePageSize: true` 会让 HiPrint 收到按模板尺寸换算出的 `pageSize`。如果设备驱动已经配置好了纸张，先保持默认值就行。

## 直接打印 HTML {#print-html}

如果业务侧已经有 HTML，不需要先创建 EasyInk Viewer：

```ts
await client.printHtml({
  html: '<main class="receipt">Hello HiPrint</main>',
  width: 80,
  height: 120,
  printerName: 'XP-80C',
  copies: 1,
  printBackground: true,
})
```

`width` 和 `height` 的单位是毫米。集成会把 HTML 放进 HiPrint panel，并把内容区域换算成 points。

需要强制按这个尺寸下发给驱动时，再加 `forcePageSize`：

```ts
await client.printHtml({
  html: '<main class="receipt">Hello HiPrint</main>',
  width: 80,
  height: 120,
  forcePageSize: true,
})
```

如果你没有传 `printerName`，`HiPrintClient` 会使用当前已选择的打印机，或者刷新列表后选择默认打印机。

## 传递 HiPrint 原生选项 {#native-options}

需要把 HiPrint 支持的选项透传下去时，用 `requestOptions`：

```ts
await printer.print({
  schema,
  data,
  requestOptions: {
    silent: true,
    printBackground: true,
    duplexMode: 'simplex',
  },
})
```

这些选项会进入 `PrintTemplate.print2()` 的 options。EasyInk 只处理 Viewer 渲染和页面序列化，不会替你改变 HiPrint runtime 的含义。

直接 HTML 打印时，这些选项可以直接传给 `printHtml()`：

```ts
await client.printHtml({
  html: '<main>hello</main>',
  width: 80,
  height: 120,
  silent: true,
  margins: { marginType: 'none' },
})
```

## 复用现有 runtime {#existing-runtime}

如果项目已经自己管理 `vue-plugin-hiprint`，就让 EasyInk 只接管模板渲染和提交：

```ts
import { hiprint } from 'vue-plugin-hiprint'
import {
  createHiPrintPrinter,
  createHiPrintRuntimeClient,
} from '@easyink/print-integration-hiprint'

const client = createHiPrintRuntimeClient({
  hiprint,
  printerName: () => settings.printerName,
  defaultCopies: settings.copies,
  forcePageSize: settings.forcePageSize,
})

const printer = createHiPrintPrinter({
  client,
  viewer: 'iframe',
})

await printer.print({ schema, data })
```

这个 runtime client 不会初始化、连接、刷新或停止 HiPrint。它只把 EasyInk 渲染出的页面交给你传入的 runtime。

它同样支持 HTML 直接打印：

```ts
await client.printHtml({
  html: '<main>runtime html</main>',
  width: 80,
  height: 120,
})
```

:::warning 注意
`createHiPrintRuntimeClient()` 默认不允许没有打印机名称就提交。确实要使用 HiPrint runtime 自己的默认打印机时，传 `allowDefaultPrinter: true`。
:::

## 生命周期 {#lifecycle}

打印完成后按职责清理：

```ts
printer.destroy()
client.disconnect()
```

`printer.destroy()` 清理托管 Viewer。`client.disconnect()` 停止官方 `HiPrintClient` 管理的 socket。复用现有 runtime 时，连接生命周期仍由你的应用负责。

关于第一张单，目前到这里就够了。接下来可以回到 [打印方案](/printing/) 对比 EasyInk Printer 路径。
