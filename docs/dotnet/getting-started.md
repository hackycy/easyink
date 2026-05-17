# 快速上手

EasyInk Printer 是 Windows 本地静默打印服务，适合需要稳定 PDF 打印质量的浏览器应用。前端接入时直接使用 `@easyink/print-integration-easyink-printer`，业务代码不需要自己处理 PDF 生成、WebSocket 分块上传或任务轮询。

如果你只是想验证“这套链路能不能打出第一张单”，最短路径是：

1. 在 Windows 机器上启动 `EasyInk.Printer.exe`。
2. 确认服务已经能返回打印机列表。
3. 前端注册 `@easyink/print-integration-easyink-printer` 驱动。
4. 调用 `viewer.print()`。

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
pnpm add @easyink/viewer @easyink/print-integration-easyink-printer
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

## 第四步：注册驱动并打印

```ts
import { createEasyInkPrinterClient, createEasyInkPrinterDriver } from '@easyink/print-integration-easyink-printer'
import { createViewer } from '@easyink/viewer'

const viewer = createViewer({ iframe })
const printer = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
  reconnect: true,
  maxReconnectAttempts: 3,
})

viewer.registerPrintDriver(createEasyInkPrinterDriver({ client: printer }))

await viewer.open({ schema, data })
await printer.useDefaultPrinter()
await viewer.print({ driverId: 'easyink-printer' })
```

`createEasyInkPrinterDriver()` 默认使用 `pageSizeMode: 'fixed'`，会先把 Viewer 页面生成 PDF，再发送给 EasyInk.Printer。调用方不用再处理 PDF 导出插件、WebSocket 二进制帧、分块上传或任务轮询。

客户端内部使用 VueUse 的 `useWebSocket` 管理长连接。连接意外断开时会进入 `reconnecting`，按配置重试；达到最大重连次数后进入 `error`，并把原因写入 `lastError`。

如果这段代码跑通，意味着下面几层都已经工作正常：

- Viewer 已经渲染出页面
- 前端能连接本地打印服务
- 本地服务能选中打印机并创建任务
- PDF 生成和上传链路没有问题

## 一个更接近真实业务的写法

上面的例子适合验证链路。真正接业务设置页时，通常还需要把打印机、份数和纸张策略做成可变配置。

```ts
const printer = createEasyInkPrinterClient({
  serviceUrl: settings.serviceUrl,
  apiKey: settings.apiKey,
  printerName: settings.printerName,
  defaultCopies: settings.copies,
})

viewer.registerPrintDriver(createEasyInkPrinterDriver({
  client: printer,
  printerName: () => settings.printerName,
  copies: () => settings.copies,
  forcePageSize: () => settings.forcePageSize,
  resolveRequestOptions: () => ({
    dpi: settings.dpi,
    userData: {
      userId: settings.currentUserId,
      labelType: settings.labelType,
    },
  }),
}))
```

这里推荐传函数而不是静态值。原因是用户切换打印机或份数后，不需要重新注册驱动。

这里的参数可以分成两类来看：

- `serviceUrl`、`apiKey`、重连参数属于“怎么连服务”
- `printerName`、`copies`、`forcePageSize`、`dpi`、`userData` 属于“这次打印怎么投递”

如果服务端启用了 API Key，前端只需要在创建客户端时传 `apiKey`。SDK 会自动把它带到 HTTP Header 和 WebSocket 查询参数里，不需要业务代码自己拼认证逻辑。

## 业务里最常用的打印参数

`resolveRequestOptions()` 适合放那些会随业务场景变化、但又不属于 Viewer 通用打印策略的字段，比如 `dpi` 和 `userData`。

### `dpi` 是什么，什么时候需要传

`dpi` 表示后端把 PDF 渲染成打印位图时使用的分辨率。默认值是 `600`，更完整的数据模型可以看 [Engine](./engine)。

不要把它理解成“越高越清晰”。实际打印效果取决于打印机本身的点密度：

- 普通办公打印机：通常保持默认值即可
- 203 dpi 热敏标签机：通常不传，或显式传 `203`
- 300 dpi 标签机：可以传 `300`

如果你不确定，就先不要改。只有当你已经确认设备分辨率、并且默认输出在清晰度或速度上不满足要求时，再显式设置 `dpi`。

### `userData` 是什么，`labelType` 应该填什么

`userData` 不参与排版、不决定纸张尺寸，也不影响打印机选择。它只用于审计日志，当前包含两个字段：

- `userId`：是谁发起的打印
- `labelType`：这张打印品在业务上属于哪一类

`labelType` 应该填业务类型，而不是设备信息或物理尺寸。推荐值例如：

- `shipping-label`
- `picking-label`
- `product-label`
- `return-label`

不推荐把这些值塞进 `labelType`：

- `100x150`：这是尺寸，不是业务类型
- `Zebra-ZD421`：这是打印机，不是标签类型
- `A4`：这是纸型，不是标签类型

一句话区分：`dpi` 解决“以什么分辨率渲染后再打印”，`labelType` 解决“这张打印单在业务上是什么”。

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
    labelType: 'invoice',
  },
})
```

这适合两类场景：

- 你的服务端已经生成好了 PDF
- 你只是想把已有票据重新投递给本地打印机

## 纸张策略

默认 `forcePageSize=false`，由打印机驱动使用当前介质；这适合小票机、连续纸和大多数办公打印机。

标签机必须显式按模板尺寸打印时再开启：

```ts
viewer.registerPrintDriver(createEasyInkPrinterDriver({
  client: printer,
  forcePageSize: true,
}))
```

判断标准不要反过来。不是“标签机就一定开启”，而是“只有当设备必须按模板尺寸输出，否则会缩放或错位时才开启”。

## 如何验收审计链路

如果你的目标不只是“打出来”，还包括“知道是谁打的、打的是什么类型”，那最小验收标准应该再多一步：

1. 发送一笔带 `userData` 的打印请求
2. 打开 `EasyInk.Printer` 桌面应用的日志页
3. 确认日志列表里能看到对应的 `User` 和 `Label Type` 列值

这一步的意义是把“前端已经把业务字段传出去了”和“后端审计真的落库并展示了”分开验证。

## Playground 示例

Playground 已使用官方包集成：

- [playground/src/hooks/useEasyInkPrint.ts](../../playground/src/hooks/useEasyInkPrint.ts) 只保留 Vue 状态和设置持久化
- [playground/src/drivers/easyink-print-driver.ts](../../playground/src/drivers/easyink-print-driver.ts) 调用 `@easyink/print-integration-easyink-printer`
- Playground 的 EasyInk Printer 设置面板里还提供了 `UserId` 和 `LabelType` 演示字段，方便直接验证审计日志链路

## 常见问题

**连接失败**：确认 `EasyInk.Printer.exe` 已运行且托盘图标可见，再访问 `http://localhost:18080/api/printers` 确认服务响应正常。

**打印任务提交后无反应**：先打开托盘管理窗口查看任务队列，再确认目标打印机在线，最后再看前端是否已经正确调用 `printer.useDefaultPrinter()` 或 `printer.setPrinter()`。

**配置了 API Key**：创建客户端时传入 `apiKey`，包会自动处理 HTTP Header 和 WebSocket 查询参数。

**第一张单应该怎么验收**：最小验收标准不是“代码没报错”，而是你能在服务端任务队列里看到任务，并且目标打印机真的吐出纸张。
