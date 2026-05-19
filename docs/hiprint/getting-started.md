# HiPrint 快速上手

HiPrint 通道适合跨平台静默打印，尤其适合标签、小票、卡片这类由设备驱动控制纸张的场景。EasyInk 已经内置托管 Viewer 打印链路，并提供两种接入方式：

- 官方 client：EasyInk 帮你连接 `electron-hiprint`、发现打印机并提交打印。
- runtime adapter：业务已有自己的 hiprint 封装时，只把现成 `hiprint` 实例交给 EasyInk 做打印提交。

如果你的目标只是先打出第一张单，且还没有自己的 HiPrint 封装，最短路径是：

1. 启动 electron-hiprint。
2. 确认本机能刷新到打印机列表。
3. 前端创建 `@easyink/print-integration-hiprint` 的打印器。
4. 调用 `printer.print({ schema, data })`。

这篇文档只讲浏览器如何接入 HiPrint。electron-hiprint 本身的安装和系统打印驱动问题，仍然以它的发行包和操作系统配置为准。

## 第一步：启动 electron-hiprint

前往 [electron-hiprint Releases](https://github.com/CcSimple/electron-hiprint/releases) 下载对应平台安装包。

启动后默认监听 `http://localhost:17521`，保持运行即可。

## 第二步：安装依赖

```bash
pnpm add @easyink/print-integration-hiprint
```

## 第三步：先验证能发现打印机

HiPrint 侧最常见的问题不是代码写错，而是本地客户端虽然启动了，但没有正确连接到系统打印机。开始接 Viewer 之前，先验证两件事：

- electron-hiprint 进程已经启动
- 当前机器确实能列出打印机

最简单的验证方式是先在前端调用：

```ts
const hiPrint = createHiPrintClient({ serviceUrl: 'http://localhost:17521' })
await hiPrint.connect()
const printers = await hiPrint.refreshPrinters()
console.log(printers)
```

如果这里拿不到打印机，优先排查本地环境，而不是继续调模板渲染。

## 第四步：创建打印器并打印

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

`createHiPrintPrinter()` 默认使用 `pageSizeMode: 'driver'`，适合小票机、连续纸和由驱动决定介质的场景。用户只需要选择打印机，不需要理解 Viewer 的底层打印策略。

如果这段代码能跑通，说明这条链路已经成立：

- 打印器已经用托管 Viewer 渲染出可打印页面
- electron-hiprint 已建立连接
- 当前机器能发现系统打印机
- HiPrint 已经按页提交 HTML 到本地打印运行时

## Viewer 是什么时候创建和销毁的

`createHiPrintPrinter()` 创建的是 EasyInk 的高层打印器，不是一个需要你手动挂载的预览组件。默认写法里只传：

```ts
const printer = createHiPrintPrinter({
  client: hiPrint,
  viewer: 'iframe',
})
```

SDK 会在每次 `printer.print()` 时自动完成这些步骤：

1. 创建一个隐藏的托管 iframe。
2. 在 iframe 内创建 EasyInk Viewer。
3. 用 `schema + data` 打开文档并完成分页渲染。
4. 提取 Viewer 渲染出的页面 HTML。
5. 通过 HiPrint `PrintTemplate` 逐页提交给 electron-hiprint。
6. 打印结束或报错后销毁 Viewer，并移除 SDK 自己创建的 iframe。

因此普通业务接入 HiPrint 打印时，不需要自己调用 `createViewer()`，也不需要自己创建 `createIframeViewerHost()`。如果页面上已经有自己的 iframe 或 DOM 容器，可以显式交给 SDK 复用：

```ts
const printer = createHiPrintPrinter({
  client: hiPrint,
  viewer: 'iframe',
  iframe: document.getElementById('print-frame') as HTMLIFrameElement,
})
```

传入自己的 `iframe` 或 `container` 时，`printer.destroy()` 会销毁 Viewer 运行时，但不会替你删除这个外部元素。

## SDK 销毁和连接关闭

打印器和 HiPrint client 的生命周期是分开的：

- `printer.destroy()`：只清理 EasyInk 托管 Viewer、隐藏 iframe 或 DOM 渲染面。
- `hiPrint.disconnect()`：只适用于 `createHiPrintClient()` 创建的官方 client，会停止 SDK 管理的 HiPrint socket。
- `createHiPrintRuntimeClient()`：不会接管 socket，因此也不会替业务关闭已有的 `hiprint` 连接。

默认 `autoDestroy` 是开启的，每次 `printer.print()` 完成后都会自动销毁 Viewer。大多数官方 client 接入只需要在应用退出、用户关闭打印模块、或组件卸载时关闭 socket：

```ts
import { onBeforeUnmount } from 'vue'

const hiPrint = createHiPrintClient({ serviceUrl: 'http://localhost:17521' })
const printer = createHiPrintPrinter({ client: hiPrint, viewer: 'iframe' })

onBeforeUnmount(() => {
  printer.destroy()
  hiPrint.disconnect()
})
```

如果 HiPrint client 是应用级单例，并且多个页面共享同一个打印连接，不要在单个页面离开时断开 `hiPrint`。可以只在用户关闭打印功能、退出登录或应用卸载时调用 `hiPrint.disconnect()`。

只有批量打印、连续打印并且你明确想复用同一个托管 Viewer 时，才需要关闭自动销毁：

```ts
const printer = createHiPrintPrinter({
  client: hiPrint,
  viewer: 'iframe',
  autoDestroy: false,
})

try {
  for (const item of items) {
    await printer.print({ schema, data: item })
  }
}
finally {
  printer.destroy()
}
```

## 已有 hiprint 封装时

很多项目已经基于 `vue-plugin-hiprint` 或 `electron-hiprint` 做了自己的连接、打印机选择、状态管理和异常处理。这种情况下不要再让 EasyInk 接管连接，使用 `createHiPrintRuntimeClient()` 注入现成的 `hiprint` 实例即可。

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
  resolveRequestOptions: () => ({
    paperHeader: settings.paperHeader,
    paperFooter: settings.paperFooter,
  }),
})

await printer.print({ schema, data })
```

这个 adapter 只做打印相关处理：

- 不调用 `hiprint.init()`
- 不调用 `hiwebSocket.setHost()`
- 不刷新打印机列表
- 不停止已有 socket
- 不接管 provider、设计器或模板编辑器

如果你的封装希望由 HiPrint 运行时自己决定默认打印机，可以显式开启：

```ts
const hiPrint = createHiPrintRuntimeClient({
  hiprint,
  allowDefaultPrinter: true,
})
```

`createLegacyHiPrintClient()` 也可作为同能力别名使用，适合把老项目里已有的 HiPrint 封装逐步迁移到 EasyInk Viewer 打印链路。

## 一个更接近真实业务的官方 client 写法

如果使用官方 client，真正落业务时，打印机、份数和 `forcePageSize` 往往来自设置页，而不是写死在初始化里。

```ts
const hiPrint = createHiPrintClient({
  serviceUrl: settings.serviceUrl,
  printerName: settings.printerName,
  defaultCopies: settings.copies,
})

const printer = createHiPrintPrinter({
  client: hiPrint,
  viewer: 'iframe',
  printerName: () => settings.printerName,
  copies: () => settings.copies,
  forcePageSize: () => settings.forcePageSize,
  resolveRequestOptions: () => ({
    paperHeader: settings.paperHeader,
    paperFooter: settings.paperFooter,
  }),
})

await printer.print({ schema, data })
```

这里把公共字段收敛成统一 API：`printerName`、`copies`、`forcePageSize`。如果 HiPrint 还需要额外参数，就通过 `resolveRequestOptions` 单独扩展，而不是继续往顶层堆专有字段。

## 指定打印机

```ts
const hiPrint = createHiPrintClient({
  serviceUrl: 'http://localhost:17521',
  printerName: 'XP-80C',
})
```

也可以运行时选择：

```ts
const printers = await hiPrint.refreshPrinters()
hiPrint.setPrinter(printers[0]?.name)
```

推荐先把 `refreshPrinters()` 结果展示在设置页里，再让用户明确选择。这样比默认盲选更容易排查问题。

## 标签机纸张策略

默认不向 electron-hiprint 强制传 `pageSize`，由打印机驱动使用当前介质。DELI 等标签机如果回退到 A4 缩印，再全局开启显式尺寸：

```ts
hiPrint.setForcePageSize(true)
await printer.print({ schema, data })
```

普通小票机、连续纸和普通办公打印机通常保持关闭。

这里的判断标准不是“标签机就开启”，而是“当前设备如果不显式传纸张尺寸，就会被系统驱动按 A4 或默认介质处理”。

## Playground 示例

Playground 已使用官方包集成：

- [playground/src/hooks/useHiPrint.ts](../../playground/src/hooks/useHiPrint.ts) 只保留 Vue 状态和设置持久化
- 预览页调用 hook 暴露的 `hiPrint.print({ schema, data })`，由打印器自动创建和销毁托管 Viewer

## 常见问题

**连接超时**：确认 electron-hiprint 客户端已启动并监听 17521 端口。

**未发现打印机**：先确认系统打印机已正常安装，再调用 `hiPrint.refreshPrinters()`；如果这里拿不到设备，问题通常不在模板渲染。

**标签内容缩印到 A4**：确认当前打印任务需要显式纸张尺寸时，调用 `hiPrint.setForcePageSize(true)` 或在打印器配置里传 `forcePageSize`。

**第一张单应该怎么验收**：最小验收标准不是前端 Promise resolve，而是设备确实打印出预期尺寸的纸张，且没有被驱动缩放到默认 A4。
