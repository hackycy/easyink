# 诊断系统

Viewer 有一套统一的诊断事件模型，用来把“渲染里出了什么问题”明确地抛给宿主。

它的意义不是让一切都不断抛异常，而是让可恢复问题也能被看见。

## 诊断订阅

```ts
await viewer.open({
  schema,
  data,
  onDiagnostic(event) {
    console.warn(`[${event.severity}] [${event.scope}] ${event.code}: ${event.message}`)
  },
})
```

如果你已经有日志、埋点或告警系统，这个回调就是最自然的接入口。

## 事件结构

```ts
interface ViewerDiagnosticEvent {
  category: 'schema' | 'datasource' | 'viewer' | 'print' | 'exporter'
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  nodeId?: string
  detail?: unknown
  scope?: 'schema' | 'datasource' | 'font' | 'material' | 'print' | 'exporter' | 'hook'
  cause?: unknown
}
```

这里最值得先理解的是 `category` 和 `scope`：

- `category` 更偏向归类结果
- `scope` 更偏向问题发生在哪个阶段

这也是为什么有些字体或物料问题，最终 `category` 可能还是 `viewer`，但 `scope` 会更具体。

## 常见问题类型

### Schema 校验

`open()` 一开始就会先校验 Schema。校验不通过时，会先发出一条 `category: 'schema'` 的错误诊断，然后再抛出异常。

### 字体加载

字体不是强依赖成功才能继续渲染，所以这类问题通常会以 warning 形式上报。

当前实现里，字体失败会带上 `scope: 'font'`，并常见于 `FONT_LOAD_FAILED` 这类错误码。

### 物料渲染

当某个物料的渲染函数抛错时，Viewer 会尽量不中断整页渲染，而是：

- 记录一条错误诊断
- 用占位内容替代出错节点

这对排查自定义物料特别有用，因为你不会因为一个节点失败就丢掉整页结果。

### 打印与导出

打印驱动和导出器也会通过同一套诊断事件把错误往上抛。

这意味着你的宿主 UI 不需要为每条链路再设计一套完全不同的错误模型。

## 内部机制

有两个内部工具最值得知道：`safeRender()` 和 `safeCall()`。

`safeRender()` 主要包同步渲染逻辑。出错时，它会生成诊断，并在有回退 HTML 的情况下返回一个错误占位结果。

`safeCall()` 主要包异步流程。出错时，它会把诊断记录下来，然后继续把异常往外抛。

你不需要直接调用它们，但知道这层机制后，再看诊断事件就更容易理解来源。

## 诊断接入策略

如果你正在做业务接入，先别急着把每条 `warning` 都弹成红色报错。

更稳的做法通常是：

- `error` 进入日志和用户可见反馈
- `warning` 进入诊断面板、日志或开发环境控制台
- `info` 只做调试辅助

这样既能看见问题，也不会把非致命情况渲染成“系统完全不可用”。
