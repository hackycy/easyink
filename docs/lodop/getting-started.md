---
description: LODOP 快速上手：加载 C-Lodop script，验证打印机列表，用托管 Viewer、HTML 或 base64 图片打印第一张单。
---

# LODOP 快速上手 {#getting-started}

这页只做一件事：让 LODOP 路径先打出第一张单。

## 检查 runtime {#check-runtime}

LODOP 集成依赖本机 `LODOP` 或 `C-Lodop` runtime。先确认 script 地址能访问：

```text
http://localhost:8000/CLodopfuncs.js
```

C-Lodop 有些环境会使用另一个端口：

```text
http://localhost:18000/CLodopfuncs.js
```

如果这一层没起来，后面的模板、Viewer 和打印参数都不会真的进入打印链路。

## 安装包 {#install}

安装前端集成包：

```bash
pnpm add @easyink/print-integration-lodop @easyink/builtin
```

这个包不内置 LODOP 控件。它负责加载 `CLodopfuncs.js`、等待 runtime 可用，并把 EasyInk 渲染结果提交给 LODOP。

## 验证打印机 {#verify-printers}

先只加载 script 和刷新打印机：

```ts
import { createLodopClient } from '@easyink/print-integration-lodop'

const client = createLodopClient({
  script: {
    src: 'http://localhost:8000/CLodopfuncs.js',
    timeoutMs: 8000,
  },
})

await client.ready()

const printers = await client.listPrinters()
console.log(printers)
```

`listPrinters()` 会在需要时自动等待 runtime。这里显式调用 `ready()` 是为了让第一步排查更清楚。

如果 `printers` 是空数组或直接报错，先排查 LODOP 服务和系统打印机，不要急着改模板。

## 打印第一张单 {#first-print}

打印器创建后，业务侧只需要传 `schema + data`：

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

await printer.print({
  schema,
  data,
})
```

这段代码会自动创建托管 Viewer，渲染完成后逐页提交给 LODOP。默认会按模板页面尺寸调用 `SET_PRINT_PAGESIZE`。

## 指定打印参数 {#print-options}

打印机、份数和纸张策略可以在单次打印里传：

```ts
await printer.print({
  schema,
  data,
  printerName: 'XP-80C',
  copies: 2,
  forcePageSize: false,
})
```

`forcePageSize: false` 会让 LODOP 使用打印机驱动当前纸张。如果你的模板尺寸必须精确下发，保持默认值就行。

## 管理 script 加载 {#script-loading}

SDK 可以直接管控 script 引入：

```ts
const client = createLodopClient({
  script: {
    src: 'http://localhost:8000/CLodopfuncs.js',
    timeoutMs: 8000,
  },
})
```

如果你希望 SDK 按默认端口尝试，可以简写：

```ts
const client = createLodopClient({
  script: true,
})
```

默认会依次尝试 `http://localhost:8000/CLodopfuncs.js` 和 `http://localhost:18000/CLodopfuncs.js`。

## 业务自行引入 script {#external-script}

如果你的项目已经统一管理 script，就让客户端只等待 runtime：

```html
<script src="http://localhost:8000/CLodopfuncs.js"></script>
```

```ts
const client = createLodopClient({
  script: false,
})

await client.ready()
```

这种方式不会再插入新的 `<script>`。`client.ready()` 只负责确认全局 LODOP runtime 已经可用。

## 使用命名 runtime {#named-runtime}

多个 LODOP script 共存时，可以用 `name` 区分：

```html
<script src="http://localhost:8000/CLodopfuncs.js?name=CLODOPA"></script>
```

业务自行引入时这样创建客户端：

```ts
const client = createLodopClient({
  script: false,
  runtimeName: 'CLODOPA',
})
```

如果由 SDK 加载，就把 `name` 写在 script 配置里：

```ts
const client = createLodopClient({
  script: {
    src: 'http://localhost:8000/CLodopfuncs.js',
    name: 'CLODOPA',
  },
})
```

SDK 会自动把 `name=CLODOPA` 拼到 script URL，并读取对应的 runtime。

## 直接打印 HTML {#print-html}

如果业务侧已经有 HTML，不需要先创建 EasyInk Viewer：

```ts
await client.printHtml({
  html: '<main class="receipt">Hello LODOP</main>',
  width: 80,
  height: 120,
  printerName: 'XP-80C',
  copies: 1,
  action: 'preview',
})
```

`width` 和 `height` 的单位是毫米。`action: 'preview'` 会打开 LODOP 预览窗口；不传时默认直接打印。

需要使用 LODOP 的 `ADD_PRINT_HTML` 时，可以指定解析器：

```ts
await client.printHtml({
  html: '<main class="receipt">Hello LODOP</main>',
  width: 80,
  height: 120,
  useHtmlParser: 'html',
})
```

如果你没有传 `printerName`，`LodopClient` 会使用当前已选择的打印机，或者刷新列表后选择默认打印机。

## 直接打印 base64 图片 {#print-base64-image}

已经拿到图片数据时，可以直接走图片打印：

```ts
await client.printBase64Image('data:image/png;base64,...', {
  width: 80,
  height: 120,
  printerName: 'XP-80C',
  stretch: 2,
})
```

这会调用 LODOP 的 `ADD_PRINT_IMAGE`。如果图片本身就是最终版面，这条路径比先转 HTML 更直接。

## 传递 LODOP 原生设置 {#native-options}

需要把 LODOP 支持的设置透传下去时，用 `requestOptions`：

```ts
await printer.print({
  schema,
  data,
  requestOptions: {
    catchPrintStatus: true,
    styles: {
      FontSize: 12,
    },
    itemStyles: {
      Stretch: 2,
    },
  },
})
```

这些选项会进入 LODOP runtime。EasyInk 只处理 Viewer 渲染和页面序列化，不会替你改变 LODOP 原生设置的含义。

直接 HTML 打印时，这些选项可以直接传给 `printHtml()`：

```ts
await client.printHtml({
  html: '<main>hello</main>',
  width: 80,
  height: 120,
  action: 'setup',
  showModes: {
    HIDE_PAPER_BOARD: true,
  },
})
```

## 复用现有 runtime {#existing-runtime}

如果项目已经自己拿到了 LODOP runtime，就让 EasyInk 只接管模板渲染和提交：

```ts
import { registerBuiltinViewerMaterials } from '@easyink/builtin/all'
import {
  createLodopPrinter,
  createLodopRuntimeClient,
} from '@easyink/print-integration-lodop'

const client = createLodopRuntimeClient({
  lodop: () => window.CLODOPA,
  printerName: settings.printerName,
  defaultCopies: settings.copies,
  forcePageSize: settings.forcePageSize,
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

await printer.print({ schema, data })
```

这个 runtime client 不会插入 script。它只把 EasyInk 渲染出的页面交给你传入的 runtime。

它同样支持 HTML 和 base64 图片直接打印：

```ts
await client.printHtml({
  html: '<main>runtime html</main>',
  width: 80,
  height: 120,
})

await client.printBase64Image('data:image/png;base64,...', {
  width: 80,
  height: 120,
})
```

:::warning 注意
`createLodopRuntimeClient()` 默认会尝试使用 LODOP 的默认打印机。确实要强制业务选择打印机时，传 `allowDefaultPrinter: false`。
:::

## 生命周期 {#lifecycle}

打印完成后清理托管 Viewer：

```ts
printer.destroy()
```

LODOP runtime 和 script 的生命周期通常由浏览器页面或业务资源加载器管理。`LodopClient` 不会主动停止本地 LODOP 服务。

关于第一张单，目前到这里就够了。接下来可以回到 [打印方案](/printing/) 对比 EasyInk Printer 和 HiPrint 路径。
