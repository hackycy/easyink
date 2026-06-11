---
description: LODOP/C-Lodop 集成：支持托管 Viewer 打印 EasyInk 模板，也支持直接打印 HTML 和 base64 图片。
---

# LODOP {#lodop}

LODOP 集成适合已经部署 `LODOP` 或 `C-Lodop` 控件的浏览器项目。

先看高层打印器：

```ts
import { registerBuiltinViewerMaterials } from '@easyink/builtin/all'
import { createLodopClient, createLodopPrinter } from '@easyink/print-integration-lodop'

const client = createLodopClient({
  script: {
    src: 'http://localhost:8000/CLodopfuncs.js',
  },
})

const printer = createLodopPrinter({
  client,
  viewer: 'iframe',
  setupViewer(viewer) {
    registerBuiltinViewerMaterials((type, binding, extension) => {
      viewer.registerMaterial(type, binding, extension)
    })
  },
})

await client.useDefaultPrinter()
await printer.print({ schema, data })
```

这段代码会创建托管 Viewer，把 `schema + data` 渲染成页面，再把每一页序列化成 HTML 交给 LODOP。

如果你的业务已经有 HTML，也可以直接打印：

```ts
await client.printHtml({
  html: '<main class="receipt">Hello LODOP</main>',
  width: 80,
  height: 120,
  printerName: 'XP-80C',
})
```

这条路径不会创建 Viewer。你负责提供 HTML 和页面尺寸，集成负责调用 LODOP 的 HTML 打印能力。

## 工作链路 {#pipeline}

LODOP 路径不是 PDF 上传路径。它的链路是：

```text
schema + data -> 托管 Viewer -> 页面 HTML
HTML -> LODOP ADD_PRINT_HTM/ADD_PRINT_HTML -> 系统打印机
```

实现里 `createLodopDriver()` 会读取 Viewer 页面尺寸，并调用客户端的 `printPages()`。官方 `LodopClient` 会逐页调用 `printHtml()`，再通过 LODOP runtime 提交打印任务。

也就是说，`printHtml()` 是底层能力，高层打印器只是复用了它。

## 默认纸张策略 {#paper-policy}

LODOP 高层打印器默认使用 `pageSizeMode: 'driver'`，同时 `LodopClient` 默认会把页面尺寸下发给 LODOP。

```ts
await printer.print({
  schema,
  data,
})
```

这表示 Viewer 会按打印驱动模式准备页面，LODOP 提交任务时会调用 `SET_PRINT_PAGESIZE`。对需要固定模板尺寸的单据，这个默认值更直接。

如果你想完全使用打印机驱动当前纸张，可以关闭：

```ts
await printer.print({
  schema,
  data,
  forcePageSize: false,
})
```

关闭后，集成仍会把页面 HTML 交给 LODOP，但不会主动设置纸张尺寸。

## 图片打印 {#image-print}

LODOP 集成也支持直接打印 base64 图片：

```ts
await client.printBase64Image('data:image/png;base64,...', {
  width: 80,
  height: 120,
  printerName: 'XP-80C',
  stretch: 2,
})
```

这会调用 LODOP 的 `ADD_PRINT_IMAGE`。`width` 和 `height` 的单位是毫米，`stretch` 会透传为图片项的拉伸方式。

如果你只需要打印一张已生成的图片，不需要先走 Viewer。

## Script 管理 {#script-management}

你可以让 EasyInk 管理 `CLodopfuncs.js`：

```ts
const client = createLodopClient({
  script: {
    src: 'http://localhost:8000/CLodopfuncs.js',
    timeoutMs: 8000,
  },
})
```

也可以让业务自己引入 script：

```html
<script src="http://localhost:8000/CLodopfuncs.js"></script>
```

```ts
const client = createLodopClient({
  script: false,
})
```

两种方式都能完成你的目标。前者适合把加载、超时和重试放进 SDK；后者适合你的项目已经有统一的资源加载策略。

## 多 runtime 名称 {#runtime-name}

C-Lodop 支持在 script URL 上加 `name`，把 runtime 挂到不同的全局变量上：

```html
<script src="http://localhost:8000/CLodopfuncs.js?name=CLODOPA"></script>
```

SDK 托管加载时也能这样写：

```ts
const client = createLodopClient({
  script: {
    src: 'http://localhost:8000/CLodopfuncs.js',
    name: 'CLODOPA',
  },
})
```

如果 script 由业务引入，就把 `runtimeName` 告诉客户端：

```ts
const client = createLodopClient({
  script: false,
  runtimeName: 'CLODOPA',
})
```

这样多个 LODOP runtime 共存时，EasyInk 会读取你指定的那个。

## 适用场景 {#use-cases}

如果你的项目符合下面任一条件，LODOP 会比较顺手：

- 已经部署 `LODOP` 或 `C-Lodop`。
- 浏览器前端需要直接调用本地打印控件。
- 业务已经能产出 HTML 或 base64 图片，只需要送到本地打印机。
- 你希望使用 LODOP 原有的预览、打印设置或设计窗口。

如果你的场景更像 Windows 正式单据、A4 报表，或者你更想走 PDF 上传路径，先看 [EasyInk Printer](/dotnet/)。

关于 LODOP 的整体边界，目前知道这些就够了。下一步继续看 [快速上手](/lodop/getting-started)。
