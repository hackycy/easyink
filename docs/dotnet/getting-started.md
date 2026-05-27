---
description: EasyInk .NET 打印快速上手：启动本地服务，让浏览器端打出第一张单。
---

# 快速上手

这页只做一件事：让浏览器端先打出第一张单。

## 本地服务启动

启动 `EasyInk.Printer.exe` 之后，默认服务地址通常是：

```text
http://localhost:18080
```

先别急着写前端代码，先确认服务真的能响应。

## 前端集成包安装

```bash
pnpm add @easyink/print-integration-easyink-printer
```

## 打印机验证

你可以先直接打这个接口：

```bash
curl http://localhost:18080/api/printers
```

如果这一步都失败，优先排查本地服务和打印机驱动，而不是继续调模板渲染。

## 客户端与打印器创建

```ts
import { createEasyInkPrinterClient, createEasyInkPrinter } from '@easyink/print-integration-easyink-printer'

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

这条链路已经把托管 Viewer、渲染、PDF 提交和打印过程串起来了。大多数项目第一次接入，就从这里开始。

## 默认打印策略

当前高层打印器默认走 `pageSizeMode: 'fixed'`。这通常更适合正式单据、固定页模板和 PDF 路径。

如果你之后还要改成服务端 Render 提交模式，也是在这层配置上继续扩展，而不是重写整条打印流程。

## 服务端 Render

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
```

这条模式仍然会使用托管 Viewer 来复用页面策略和运行时数据输入，但最终提交给本地服务的是 render source，而不是浏览器端生成的 PDF 文件。

## Viewer 自动创建

这和 HiPrint 一样，也是高层打印器最省心的地方。

`createEasyInkPrinter()` 返回的是一个“打印器”，不是一个要你自己挂到页面上的预览组件。它内部会创建托管 Viewer，并在合适的时机销毁它。

如果你真的想复用自己的容器，也可以显式传入 `iframe` 或 `container`。

## 生命周期管理

- `printer.destroy()`：清理托管 Viewer
- `client.disconnect()`：关闭客户端连接

这两件事最好分开理解。前者是渲染面生命周期，后者是通信生命周期。

## PDF 直接打印

那就不一定要再走 Viewer。

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

如果你的业务本来就产出 PDF，这通常会是更短的提交路径。

这适合两类场景：

- 你的服务端已经生成好了 PDF
- 你只是想把已有票据重新投递给本地打印机

## Schema/HTML 打印

如果业务侧不需要高层托管 Viewer，也可以直接使用客户端 API。`printEasyInk()` 会把模板和数据作为 `renderSource.type=easyink` 发送给 EasyInk.Printer：

```ts
const client = createEasyInkPrinterClient()
await client.useDefaultPrinter()

await client.printEasyInkAndWait({
  schema,
  data,
}, {
  renderOptions: {
    pdf: { printBackground: true },
    wait: { until: 'easyinkReady', timeoutMs: 5000 },
  },
})
```

HTML 打印使用 `renderSource.type=html`。HTML 中建议提供一个稳定的 ready 节点，再用 `wait.selector` 等待它出现：

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

注意不要把 PDF 输入和 `renderSource` 放在同一个请求里。Printer 会把这类请求视为参数错误，因为一笔打印任务只能有一个来源。

## 纸张策略

默认 `forcePageSize=false`，由打印机驱动使用当前介质；这适合小票机、连续纸和大多数办公打印机。

设备必须显式按模板尺寸打印时再开启：

```ts
const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
  forcePageSize: true,
})
```

判断标准不要反过来。不是“特定设备类型就一定开启”，而是“只有当设备必须按模板尺寸输出，否则会缩放或错位时才开启”。

## 审计链路验收

如果你的目标不只是“打出来”，还包括“知道是谁打的、打的是什么类型”，那最小验收标准应该再多一步：

1. 发送一笔带 `userData` 的打印请求
2. 打开 `EasyInk.Printer` 桌面应用的日志页
3. 确认日志列表里能看到对应的 `User` 和 `Document Type` 列值

这一步的意义是把“前端已经把业务字段传出去了”和“后端审计真的落库并展示了”分开验证。

## Playground 参考

Playground 已使用官方包集成：

- [playground/src/hooks/useEasyInkPrint.ts](../../playground/src/hooks/useEasyInkPrint.ts) 只保留 Vue 状态和设置持久化
- 预览页调用 hook 暴露的 `easyInkPrint.print({ schema, data })`，由打印器自动创建和销毁托管 Viewer
- 预览页打印菜单还提供 `EasyInk Printer 打印（Schema）` 和 `EasyInk Printer 打印（HTML）`，用于验证 Printer-side Render 的 `renderSource.type=easyink` / `html` 两条路径
- Playground 的 EasyInk Printer 设置面板里还提供了 `UserId` 和 `DocumentType` 演示字段，方便直接验证审计日志链路

## 常见问题

**连接失败**：确认 `EasyInk.Printer.exe` 已运行且托盘图标可见，再访问 `http://localhost:18080/api/printers` 确认服务响应正常。

**打印任务提交后无反应**：先打开托盘管理窗口查看任务队列，再确认目标打印机在线，最后再看前端是否已经正确调用 `printer.useDefaultPrinter()` 或 `printer.setPrinter()`。

**配置了 API Key**：创建客户端时传入 `apiKey`，包会自动处理 HTTP Header 和 WebSocket 查询参数。

**第一张单应该怎么验收**：最小验收标准不是“代码没报错”，而是你能在服务端任务队列里看到任务，并且目标打印机真的吐出纸张。
