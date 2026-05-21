# 诊断系统

Viewer 通过统一的诊断机制报告问题，不会静默吞掉错误。所有错误路径都经过诊断系统，确保问题可见。

## 订阅诊断事件

```ts
await viewer.open({
  schema,
  data,
  onDiagnostic: (event) => {
    console.warn(`[${event.severity}] [${event.scope}] ${event.code}: ${event.message}`)
  },
})
```

## ViewerDiagnosticEvent

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

| 字段 | 说明 |
|------|------|
| `category` | 问题所属模块 |
| `severity` | 严重程度 |
| `code` | 错误码，用于程序化处理 |
| `message` | 可读消息，用于展示 |
| `nodeId` | 关联的元素 ID（如有） |
| `detail` | 附加信息 |
| `scope` | 诊断来源阶段，字体加载使用 `scope: 'font'` |
| `cause` | 原始错误对象 |

## 常见诊断场景

### Schema 校验

Schema 格式错误或缺少必要字段时触发。

### 数据绑定

绑定格式化或绑定投影失败时触发。Viewer 不接收 `dataSources`，也不根据数据源描述符匹配运行时数据。

### 字体加载

字体加载失败时触发，通常 `severity` 为 `warning`。当前实现里字体加载诊断使用 `category: 'viewer'` 和 `scope: 'font'`，`category` 本身不包含 `font`。

### 物料渲染

物料渲染器抛出异常时，Viewer 会：
1. 记录 `error` 级别诊断事件
2. 渲染一个带红色虚线边框的错误占位符
3. 占位符包含警告符号和 `[type]` 文本

`safeRender()` 根据 `scope` 生成诊断。`scope: 'material'` 的渲染错误当前会归到 `category: 'viewer'`，同时保留 `scope: 'material'` 供调用方区分阶段。

### 打印/导出

打印或导出过程中的错误。

## 内部机制

### safeRender

包装同步渲染函数，捕获异常后记录诊断并返回错误占位符：

```ts
// 内部使用
const result = safeRender(
  () => extension.render(node, context),
  { scope: 'material', code: 'RENDER_ERROR', nodeId: node.id, placeholderHtml },
  diagnostics,
)

if (isErrorSentinel(result)) {
  // 使用占位符 HTML
}
```

### safeCall

包装异步操作，捕获异常后记录诊断并重新抛出：

```ts
await safeCall(
  async () => { /* 异步操作 */ },
  { scope: 'font', code: 'FONT_LOAD_ERROR' },
  diagnostics,
)
```

### emitDiagnostic

记录诊断事件但不抛出异常，用于非致命问题：

```ts
emitDiagnostic(diagnostics, {
  category: 'datasource',
  severity: 'warning',
  code: 'MISSING_FIELD',
  message: `Field "${path}" not found in data`,
  nodeId: node.id,
})
```

## 在打印和导出中使用

打印和导出操作也支持诊断回调：

```ts
await viewer.print({
  driverId: 'browser',
  onDiagnostic: (event) => {
    if (event.severity === 'warning') {
      showToast(event.message)
    }
  },
})
```
