# HiPrint 快速上手

HiPrint 通道适合跨平台静默打印，尤其适合标签、小票、卡片这类由设备驱动控制纸张的场景。EasyInk 已经内置官方客户端和 Viewer 打印驱动，业务侧不需要自己实现 WebSocket 连接、打印机发现或 `PrintDriver`。

如果你的目标只是先打出第一张单，最短路径是：

1. 启动 electron-hiprint。
2. 确认本机能刷新到打印机列表。
3. 前端注册 `@easyink/print-integration-hiprint` 驱动。
4. 调用 `viewer.print()`。

这篇文档只讲浏览器如何接入 HiPrint。electron-hiprint 本身的安装和系统打印驱动问题，仍然以它的发行包和操作系统配置为准。

## 第一步：启动 electron-hiprint

前往 [electron-hiprint Releases](https://github.com/CcSimple/electron-hiprint/releases) 下载对应平台安装包。

启动后默认监听 `http://localhost:17521`，保持运行即可。

## 第二步：安装依赖

```bash
pnpm add @easyink/viewer @easyink/print-integration-hiprint
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

如果这里拿不到打印机，优先排查本地环境，而不是继续调 Viewer。

## 第四步：注册驱动并打印

```ts
import { createHiPrintClient, createHiPrintDriver } from '@easyink/print-integration-hiprint'
import { createViewer } from '@easyink/viewer'

const viewer = createViewer({ iframe })
const hiPrint = createHiPrintClient({
  serviceUrl: 'http://localhost:17521',
})

viewer.registerPrintDriver(createHiPrintDriver({ client: hiPrint }))

await viewer.open({ schema, data })
await hiPrint.useDefaultPrinter()
await viewer.print({ driverId: 'hiprint' })
```

`createHiPrintDriver()` 默认使用 `pageSizeMode: 'driver'`，适合小票机、连续纸和由驱动决定介质的场景。用户只需要选择打印机，不需要理解 Viewer 的底层打印策略。

如果这段代码能跑通，说明这条链路已经成立：

- Viewer 已经渲染出可打印页面
- electron-hiprint 已建立连接
- 当前机器能发现系统打印机
- HiPrint 已经按页提交 HTML 到本地打印运行时

## 一个更接近真实业务的写法

真正落业务时，打印机、份数和 `forcePageSize` 往往来自设置页，而不是写死在初始化里。

```ts
const hiPrint = createHiPrintClient({
  serviceUrl: settings.serviceUrl,
  printerName: settings.printerName,
  defaultCopies: settings.copies,
})

viewer.registerPrintDriver(createHiPrintDriver({
  client: hiPrint,
  printerName: () => settings.printerName,
  copies: () => settings.copies,
  forcePageSize: () => settings.forcePageSize,
  resolveRequestOptions: () => ({
    paperHeader: settings.paperHeader,
    paperFooter: settings.paperFooter,
  }),
}))
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
await viewer.print({ driverId: 'hiprint' })
```

普通小票机、连续纸和普通办公打印机通常保持关闭。

这里的判断标准不是“标签机就开启”，而是“当前设备如果不显式传纸张尺寸，就会被系统驱动按 A4 或默认介质处理”。

## Playground 示例

Playground 已使用官方包集成：

- [playground/src/hooks/useHiPrint.ts](../../playground/src/hooks/useHiPrint.ts) 只保留 Vue 状态和设置持久化
- [playground/src/drivers/hiprint-print-driver.ts](../../playground/src/drivers/hiprint-print-driver.ts) 调用 `@easyink/print-integration-hiprint`

## 常见问题

**连接超时**：确认 electron-hiprint 客户端已启动并监听 17521 端口。

**未发现打印机**：先确认系统打印机已正常安装，再调用 `hiPrint.refreshPrinters()`；如果这里拿不到设备，问题通常不在 Viewer。

**标签内容缩印到 A4**：确认当前打印任务需要显式纸张尺寸时，调用 `hiPrint.setForcePageSize(true)` 或在驱动配置里传 `forcePageSize`。

**第一张单应该怎么验收**：最小验收标准不是前端 Promise resolve，而是设备确实打印出预期尺寸的纸张，且没有被驱动缩放到默认 A4。
