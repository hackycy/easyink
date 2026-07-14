---
description: '@easyink/viewer 是独立的渲染运行时，接收 Schema 和数据，负责预览、分页、打印和导出入口。'
---

# Viewer {#viewer}

`@easyink/viewer` 是 EasyInk 的消费端运行时。它接收一份 Schema 和一份运行时数据，然后完成校验、绑定、布局、分页和 DOM 渲染。

如果 Designer 解决的是“怎么编辑模板”，Viewer 解决的就是“怎么把这份模板跑起来”。

## 最小用法 {#basic-usage}

先看一段最小代码：

```ts
import { compileBuiltinMaterialProfile } from '@easyink/builtin/all'
import { createViewer } from '@easyink/viewer'

const profile = compileBuiltinMaterialProfile('all')
const viewer = createViewer({ iframe: iframeElement, profile })

await viewer.open({
  schema: documentSchema,
  data: {
    title: 'Hello EasyInk',
  },
})

viewer.destroy()
```

这段代码做了三件事：

- `compileBuiltinMaterialProfile('all')` 编译不可变内置物料 profile。
- `createViewer({ iframe, profile })` 创建运行时，并把渲染目标放进 iframe。
- `open({ schema, data })` 通过 profile admission 加载文档，然后进入 Viewer 管线。
- `destroy()` 清理当前 Host 挂载内容、facet runtime 和字体缓存。

Viewer 不会隐式选择官方物料集合；模板使用哪些物料由创建时传入的 compiled profile 决定。

## 创建 Viewer {#create-viewer}

`createViewer()` 接收一个 `ViewerOptions` 对象。

```ts
const iframeViewer = createViewer({ iframe: iframeElement, profile })
const domViewer = createViewer({ container: containerElement, profile })
const customViewer = createViewer({ host, profile })
```

常用选项是这几个：

| 选项 | 作用 |
| --- | --- |
| `profile` | 必填的不可变 `CompiledMaterialProfile` |
| `iframe` | 快捷创建 Iframe Host |
| `container` | 快捷创建 Browser Host |
| `host` | 传入你自己创建的 `ViewerHost` |
| `fontProvider` | 提供字体目录和字体资源 |

`iframe` 和 `container` 都只是快捷写法。它们最终都会变成一个 `ViewerHost`，再交给运行时使用。

Host 的差异单独看 [ViewerHost 模式](./viewer-hosts)。

## 打开文档 {#open-document}

`open()` 的输入只有 `schema + data`。

```ts
await viewer.open({
  schema,
  data: {
    customer: { name: 'Ada' },
    items: [
      { name: 'Paper', qty: 2 },
      { name: 'Ink', qty: 1 },
    ],
  },
  onDiagnostic(event) {
    console.warn(event.code, event.message)
  },
})
```

这段代码会把 `data` 存到 Viewer 运行时里。后续绑定解析会按节点上的 `fieldPath`，从这个 `data` 根对象取值。

Designer 里的 `dataSources` 不会传给 Viewer。它们是设计态字段树，不是运行时输入。

## 渲染流程 {#render-flow}

`open()` 在有 Host 时会自动调用 `render()`。

```ts
const result = await viewer.render()

console.log(result.pages)
console.log(result.thumbnails)
console.log(result.diagnostics)
```

当前实现的渲染流程是：

```text
compiled profile -> document admission -> effective output
  -> facet activation / runtime model resolution
  -> resource readiness -> MeasureService -> MaterialLayoutPlan
  -> document layout -> core pagination -> page overlays
  -> ViewerRenderTree / imperative host -> browser DOM
```

`render()` 返回 `ViewerRenderResult`：

```ts
interface ViewerRenderResult {
  pages: ViewerPageResult[]
  thumbnails: ThumbnailResult[]
  diagnostics: ViewerDiagnosticEvent[]
}
```

`pages` 里会带页面尺寸、元素数量和页面 DOM。`thumbnails` 是基于页面结果生成的 SVG data URL。

## 更新数据 {#update-data}

模板不变、数据变了时，不需要重新创建 Viewer。

```ts
await viewer.updateData({
  title: 'Updated Title',
})
```

如果当前 Viewer 有 Host，而且已经打开过 Schema，`updateData()` 会直接触发一次重新渲染。

如果你想显式拿到渲染结果，也可以调用 `render()`：

```ts
await viewer.updateData(nextData)
const result = await viewer.render()
```

两种方式都能完成刷新。区别只是你要不要立刻消费 `pages`、`thumbnails` 和 `diagnostics`。

## 打印与导出入口 {#print-export-entry}

Viewer 提供打印和导出的运行时入口。

```ts
await viewer.print()

const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'preview',
})
```

这里有两个前提要分清：

- `print()` 不传 `driverId` 时走浏览器打印。
- `exportDocument()` 需要先注册能处理对应 `format` 的导出器。

如果你只传字符串，`exportDocument('pdf')` 等价于指定 `format: 'pdf'`，并使用默认入口 `entry: 'api'`。

完整用法继续看 [打印与导出](./print-export)。

## 配置物料 profile {#register-material}

Viewer 运行时不接受可变物料注册。自定义物料要先发布 manifest，再把 manifest 所在的物料包编译进 profile：

```ts
import { compileMaterialProfile, EASYINK_ENGINE_VERSION } from '@easyink/core'

const profile = compileMaterialProfile({
  id: 'acme-viewer',
  engineVersion: EASYINK_ENGINE_VERSION,
  packages: [{
    packageId: '@acme/easyink-materials',
    kind: 'external',
    required: true,
    manifests: [myWidgetMaterialManifest],
  }],
})
```

manifest 的 Viewer facet 通过 `MaterialViewerExtension.render()` 返回 `ViewerRenderTree`；需要内容驱动尺寸时，通过 `MaterialViewerLayoutFacet.measure(request)` 发布 `MaterialLayoutPlan`。运行时只激活 compiled profile 中的 facet。

自定义物料的完整开发方式继续看 [自定义物料开发](/advanced/custom-materials)。

## 注册打印驱动和导出器 {#register-print-export}

打印驱动和导出器都是挂到当前 Viewer 实例上的。

```ts
viewer.registerPrintDriver({
  id: 'thermal-printer',
  async print(context) {
    console.log(context.printPolicy)
    console.log(context.renderedPages)
    console.log(context.container)
  },
})

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

同一个 `id` 重复注册时，后注册的驱动或导出器会替换前一个。

如果你已经有本地打印服务、远程网关或导出链路，这两个接口就是接入点。协议细节继续看 [打印与导出](./print-export)。

## 生命周期清理 {#lifecycle}

Viewer 是有状态运行时。组件卸载或页面离开时，我们建议你显式销毁。

```ts
viewer.destroy()
```

`destroy()` 会把实例标记为已销毁，清理当前 Schema、数据、物料注册表、打印驱动、导出器、字体缓存和 Host 挂载内容。

关于 Viewer，目前知道这些就够用了。接下来可以继续看：

- [ViewerHost 模式](./viewer-hosts)
- [字体加载](./fonts)
- [打印与导出](./print-export)
- [诊断系统](./diagnostics)
