# 快速上手

EasyInk Printer 是 Windows 本地静默打印服务，适合需要稳定 PDF 打印质量的浏览器应用。前端接入时直接使用 `@easyink/print-integration-easyink-printer`，业务代码不需要自己创建 Viewer、处理 PDF 生成、WebSocket 分块上传或任务轮询。

如果你只是想验证“这套链路能不能打出第一张单”，最短路径是：

1. 在 Windows 机器上启动 `EasyInk.Printer.exe`。
2. 确认服务已经能返回打印机列表。
3. 前端创建 `@easyink/print-integration-easyink-printer` 的打印器。
4. 调用 `printer.print({ schema, data })`。

这篇文档只覆盖浏览器如何接入本地打印服务。如果你要部署、配置端口或启用 API Key，继续看 [Printer 应用](./printer) 和 [API 参考](./api-reference)。

## 第一步：启动打印服务

### 下载预构建产物（推荐）

1. 前往 [GitHub Releases](https://github.com/hackycy/easyink/releases)
2. 下载最新版本的 `EasyInk.Printer` 压缩包
3. 解压后运行 `EasyInk.Printer.exe`

启动后系统托盘会出现图标，默认监听 `http://localhost:18080`。

### 或从源码构建

```bash
cd lib/EasyInk.Net
dotnet build EasyInk.Engine/src
dotnet build EasyInk.Printer/src
dotnet run --project EasyInk.Printer/src
```

## 第二步：安装依赖

```bash
pnpm add @easyink/print-integration-easyink-printer
```

## 第三步：先验证本地服务可用

在开始写前端代码之前，先确认服务真的活着，而且当前机器能列出打印机。这一步能把“前端接错了”和“本地打印服务没启动”分开。

直接在浏览器或终端访问：

```bash
curl http://localhost:18080/api/printers
```

如果服务正常，你至少应该看到：

- 请求能返回 `200`
- `data.printers` 是数组
- 数组里能看到当前 Windows 已安装的打印机

如果这一步失败，先不要继续写前端代码，优先排查：

- `EasyInk.Printer.exe` 是否已启动
- 端口是否被改过
- 当前机器是否真的安装了打印机驱动

## 第四步：创建打印器并打印

```ts
import { createEasyInkPrinterClient, createEasyInkPrinter } from '@easyink/print-integration-easyink-printer'

const client = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
  reconnect: true,
  maxReconnectAttempts: 3,
})

const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
})

await client.useDefaultPrinter()
await printer.print({ schema, data })
```

`createEasyInkPrinter()` 默认使用 `pageSizeMode: 'fixed'`，会自动创建托管 Viewer、把页面生成 PDF，再发送给 EasyInk.Printer。调用方不用再处理 Viewer 生命周期、PDF 导出插件、WebSocket 二进制帧、分块上传或任务轮询。

如果你希望把 `schema + data` 直接交给 EasyInk.Printer 内置的 Render 运行时生成 PDF，可以切换提交模式：

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

这条路径仍会创建托管 Viewer 来复用 Viewer 的分页和打印策略解析，但提交给服务端的是 `renderSource.type=easyink`，不是浏览器端生成的 PDF。服务端会先通过本地 Render 转 PDF，再进入相同的打印队列。

客户端内部使用 VueUse 的 `useWebSocket` 管理长连接。连接意外断开时会进入 `reconnecting`，按配置重试；达到最大重连次数后进入 `error`，并把原因写入 `lastError`。

如果这段代码跑通，意味着下面几层都已经工作正常：

- 打印器已经用托管 Viewer 渲染出页面
- 前端能连接本地打印服务
- 本地服务能选中打印机并创建任务
- PDF 生成和上传链路没有问题

## Viewer 是什么时候创建和销毁的

`createEasyInkPrinter()` 创建的是一个高层打印器，不是一个需要你手动挂载到页面上的预览组件。默认写法里只传：

```ts
const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
})
```

SDK 会在每次 `printer.print()` 时自动完成这些步骤：

1. 创建一个隐藏的托管 iframe。
2. 在 iframe 内创建 EasyInk Viewer。
3. 用 `schema + data` 打开文档并完成分页渲染。
4. 把渲染结果导出成 PDF。
5. 上传 PDF 到 EasyInk.Printer。
6. 打印结束或报错后销毁 Viewer，并移除 SDK 自己创建的 iframe。

所以普通业务代码不需要自己调用 `createViewer()`，也不需要自己准备 `createIframeViewerHost()`。只有在你要把 Viewer 显示在页面上做预览、或者要写自定义打印驱动时，才需要直接使用 `@easyink/viewer`。

如果你希望复用自己的 iframe，也可以传入已有元素：

```ts
const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
  iframe: document.getElementById('print-frame') as HTMLIFrameElement,
})
```

传入自己的 `iframe` 或 `container` 时，`printer.destroy()` 会销毁 Viewer 运行时，但不会替你删除这个外部元素。

## SDK 销毁和连接关闭

打印器和客户端的生命周期是分开的：

- `printer.destroy()`：只清理托管 Viewer、隐藏 iframe 或 DOM 渲染面。
- `client.disconnect()`：关闭 EasyInk.Printer 的 WebSocket 连接，并拒绝正在等待的请求。

默认 `autoDestroy` 是开启的，每次 `printer.print()` 完成后都会自动销毁 Viewer。大多数项目只需要在应用退出、用户关闭打印模块、或组件卸载时关闭 client：

```ts
import { onBeforeUnmount } from 'vue'

const client = createEasyInkPrinterClient({ serviceUrl: 'http://localhost:18080' })
const printer = createEasyInkPrinter({ client, viewer: 'iframe' })

onBeforeUnmount(() => {
  printer.destroy()
  client.disconnect()
})
```

如果打印模块是应用级单例，并且多个页面都会复用同一个打印连接，不要在单个页面离开时断开 `client`。可以只在用户关闭打印功能、退出登录或应用卸载时调用 `client.disconnect()`。

只有连续打印并且你明确想复用同一个托管 Viewer 时，才需要关闭自动销毁：

```ts
const printer = createEasyInkPrinter({
  client,
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

## 一个更接近真实业务的写法

上面的例子适合验证链路。真正接业务设置页时，通常还需要把打印机、份数和纸张策略做成可变配置。

```ts
const client = createEasyInkPrinterClient({
  serviceUrl: settings.serviceUrl,
  apiKey: settings.apiKey,
  printerName: settings.printerName,
  defaultCopies: settings.copies,
})

const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
  printerName: () => settings.printerName,
  copies: () => settings.copies,
  forcePageSize: () => settings.forcePageSize,
  resolveRequestOptions: () => ({
    dpi: settings.dpi,
    userData: {
      userId: settings.currentUserId,
      documentType: settings.documentType,
    },
  }),
})

await printer.print({ schema, data })
```

这里推荐传函数而不是静态值。原因是用户切换打印机或份数后，不需要重新创建打印器。

这里的参数可以分成两类来看：

- `serviceUrl`、`apiKey`、重连参数属于“怎么连服务”
- `printerName`、`copies`、`forcePageSize`、`dpi`、`userData` 属于“这次打印怎么投递”

如果服务端启用了 API Key，前端只需要在创建客户端时传 `apiKey`。客户端会自动把它带到 HTTP Header 和 WebSocket 查询参数里，不需要业务代码自己拼认证逻辑。

## 业务里最常用的打印参数

`resolveRequestOptions()` 适合放那些会随业务场景变化、但又不属于 Viewer 通用打印策略的字段，比如 `dpi` 和 `userData`。

### `dpi` 是什么，什么时候需要传

`dpi` 表示后端把 PDF 渲染成打印位图时使用的分辨率。默认值是 `600`，更完整的数据模型可以看 [Engine](./engine)。

不要把它理解成“越高越清晰”。实际打印效果取决于打印机本身的点密度：

- 普通办公打印机：通常保持默认值即可
- 203 dpi 热敏打印机：通常不传，或显式传 `203`
- 300 dpi 热敏打印机：可以传 `300`

如果你不确定，就先不要改。只有当你已经确认设备分辨率、并且默认输出在清晰度或速度上不满足要求时，再显式设置 `dpi`。

### `userData` 是什么，`documentType` 应该填什么

`userData` 不参与排版、不决定纸张尺寸，也不影响打印机选择。它只用于审计日志，当前包含两个字段：

- `userId`：是谁发起的打印
- `documentType`：这张打印品在业务上属于哪一类

`documentType` 应该填业务类型，而不是设备信息或物理尺寸。推荐值例如：

- `receipt`
- `invoice`
- `picking-list`
- `return-form`

不推荐把这些值塞进 `documentType`：

- `100x150`：这是尺寸，不是业务类型
- `Zebra-ZD421`：这是打印机，不是业务类型
- `A4`：这是纸型，不是业务类型

一句话区分：`dpi` 解决“以什么分辨率渲染后再打印”，`documentType` 解决“这张打印单在业务上是什么”。

## 指定服务和打印机

```ts
const printer = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
  printerName: 'HP LaserJet',
  defaultCopies: 1,
})
```

也可以运行时选择：

```ts
const printers = await printer.refreshPrinters()
printer.setPrinter(printers[0]?.name)
```

这两种方式的差别很简单：

- 初始化时传入：适合固定部署环境
- 运行时选择：适合设置页、诊断页或多打印机业务场景

## 连接和重连

`@easyink/print-integration-easyink-printer` 会同时管理 HTTP 超时和 WebSocket 重连。设置页或诊断页可以直接读取客户端状态：

```ts
const printer = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
  connectTimeoutMs: 5000,
  responseTimeoutMs: 15000,
  reconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelayMs: 500,
  reconnectBackoffMultiplier: 2,
  maxReconnectDelayMs: 5000,
})

await printer.connect()

console.log(printer.connectionState)
console.log(printer.reconnectAttempts)
console.log(printer.lastError)
```

连接状态含义如下：

| 状态 | 含义 |
|------|------|
| `idle` | 尚未连接，或已主动断开 |
| `connecting` | 正在建立 WebSocket 连接 |
| `connected` | WebSocket 已打开，可以提交打印命令 |
| `reconnecting` | 连接意外断开，正在按退避策略重连 |
| `error` | 连接超时、关闭或达到最大重连次数 |

如果业务需要完全关闭自动重连，可以传 `reconnect: false`。如果用户修改服务地址、API Key 或重连参数，调用 `printer.configure(...)` 会断开旧连接并返回是否需要重新连接。

## 打印已有 PDF

如果你的业务已经有 PDF 文件，不需要 Viewer，也可以直接调用客户端：

```ts
const printer = createEasyInkPrinterClient()
const file = await fetch('/invoice.pdf').then(res => res.blob())

await printer.printPdfAndWait(file, {
  printerName: 'HP LaserJet',
  copies: 1,
  userData: {
    userId: currentUser.id,
    documentType: 'invoice',
  },
})
```

这适合两类场景：

- 你的服务端已经生成好了 PDF
- 你只是想把已有票据重新投递给本地打印机

## 打印 schema + data 或 HTML

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

## 如何验收审计链路

如果你的目标不只是“打出来”，还包括“知道是谁打的、打的是什么类型”，那最小验收标准应该再多一步：

1. 发送一笔带 `userData` 的打印请求
2. 打开 `EasyInk.Printer` 桌面应用的日志页
3. 确认日志列表里能看到对应的 `User` 和 `Document Type` 列值

这一步的意义是把“前端已经把业务字段传出去了”和“后端审计真的落库并展示了”分开验证。

## Playground 示例

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
