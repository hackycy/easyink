---
description: '@easyink/viewer 是独立的渲染运行时，接收 Schema 和数据，负责预览、分页、打印和导出入口。'
---

# Viewer {#viewer}

`@easyink/viewer` 是 EasyInk 的消费端运行时。它接收一份 Schema 和一份运行时数据，然后完成校验、绑定、布局、分页和 DOM 渲染。

如果 Designer 解决的是“怎么编辑模板”，Viewer 解决的就是“怎么把这份模板跑起来”。

## 最小用法 {#basic-usage}

先看一段最小代码：

```ts
import { materials } from '@easyink/builtin/all/viewer'
import { createViewer } from '@easyink/viewer'

const viewer = await createViewer({
  iframe: iframeElement,
  materials,
})

await viewer.open({
  schema: documentSchema,
  data: {
    title: 'Hello EasyInk',
  },
})

await viewer.destroy()
```

这段代码做了三件事：

- `createViewer({ iframe, materials })` 创建运行时，并在创建阶段安装完整物料集合。
- `open({ schema, data })` 校验 Schema、归一化 Schema，然后渲染页面。
- `destroy()` 清理当前 Host 挂载内容、物料资源和字体缓存。

Viewer 不会自动内置官方物料；如果模板使用内置物料，需要在创建时从 `@easyink/builtin/all/viewer` 或 `@easyink/builtin/basic/viewer` 选择完整 Viewer 物料集合。自定义物料也通过同一个 `materials` 数组传入。

## 创建 Viewer {#create-viewer}

`createViewer()` 接收一个 `ViewerOptions` 对象。

```ts
const iframeViewer = await createViewer({ iframe: iframeElement, materials })
const domViewer = await createViewer({ container: containerElement, materials })
const customViewer = await createViewer({ host, materials })
```

常用选项是这几个：

| 选项 | 作用 |
| --- | --- |
| `iframe` | 快捷创建 Iframe Host |
| `container` | 快捷创建 Browser Host |
| `host` | 传入你自己创建的 `ViewerHost` |
| `materials` | 创建时选择的完整 Viewer 物料声明 |
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

if (result.status === 'completed') {
  console.log(result.pages)
  console.log(result.thumbnails)
  console.log(result.diagnostics)
}
```

当前实现的渲染流程是：

```text
校验 Schema
  -> 归一化 Schema
  -> 加载字体
  -> 解析绑定
  -> 测量需要运行时尺寸的物料
  -> 布局和分页
  -> 复制每页重复元素
  -> 渲染页面 DOM
```

`render()` 返回 `ViewerRenderResult`：

```ts
type ViewerRenderResult = {
  status: 'completed'
  requestId: number
  pages: ViewerPageResult[]
  thumbnails: ThumbnailResult[]
  diagnostics: ViewerDiagnosticEvent[]
} | {
  status: 'cancelled'
  requestId: number
  reason: 'superseded' | 'document-changed' | 'destroyed'
}
```

完成时 `pages` 带页面尺寸、元素数量和页面 DOM，`thumbnails` 是基于页面结果生成的 SVG data URL。后续请求或销毁导致取消时先检查 `status`；整体失败则拒绝 Promise。

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

const result = await viewer.exportDocument({
  format: 'pdf',
  entry: 'preview',
})
if (result.status === 'completed') {
  console.log(result.file, result.diagnostics)
}
```

这里有两个前提要分清：

- `print()` 不传 `driverId` 时走浏览器打印。
- `exportDocument()` 需要先注册能处理对应 `format` 的导出器。

如果你只传字符串，`exportDocument('pdf')` 等价于指定 `format: 'pdf'`，并使用默认入口 `entry: 'api'`。

完整用法继续看 [打印与导出](./print-export)。

## 选择物料 {#select-materials}

Viewer 在创建时一次性接收完整物料声明。每个声明同时提供共享 `model` 和 Viewer `renderer`（或异步 `loadRenderer`），不能在创建后再补注册。

```ts
import { materials as builtinMaterials } from '@easyink/builtin/all/viewer'
import { badge } from './materials/badge/viewer'

const viewer = await createViewer({
  container: containerElement,
  materials: [...builtinMaterials, badge],
})
```

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
await viewer.destroy()
```

`destroy()` 会把实例标记为已销毁，清理当前 Schema、数据、物料资源、打印驱动、导出器、字体缓存和 Host 挂载内容。应用更换物料集合时，应先 `await destroy()`，再创建新的 Viewer。

关于 Viewer，目前知道这些就够用了。接下来可以继续看：

- [ViewerHost 模式](./viewer-hosts)
- [字体加载](./fonts)
- [打印与导出](./print-export)
- [诊断系统](./diagnostics)
