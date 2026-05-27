---
description: Viewer Host 模式详解：控制 Viewer 的渲染目标文档、挂载点、样式注入和打印入口。
---

# ViewerHost 模式

ViewerHost 解决的是一个很具体的问题：Viewer 到底要把页面渲染到哪里。

当前实现里，Host 接口很小，但职责很明确：提供文档对象、挂载点、样式注入能力和打印入口。

## Host 接口

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

如果你看到这里已经有点眉目了，没错，Host 本质上就是把 Viewer 运行时和具体 DOM 环境隔开。

## Browser Host

这是最直接的模式。Viewer 就渲染在当前页面某个容器里。

```ts
import { createBrowserViewerHost, createViewer } from '@easyink/viewer'

const host = createBrowserViewerHost(container)
const viewer = createViewer({ host })
```

如果你不想自己先创建 Host，也可以直接走快捷写法：

```ts
const viewer = createViewer({ container })
```

这种模式上手最快，但要自己承担宿主样式和 Viewer 样式互相影响的风险。

## Iframe Host

这是最推荐的模式，也是业务里最常见的模式。

```ts
import { createIframeViewerHost, createViewer } from '@easyink/viewer'

const host = createIframeViewerHost(iframeElement)
const viewer = createViewer({ host })
```

同样也有快捷写法：

```ts
const viewer = createViewer({ iframe: iframeElement })
```

当前实现会在 iframe 文档里确认 `body` 存在，然后创建或复用一个 `id='easyink-viewer-root'` 的挂载点。

这也是为什么 iframe 模式通常更省心。它直接把预览和宿主页面隔开了。

## Custom Host

当你已经有自己的文档环境时，可以自己提供 Host。

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

这适合 Shadow DOM、特殊容器，或者你要完全接管打印行为的场景。

## Host 选择

可以直接按这个规则选：

- 想最稳地做业务预览，选 `iframe`
- 只是本页嵌入一下，且能接受样式共存，选 `container`
- 已经有特殊宿主环境，选 `custom`

如果你还没有很强的约束，先用 iframe 就对了。

## Host 能力

除了挂载点本身，Host 还有两个很实用的方法：

- `clear()`：清空当前挂载区域
- `appendStyle(css)`：往当前 Host 的文档里注入样式，并拿到一个移除函数

例如在 iframe 里加一层预览外观：

```ts
const host = createIframeViewerHost(iframeElement)

host.document.body.style.margin = '0'
host.document.body.style.background = '#e5e7eb'

const removeStyle = host.appendStyle(`
  .ei-viewer-page {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  }
`)

removeStyle()
```

这比去操作 Viewer 内部 DOM 结构更稳，也更符合 Host 的职责边界。

关于 Host，目前知道这些就够用了。下一步最适合继续看 [打印与导出](./print-export)。
