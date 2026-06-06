---
description: Viewer 诊断系统：统一的诊断事件模型，将渲染、字体、绑定、打印和导出过程中的问题抛给宿主处理。
---

# 诊断系统 {#diagnostics}

Viewer 用统一的诊断事件告诉宿主：渲染、字体、绑定、打印或导出过程中发生了什么。

诊断不等于异常。很多可恢复问题会继续渲染，同时把事件交给你记录、展示或上报。

## 订阅读诊断 {#subscribe-diagnostics}

最常见的接入口是 `open()`。

```ts
await viewer.open({
  schema,
  data,
  onDiagnostic(event) {
    console.warn(`[${event.severity}] ${event.code}: ${event.message}`)
  },
})
```

这个回调会保存在当前 Viewer 实例上。后续 `render()`、`print()` 和 `exportDocument()` 里通过运行时发出的诊断，也会进入这个回调。

打印和导出也可以传单次任务回调：

```ts
await viewer.print({
  onDiagnostic(event) {
    console.warn(event.code, event.message)
  },
})
```

任务回调适合更新当前按钮或进度面板。`open()` 里的回调适合接日志、埋点和全局诊断面板。

## 事件结构 {#event-shape}

诊断事件的类型是 `ViewerDiagnosticEvent`。

```ts
interface ViewerDiagnosticEvent {
  category: 'schema' | 'datasource' | 'viewer' | 'material' | 'print' | 'exporter'
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  nodeId?: string
  detail?: unknown
  scope?: 'schema' | 'datasource' | 'font' | 'material' | 'print' | 'exporter' | 'hook'
  cause?: unknown
}
```

先理解两个字段就够了：

- `category`：这条诊断归到哪类结果。
- `scope`：问题发生在哪个阶段。

例如字体加载失败的 `category` 是 `viewer`，但 `scope` 是 `font`。这样你既能按大类统计，也能按具体阶段过滤。

## Schema 校验 {#schema-validation}

`open()` 一开始会校验 Schema。

```ts
try {
  await viewer.open({ schema, data, onDiagnostic })
}
catch (error) {
  console.error(error)
}
```

校验失败时，Viewer 会先发出一条错误诊断：

```ts
{
  category: 'schema',
  severity: 'error',
  code: 'INVALID_SCHEMA',
  scope: 'schema',
}
```

然后 `open()` 会抛出 `Invalid schema: ...`。这类错误不会继续进入渲染流程。

## 数据绑定 {#data-binding}

绑定解析阶段会把节点上的绑定应用到 `props`。

```ts
await viewer.open({
  schema,
  data,
  onDiagnostic(event) {
    if (event.scope === 'datasource') {
      console.warn(event.nodeId, event.code)
    }
  },
})
```

绑定格式化器可以主动上报诊断。绑定解析本身抛错时，Viewer 会发出 `BINDING_RESOLVE_ERROR`，并回退到节点原始 `props` 继续渲染。

结构化物料的 `data-contract` 解析诊断由物料渲染器转交给 Viewer。例如 chart-bar 在无法解析必填目标字段、record relation 不成立、index relation 无法对齐时，会通过 `context.reportDiagnostic()` 上报 warning。常见 code 包括：

- `MATERIAL_DATA_FIELD_MISSING`：目标模型里的必填字段没有 mapping。
- `MATERIAL_DATA_RECORD_RELATION_UNRESOLVED`：显式要求 record relation，但映射字段无法共享同一个集合。
- `MATERIAL_DATA_RELATION_UNRESOLVED`：自动关系推导失败，无法生成目标 records。
- `CHART_BAR_NO_VALID_POINTS`：chart-bar 已解析 records，但没有可用的数值点。

## 字体加载 {#font-loading}

字体加载失败通常是可恢复问题。

```ts
await viewer.open({
  schema,
  data,
  onDiagnostic(event) {
    if (event.scope === 'font') {
      console.warn(event.code, event.message)
    }
  },
})
```

当前常见诊断码有两个：

- `FONT_LOAD_FAILED`：单个字体加载失败。
- `FONT_LOAD_ERROR`：字体加载流程整体抛错。

它们都是 warning 级别。Viewer 会继续渲染，浏览器会按可用字体回退。

## 物料渲染 {#material-rendering}

物料测量和物料渲染有不同处理。

```ts
viewer.registerMaterial('my-widget', { kind: 'none' }, {
  render() {
    throw new Error('render failed')
  },
})
```

`render()` 抛错时，Viewer 会发出 `MATERIAL_RENDER_ERROR`，并用错误占位内容替代这个节点。整页不会因为一个节点失败而直接中断。

`measure()` 抛错时，Viewer 会发出 `MATERIAL_MEASURE_ERROR`，并跳过这个节点的运行时测量结果。

如果某个物料类型没有注册，当前注册表会渲染一个 `[Unknown: type]` 占位内容。这个路径不会自动发诊断事件。

## 打印与导出 {#print-export}

打印和导出也使用同一套诊断事件。

```ts
await viewer.exportDocument({
  format: 'pdf',
  onDiagnostic(event) {
    console.warn(event.category, event.code)
  },
})
```

常见诊断码包括：

- `NO_PRINT_DRIVER`：指定了不存在的打印驱动。
- `PRINT_RENDER_METRICS_MISSING`：连续纸固定尺寸打印缺少已渲染页面尺寸。
- `PRINT_ERROR`：打印调用或打印驱动失败。
- `NO_EXPORTER`：没有找到匹配导出器。
- `EXPORTER_ERROR`：导出器执行失败。

这些错误默认会通过诊断暴露。传 `throwOnError: true` 时，对应调用会继续抛出错误。

## Hook 错误 {#hook-errors}

Viewer 内部有少量 hook，用来支撑运行时扩展。

```ts
viewer.hooks.diagnosticsEmitted.tap(async () => {
  throw new Error('hook failed')
})
```

如果 `diagnosticsEmitted` hook 自己失败，Viewer 会向 `open()` 注册的诊断回调发出 `DIAGNOSTIC_HOOK_ERROR`。

`beforeSchemaNormalize` 或 `beforePagePlan` 失败时，当前渲染流程会抛出原始错误，并发出对应 hook 错误诊断。

## 接入策略 {#handling-strategy}

我们建议先按严重程度分层处理。

```ts
function handleDiagnostic(event: ViewerDiagnosticEvent) {
  if (event.severity === 'error') {
    reportError(event)
    return
  }

  if (event.severity === 'warning') {
    addToDiagnosticsPanel(event)
  }
}
```

一个可用的默认策略是：

- `error`：进入日志、告警或用户可见反馈。
- `warning`：进入诊断面板、开发环境控制台或调试日志。
- `info`：只做调试辅助。

这样你能看见问题，也不会把字体回退、单节点渲染失败这类可恢复情况都变成整页不可用。

关于诊断系统，目前知道这些就够用了。打印链路的接入细节继续看 [打印与导出](./print-export)。
