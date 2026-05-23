# Viewer

[![npm](https://img.shields.io/npm/v/@easyink/viewer?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/viewer)

`@easyink/viewer` 是一个独立的文档预览引擎。接收 Schema + 数据，产出渲染后的页面 DOM、缩略图、打印和导出能力。可独立于 Designer 使用。

## 基本用法

```ts
import { createIframeViewerHost, createViewer } from '@easyink/viewer'

// 1. 创建 Host（决定渲染在哪里）
const host = createIframeViewerHost(iframeElement)

// 2. 创建 Viewer 运行时
const viewer = createViewer({ host })

// 3. 打开文档
await viewer.open({
  schema: documentSchema,
  data: { title: 'Hello', items: [...] },
})

// 4. 使用完毕后销毁
viewer.destroy()
```

## ViewerOptions

`createViewer(options)` 接受的配置项：

| 选项 | 类型 | 说明 |
|------|------|------|
| `mode` | `'fixed' \| 'continuous'` | 兼容选项；实际页面介质以 `schema.page.mode` 为准 |
| `host` | `ViewerHost` | 渲染宿主，通过 factory 函数创建 |
| `container` | `HTMLElement` | 快捷方式，等同于 `createBrowserViewerHost(container)` |
| `iframe` | `HTMLIFrameElement` | 快捷方式，等同于 `createIframeViewerHost(iframe)` |
| `fontProvider` | `FontProvider` | 自定义字体加载器；Viewer 会在渲染前加载并注入字体 |

## ViewerHost

Host 决定 Viewer 在哪里渲染。三种模式：

### Browser Host

直接渲染到当前页面的 DOM 容器中。

```ts
import { createBrowserViewerHost, createViewer } from '@easyink/viewer'

const host = createBrowserViewerHost(document.getElementById('viewer-root'))
const viewer = createViewer({ host })
```

### Iframe Host

渲染到 iframe 内部，实现样式和脚本完全隔离。**推荐方式**。

```ts
import { createIframeViewerHost, createViewer } from '@easyink/viewer'

const host = createIframeViewerHost(iframeElement)
const viewer = createViewer({ host })
```

### Custom Host

完全自定义 document、window、mount 点和打印行为。

```ts
import { createCustomViewerHost, createViewer } from '@easyink/viewer'

const host = createCustomViewerHost({
  document: myDocument,
  window: myWindow,
  mount: myRootElement,
  print: () => { /* 自定义打印逻辑 */ },
})
const viewer = createViewer({ host })
```

## ViewerRuntime API

### open(input)

打开文档，触发完整的渲染流程。

```ts
await viewer.open({
  schema: documentSchema,           // DocumentSchema
  data: { title: 'Hello' },        // 运行时数据
  onDiagnostic: (event) => {       // 诊断事件回调
    console.warn(`[${event.severity}] ${event.code}: ${event.message}`)
  },
})
```

渲染流程：字体加载 -> 数据绑定 -> 元素测量 -> layout/reflow -> pagination -> DOM 渲染。

字体加载发生在测量和分页之前。Viewer 会收集 `schema.page.font`、元素 `props.fontFamily` 以及 schema traversal 能访问到的 hosted elements 字体引用，加载成功后注入到 Host document。完整说明见 [字体加载](./fonts.md)。

### render()

手动触发重新渲染，返回渲染结果。

```ts
const result = await viewer.render()
// result.pages     -- 页面信息数组
// result.thumbnails -- SVG 缩略图数组
// result.diagnostics -- 诊断事件数组
```

### updateData(data)

更新数据并重新渲染。

```ts
await viewer.updateData({ title: 'Updated Title' })
```

### print(options)

打印当前文档。

```ts
await viewer.print({
  driverId: 'browser',           // 打印驱动 ID
  pageSizeMode: 'driver',        // 'driver'（按打印机介质）或 'fixed'（按模板尺寸）
  throwOnError: true,
  onPhase: (event) => { /* 阶段回调 */ },
  onProgress: (progress) => { /* 进度回调 */ },
  onDiagnostic: (event) => { /* 诊断回调 */ },
})
```

### exportDocument(options)

导出文档为 Blob。

```ts
const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'preview',
  throwOnError: true,
  onPhase: (event) => { /* 阶段回调 */ },
  onProgress: (progress) => { /* 进度回调 */ },
})
```

### destroy()

销毁运行时，清理所有状态和 DOM。

```ts
viewer.destroy()
```

## 注册扩展

### 自定义物料渲染器

```ts
import { trustedViewerHtml } from '@easyink/core'

viewer.registerMaterial('my-widget', {
  render(node, context) {
    return { html: trustedViewerHtml('<div class="my-widget">...</div>') }
  },
  measure(node, context) {
    return { width: node.width, height: 100 }
  },
  pageAware: false,
})
```

完整的自定义物料开发还涉及 Designer 注册、属性面板、数据绑定和调试，见 [进阶 / 自定义物料开发](/advanced/custom-materials)。

### 自定义导出插件

```ts
viewer.registerExporter({
  id: 'my-pdf-exporter',
  format: 'pdf',
  async export(context) {
    // context.renderedPages -- 已渲染的页面 DOM
    // context.container    -- 容器元素
    // context.schema       -- 文档 Schema
    // context.data         -- 运行时数据
    return blob // 返回 Blob
  },
})
```

### 自定义打印驱动

```ts
viewer.registerPrintDriver({
  id: 'thermal-printer',
  async print(context) {
    // context.renderedPages -- 已渲染的页面 DOM
    // context.printPolicy   -- 打印策略
    // context.container     -- 容器元素
  },
})
```

## 数据输入契约

Viewer 只接收 `schema + data`，不接收 Designer 的 `dataSources`。宿主需要在调用 `viewer.open()` 前完成数据加载、权限过滤、接口聚合和字段结构整理。

绑定解析只按 `BindingRef.fieldPath` 从传入的 `data` 根对象取值；`sourceId`、`sourceName`、`sourceTag` 是模板里的设计时引用元数据，不参与 Viewer 的数据匹配、评分或分包。

```ts
await viewer.open({
  schema,
  data: {
    customer: { name: 'Ada' },
    items: [{ name: 'Paper', qty: 2 }],
  },
})
```

如果业务确实存在多来源数据，宿主应先把它们组合成模板 `fieldPath` 能直接命中的结构，或在打开 Viewer 前转换 Schema 中的绑定路径。Viewer 不根据数据源描述符猜测来源。

## 数据绑定

Viewer 在渲染时自动解析 Schema 中的数据绑定。绑定通过 `BindingRef.fieldPath` 引用运行时数据中的字段路径。

```ts
// Schema 中的元素绑定示例
{
  type: 'text',
  props: { content: '默认文本' },
  binding: {
    sourceId: 'order',
    fieldPath: 'customer/name',
  },
}
```

渲染时，Viewer 会将 `data.customer.name` 的值替换到元素的 `content` 属性上。

## 诊断系统

Viewer 通过统一的诊断机制报告问题，不会静默吞掉错误。

```ts
await viewer.open({
  schema,
  data,
  onDiagnostic: (event) => {
    // event.category  -- 'schema' | 'datasource' | 'viewer' | 'material' | 'print' | 'exporter'
    // event.scope     -- 'schema' | 'datasource' | 'font' | 'material' | 'print' | 'exporter' | 'hook'
    // event.severity  -- 'error' | 'warning' | 'info'
    // event.code      -- 错误码
    // event.message   -- 可读消息
    // event.nodeId    -- 关联的元素 ID（可选）
  },
})
```

## CSS 引入

如果使用 `@easyink/viewer` 独立渲染（不通过 Designer），需要确保页面有基础样式。Viewer 的 DOM 结构使用 `ei-viewer-page` 和 `ei-viewer-element` 作为 CSS 类名。
