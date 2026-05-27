---
description: Viewer Host 模式详解：控制 Viewer 的渲染目标文档、挂载点、样式注入和打印入口。
---

# ViewerHost 模式 {#viewer-hosts}

ViewerHost 解决的是一个很具体的问题：Viewer 到底把页面渲染到哪里。

当前 Host 接口很小，但职责很明确：提供文档对象、挂载点、样式注入能力和打印入口。

## Host 接口 {#host-interface}

先看接口形状：

```ts
interface ViewerHost {
  readonly kind: 'browser' | 'iframe' | 'custom'
  readonly document: Document
  readonly window?: Window
  readonly mount: HTMLElement
  clear: () => void
  appendStyle: (css: string) => () => void
  print: () => void
}
```

Viewer 只通过这些字段操作外部环境。它不会假设自己一定运行在主页面，也不会把 iframe、普通 DOM 和自定义环境混在一起处理。

## Browser Host {#browser-host}

Browser Host 会把页面渲染进当前文档里的一个容器。

```ts
import { createBrowserViewerHost, createViewer } from '@easyink/viewer'

const host = createBrowserViewerHost(containerElement)
const viewer = createViewer({ host })
```

也可以用快捷写法：

```ts
const viewer = createViewer({ container: containerElement })
```

这两段代码等价。`createBrowserViewerHost()` 会使用 `container.ownerDocument` 作为 Host 文档，并把 `container` 作为挂载点。

如果你只是要在当前页面嵌入预览，这种方式最直接。你需要自己确认宿主页面样式不会影响 Viewer 页面。

## Iframe Host {#iframe-host}

Iframe Host 会把页面渲染进 iframe 文档。

```ts
import { createIframeViewerHost, createViewer } from '@easyink/viewer'

const host = createIframeViewerHost(iframeElement)
const viewer = createViewer({ host })
```

同样也有快捷写法：

```ts
const viewer = createViewer({ iframe: iframeElement })
```

当前实现会读取 `iframe.contentDocument`。如果取不到文档，会抛出 `Viewer iframe document is not available`。

拿到文档后，Host 会确认 `body` 存在，并创建或复用一个 `id="easyink-viewer-root"` 的挂载点。

## Custom Host {#custom-host}

当你已经有自己的文档、挂载点或打印入口时，可以自己提供 Host。

```ts
import { createCustomViewerHost, createViewer } from '@easyink/viewer'

const host = createCustomViewerHost({
  document: myDocument,
  window: myWindow,
  mount: myRootElement,
  print: () => {
    myWindow.print()
  },
})

const viewer = createViewer({ host })
```

`print` 是可选的。没有传 `print` 时，Custom Host 会使用默认实现：如果 `window.print` 存在，就调用它；否则打印时会抛出错误。

这种模式适合你要自己控制 DOM 环境或打印行为的场景。

## Host 选择 {#host-choice}

可以按目标来选：

```ts
const previewViewer = createViewer({ iframe: iframeElement })
const inlineViewer = createViewer({ container: containerElement })
const ownedViewer = createViewer({ host: customHost })
```

三种方式都能渲染同一份 Schema。差异在于样式隔离、挂载点归属和打印入口。

- 想把预览和业务页面隔开，选 `iframe`。
- 想直接嵌入当前页面，选 `container`。
- 已经有自己的 DOM 环境或打印入口，选 `host`。

如果你刚开始接入，先用 iframe 通常更省心。等宿主环境的约束明确后，再切换也不晚。

## Host 能力 {#host-capabilities}

Host 除了提供挂载点，还有两个常用方法：

```ts
const host = createIframeViewerHost(iframeElement)

host.clear()

const removeStyle = host.appendStyle(`
  .ei-viewer-page {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  }
`)

removeStyle()
```

`clear()` 会清空当前挂载区域。`appendStyle(css)` 会把样式插入 Host 文档的 `head`，并返回一个移除函数。

这比直接改 Viewer 内部 DOM 更稳。Host 是运行时和外部文档之间的边界，样式注入也应该走这条边界。

关于 Host，目前知道这些就够用了。下一步继续看 [字体加载](./fonts) 或 [打印与导出](./print-export)。
