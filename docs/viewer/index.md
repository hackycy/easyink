---
description: '@easyink/viewer 是独立的渲染运行时，支持预览、分页、打印和导出，只依赖 Schema 和数据输入。'
---

# Viewer

`@easyink/viewer` 是 EasyInk 的消费端运行时。它接收一份 Schema 和一份运行时数据，然后完成校验、绑定、渲染、分页、打印和导出。

如果 Designer 解决的是“怎么编辑模板”，Viewer 解决的就是“怎么把这份模板真正跑起来”。

## 最小用法

```ts
import { createViewer } from '@easyink/viewer'

const viewer = createViewer({ iframe: iframeElement })

await viewer.open({
  schema: documentSchema,
  data: {
    title: 'Hello EasyInk',
  },
})

viewer.destroy()
```

这段代码已经展示了 Viewer 最关键的接口：`createViewer()` 和 `open({ schema, data })`。

## `createViewer()` 参数

当前 Viewer 运行时最常用的输入有这些：

| 选项 | 作用 |
| --- | --- |
| `host` | 直接传一个 `ViewerHost` |
| `container` | 快捷创建 Browser Host |
| `iframe` | 快捷创建 Iframe Host |
| `fontProvider` | 提供字体目录和字体资源 |

如果你没有特别强的自定义需求，直接传 `iframe` 或 `container` 就够了。

## Iframe Host

先看最常见的写法：

```ts
const viewer = createViewer({ iframe: iframeElement })
```

这样做的好处很直接：Viewer 会在 iframe 里创建自己的渲染根节点，样式隔离也更干净。

如果你只是想先在页面里内嵌预览，这是默认推荐路径。

## `open()` 流程

调用 `open()` 之后，Viewer 不只是“把 DOM 画出来”。

它的主流程大致是：

```text
校验 schema
  -> 归一化 schema
  -> 加载字体
  -> 解析绑定
  -> 测量需要运行时扩展的元素
  -> 布局和分页
  -> 渲染页面 DOM
```

所以如果你看到 `viewer.open()` 是一个异步方法，不要惊讶。它背后确实做了完整的一轮渲染准备。

## 输入契约

这点很重要，而且值得反复强调一次：Viewer 只接收 `schema + data`。

```ts
await viewer.open({
  schema,
  data: {
    customer: { name: 'Ada' },
    items: [{ name: 'Paper', qty: 2 }],
  },
})
```

Designer 里的 `dataSources` 不会传进来。运行时绑定解析只看节点上的 `fieldPath`，再从你提供的 `data` 根对象里取值。

如果你的业务数据来自多个接口，先在宿主层把它们整形成模板能直接命中的结构，再交给 Viewer。

## 数据更新与重渲染

当模板不变、数据变了时，不需要重新创建实例。

```ts
await viewer.updateData({
  title: 'Updated Title',
})
```

如果你已经自己改了内部数据，或者想显式再跑一轮渲染，也可以直接调用：

```ts
const result = await viewer.render()
console.log(result.pages)
console.log(result.thumbnails)
console.log(result.diagnostics)
```

这很适合做预览刷新、调试输出或自定义宿主包装。

## 打印与导出

Viewer 自己就带打印和导出入口，但两者的使用方式稍微不同。

先看调用：

```ts
await viewer.print({
  pageSizeMode: 'fixed',
})

const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'preview',
})
```

这里需要先知道两件事：

- `print()` 默认走浏览器打印。
- `exportDocument()` 需要先注册对应格式的导出器。

如果这些概念现在看起来有点多，没关系。后面单独的打印与导出页面会拆开讲。

## 物料渲染器注册

Viewer 允许你为某个 `type` 注册自定义渲染器。

```ts
import { trustedViewerHtml } from '@easyink/core'

viewer.registerMaterial('my-widget', {
  render(node, context) {
    return {
      html: trustedViewerHtml('<div>Custom Widget</div>'),
    }
  },
  measure(node) {
    return {
      width: node.width,
      height: node.height,
    }
  },
})
```

这里最值得记住的是 `trustedViewerHtml()`。当前接口要求你显式标记这是可信的 Viewer HTML，而不是直接返回裸字符串。

## 自定义打印驱动与导出器

先看形状：

```ts
viewer.registerPrintDriver({
  id: 'thermal-printer',
  async print(context) {
    console.log(context.printPolicy)
    console.log(context.renderedPages)
  },
})

viewer.registerExporter({
  id: 'pdf-exporter',
  format: 'pdf',
  async export(context) {
    console.log(context.container)
    return new Blob()
  },
})
```

如果你已经有现成的本地打印服务或导出链路，这两个接口就是你和 Viewer 之间的桥。

## 生命周期清理

Viewer 是运行时实例，不是纯函数。

所以组件卸载或页面离开时，记得显式销毁：

```ts
viewer.destroy()
```

这一步会清理内部状态、打印驱动、导出器、字体缓存和当前 host 挂载内容。

关于 Viewer，目前先知道这些就够用了。熟悉之后继续读：

- [ViewerHost 模式](./viewer-hosts)
- [打印与导出](./print-export)
- [字体加载](./fonts)
- [诊断系统](./diagnostics)
