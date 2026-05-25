# 打印与导出

Viewer 的打印和导出能力都建立在同一个前提上：页面已经被渲染好了。

所以这一层的重点不是“重新排版”，而是“消费现成的渲染结果”。

## 先试最简单的打印

```ts
await viewer.print()
```

默认情况下，Viewer 会走浏览器打印路径。

如果 Host 存在，它会先准备一层打印隔离样式，再调用对应文档环境里的 `window.print()`。打印结束或出错后，这层隔离状态会被清理掉。

## `pageSizeMode` 是什么意思

打印时最值得先理解的选项，就是 `pageSizeMode`。

```ts
await viewer.print({ pageSizeMode: 'driver' })
await viewer.print({ pageSizeMode: 'fixed' })
```

它回答的问题很简单：纸张尺寸到底听谁的。

- `driver`：优先让打印机驱动决定纸张。
- `fixed`：尽量按模板或渲染结果里的尺寸来打印。

固定页模板和连续纸模板在这里的行为会不同，这也是 Viewer 需要先解析打印策略的原因。

## 自定义打印驱动怎么接

如果你不是直接调浏览器打印，而是要把内容交给本地服务、远程网关或专用设备，就注册一个驱动。

```ts
viewer.registerPrintDriver({
  id: 'thermal-printer',
  async print(context) {
    console.log(context.printPolicy)
    console.log(context.renderedPages)
    console.log(context.container)
  },
})

await viewer.print({
  driverId: 'thermal-printer',
  pageSizeMode: 'fixed',
})
```

这里的 `context` 已经包含了当前打印最需要的信息：

- 打印策略
- 已渲染页尺寸
- 渲染容器
- Schema 和数据

驱动最适合做协议适配，不适合再重新做布局判断。

## 导出器的注册方式也很直接

导出走的是另一条注册接口：

```ts
viewer.registerExporter({
  id: 'pdf-exporter',
  format: 'pdf',
  async export(context) {
    console.log(context.renderedPages)
    console.log(context.container)
    return new Blob(['ok'], { type: 'application/pdf' })
  },
})
```

然后在运行时调用：

```ts
const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'preview',
  onPhase(event) {
    console.log(event.phase)
  },
  onProgress(event) {
    console.log(event.current, event.total)
  },
})
```

这里有个小细节值得记住：`exportDocument()` 既可以传字符串格式，也可以传完整选项对象。

## `resolvePrintPolicy()` 是干什么的

如果你在写驱动，通常会想知道 Viewer 最终到底准备怎么打印。

这时可以直接看打印策略：

```ts
import { resolvePrintPolicy } from '@easyink/viewer'

const policy = resolvePrintPolicy({
  schema: documentSchema,
  options: { pageSizeMode: 'fixed' },
  renderedPages: viewer.renderedPages,
})
```

当前策略对象里最关键的是这些字段：

- `pageMode`
- `pageSizeMode`
- `sheetSize`
- `orientation`
- `pageBreakBehavior`
- `offset`

如果你要把 Viewer 接到外部打印系统，这几个字段通常就已经足够决定提交参数了。

## 打印和导出共用一套任务回调

这一点很实用，因为你可以用同一套 UI 状态处理两条链路。

```ts
await viewer.print({
  onPhase(event) {
    console.log(event.phase)
  },
  onProgress(event) {
    console.log(event.current, event.total)
  },
  onDiagnostic(event) {
    console.warn(event.code, event.message)
  },
  throwOnError: true,
})
```

导出时同样能用这些回调。

## 一个够用的实践建议

如果你当前的目标只是把文档稳定打印出去，不要急着从 `registerPrintDriver()` 开始。

更短路径通常是：

1. 先确认浏览器打印是否满足需求。
2. 不满足时，再优先看官方打印集成包。
3. 只有在协议或设备要求特殊时，再自己写驱动。

这样能少走很多弯路。
