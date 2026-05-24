# 打印方案

EasyInk 的本地打印目标很明确：让业务代码只关心“打印什么”和“发给哪台打印机”，而不是自己处理 PDF 渲染、WebSocket 通信、分页 DOM 提取和任务轮询。

如果你的目标是“先稳定生成 PDF，再交给打印服务或业务系统下载”，请先看 [EasyInk.Render 服务端渲染](/printing/render)。Render 负责把 HTML、PDF、EasyInk schema + data 归一为可打印 PDF，并提供浏览器版本固定、等待策略、安全拦截和 diagnostics。

如果你是第一次接入，优先走官方打印集成包：

- `@easyink/print-integration-easyink-printer`：对接 EasyInk.Printer (.NET)，把 Viewer 页面转成 PDF 后发送到本地打印服务
- `@easyink/print-integration-hiprint`：对接 electron-hiprint，直接把 Viewer 页面 HTML 发送给 HiPrint

这两个包都已经包含了“客户端 + 托管 Viewer 渲染 + 打印提交”完整链路。大多数项目不需要自己创建 Viewer，也不需要自己注册 `PrintDriver`。

## 你真正要做的事情

无论选哪条链路，前端接入步骤都一样：

1. 安装对应的打印包。
2. 创建打印客户端，管理连接地址、默认打印机和份数。
3. 创建对应的打印器，选择 `viewer: 'iframe'` 或 `viewer: 'dom'`。
4. 调用 `printer.print({ schema, data })`。
5. 在设置页暴露打印机列表、连接状态和错误信息。

也就是说，业务系统真正需要维护的状态通常只有这些：

- 打印服务地址
- 当前选中的打印机
- 默认份数
- 是否强制纸张尺寸
- 连接状态、重连次数和最近一次错误

## 方案对比

| | EasyInk Printer (.NET) | HiPrint (vue-plugin-hiprint) |
|---|---|---|
| **运行平台** | 仅 Windows | Windows / macOS / Linux |
| **打印输入** | PDF | HTML |
| **渲染质量** | 适合对矢量质量要求高的正式单据 | 适合小票、卡片、跨平台打印 |
| **通信方式** | HTTP + WebSocket | WebSocket |
| **典型场景** | 面单、正式报表、A4 文档 | 小票、卡片、嵌入 Electron 的桌面应用 |
| **打印器默认 pageSizeMode** | `fixed` | `driver` |
| **官方包** | `@easyink/print-integration-easyink-printer` | `@easyink/print-integration-hiprint` |

## 如何选择

### 选 EasyInk Printer 的情况

- 你的部署环境是 Windows。
- 你更在意 PDF 打印质量和系统打印稳定性。
- 你希望纸张尺寸、方向、偏移量都由打印服务准确控制。

### 选 HiPrint 的情况

- 你需要跨平台。
- 你的系统已经在使用 electron-hiprint。
- 你打印的主要是小票、卡片等较轻量页面。

### 不要自己实现驱动的情况

如果你的打印目标只是“把 schema/data 打给本地服务”，官方打印器已经覆盖了绝大多数需求。只有在下面这些情况才建议写自定义驱动：

- 你有独立的企业打印网关，需要走自定义协议。
- 你要接专用硬件或厂商 SDK。
- 你需要在提交前做额外的签名、加密或审计。

## 推荐的前端封装方式

不要把连接逻辑散落在按钮点击里。更稳定的方式是把打印集成收口成一个可复用的 store 或 hook：

```ts
const client = createEasyInkPrinterClient(...)
const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
})

export function usePrintService() {
	return {
		client,
		printer,
		connect,
		disconnect,
		refreshDevices,
		config,
		devices,
		jobs,
		connectionState,
		reconnectAttempts,
		lastError,
	}
}
```

这样做的原因有两个：

- 打印器负责“本次 schema/data 如何渲染并提交”，不负责“配置存在哪、何时重连”。
- 打印设置页、诊断页、预览页都能共享同一份连接状态。

EasyInk Printer 官方客户端内部使用 VueUse `useWebSocket` 管理长连接。默认会自动重连 3 次，初始延迟 500ms，按 2 倍退避，最大延迟 5000ms；达到上限后进入 `error`，错误信息写入 `lastError`。

```ts
const client = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
  reconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelayMs: 500,
  reconnectBackoffMultiplier: 2,
  maxReconnectDelayMs: 5000,
})
```

## 常见问题

### 调用了 print，但没有打印输出

先检查三件事：

1. 本地打印服务是否在线。
2. 当前打印机是否已经选中，并且仍然存在于设备列表。
3. `printer.print()` 的 `onPhase` / `onDiagnostic` 是否报告渲染或提交错误。

### 为什么 EasyInk Printer 要先转 PDF

因为目标不是“把浏览器 DOM 打出去”，而是“把页面以稳定、可控、与浏览器缩放无关的形式交给 Windows 打印管线”。PDF 是这里最稳定的交换格式。

### 为什么 HiPrint 有时需要 `forcePageSize`

部分驱动在未收到显式 page size 时会按 A4 或默认介质缩放输出，这时可以为当前打印配置开启 `forcePageSize`。如果开启后出现留白、缩放或打印失败，就保持关闭，让驱动使用当前介质。

## 排错顺序

当用户反馈“点了打印没反应”时，排查顺序建议固定下来：

1. 先看连接状态是否为 `connected`。
2. 再看打印机列表是否成功刷新。
3. 再看当前打印机名称是否存在于设备列表。
4. 再看 `printer.print()` 期间的 `onPhase` 和 `onProgress` 事件。
5. 最后再查本地打印服务日志。

这个顺序的原因是，大多数问题并不在模板渲染，而是在连接、选机和设备侧能力协商。

## 下一步

- [EasyInk Printer (.NET)](/dotnet/)：了解 Windows 打印服务部署方式
- [Electron HiPrint](/hiprint/)：了解 electron-hiprint 的运行要求
- [EasyInk.Render 服务端渲染](/printing/render)：了解服务端 PDF 渲染、诊断和开发方式
- [自定义打印驱动开发](/advanced/print-drivers) ：当官方驱动不满足你的接入要求时再进入这一层
