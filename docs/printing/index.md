---
description: EasyInk 打印方案选型指南：Render PDF 渲染、EasyInk Printer Windows 本地打印、Electron HiPrint 和 LODOP/C-Lodop 集成。
---

# 打印方案 {#printing}

打印章节先帮你回答一个问题：这次到底是要“生成 PDF”，还是要“把内容送到本地打印机”。

先看几个最短调用：

```ts
import { compileBuiltinMaterialProfile } from '@easyink/builtin/all'
import { createEasyInkPrinter } from '@easyink/print-integration-easyink-printer'

const printer = createEasyInkPrinter({
  serviceUrl: 'http://localhost:18080',
  viewer: 'iframe',
  profile: compileBuiltinMaterialProfile('all'),
})

await printer.ready()
await printer.print({ schema, data })
```

这里的 `printer.ready()` 是可选预检，用来提前确认本地服务和打印机列表。实际打印 API 会按需连接，所以你也可以直接调用 `printer.print()`。

```ts
import { compileBuiltinMaterialProfile } from '@easyink/builtin/all'
import { createHiPrintClient, createHiPrintPrinter } from '@easyink/print-integration-hiprint'

const client = createHiPrintClient({
  serviceUrl: 'http://localhost:17521',
})

const printer = createHiPrintPrinter({
  client,
  viewer: 'iframe',
  profile: compileBuiltinMaterialProfile('all'),
})

await client.useDefaultPrinter()
await printer.print({ schema, data })
```

两段代码都做了同一件事：用托管 Viewer 渲染 `schema + data`，再交给对应的本地打印链路。区别在于最后提交给谁，以及用什么格式提交。

托管 Viewer 创建时必须接收 compiled profile。自定义物料需要先加入 external material package，再与所需内置物料一起编译 profile。

LODOP 路径也类似：

```ts
import { compileBuiltinMaterialProfile } from '@easyink/builtin/all'
import { createLodopClient, createLodopPrinter } from '@easyink/print-integration-lodop'

const client = createLodopClient({
  script: {
    src: 'http://localhost:8000/CLodopfuncs.js',
  },
})

const printer = createLodopPrinter({
  client,
  viewer: 'iframe',
  profile: compileBuiltinMaterialProfile('all'),
})

await client.useDefaultPrinter()
await printer.print({ schema, data })
```

这段代码会加载 C-Lodop script，等待 LODOP runtime 可用，再把 Viewer 渲染出的 HTML 提交给本地控件。

## 选哪条链路 {#choose-a-path}

几条链路都能进入打印工作流，但它们解决的问题不一样。

| 方案 | 更适合什么 | 默认端口或入口 |
| --- | --- | --- |
| EasyInk.Render | 把 HTML、PDF 或 EasyInk schema 归一成 PDF | `easyink-render render` |
| EasyInk Printer | Windows 本地服务、正式单据、PDF 打印路径 | `http://localhost:18080` |
| HiPrint | 已有 `electron-hiprint`、小票、卡片、跨平台桌面场景 | `http://localhost:17521` |
| LODOP | 已有 `LODOP` 或 `C-Lodop`、浏览器直接控件打印、HTML 和图片打印 | `http://localhost:8000/CLodopfuncs.js` |

如果你刚开始接打印，可以这样判断：

- 只需要生成 PDF，不需要枚举打印机：先看 [Render PDF 渲染](/printing/render)。
- 浏览器要调用 Windows 本地打印机：先看 [EasyInk Printer 快速上手](/dotnet/getting-started)。
- 项目已经接入 `electron-hiprint`：先看 [HiPrint 快速上手](/hiprint/getting-started)。
- 项目已经部署 `LODOP` 或 `C-Lodop`：先看 [LODOP 快速上手](/lodop/getting-started)。

本地打印集成都有高层打印器。你不用先自己写 `PrintDriver`，除非你要接入完全不同的设备协议。

## EasyInk Printer 路径 {#easyink-printer}

EasyInk Printer 的高层打印器默认会先在浏览器端生成 PDF，再通过 WebSocket 分片上传到本地服务。

```ts
const printer = createEasyInkPrinter({
  serviceUrl: 'http://localhost:18080',
  viewer: 'iframe',
  profile: compileBuiltinMaterialProfile('all'),
})

await printer.print({
  schema,
  data,
  printerName: 'HP LaserJet',
  copies: 2,
})
```

这段代码会默认使用 `pageSizeMode: 'fixed'`。也就是说，Viewer 会按模板尺寸渲染页面，打印器再把结果作为 PDF 提交给 EasyInk Printer。

如果你要让本地 Printer 服务自己调用 Render，可以选择 `printer-template` 策略：

```ts
await printer.print({
  schema,
  data,
  strategy: 'printer-template',
})
```

连续纸模板会在 Printer-side Render 里按实际渲染高度生成 PDF。

如果你想把预览里已经渲染好的页面作为 HTML 交给 Printer，可以选择 `preview-html` 策略：

```ts
await printer.print({
  schema,
  data,
  strategy: 'preview-html',
  paper: 'template',
})
```

这条路径会保留预览 HTML 里的 `@page` 尺寸声明。

关于这条链路，目前知道这些就够用了。继续看 [EasyInk Printer (.NET)](/dotnet/)。

## HiPrint 路径 {#hiprint}

HiPrint 的高层打印器默认会把 Viewer 页面序列化成 HTML，再交给 HiPrint runtime。

```ts
const printer = createHiPrintPrinter({
  client,
  viewer: 'iframe',
  profile: compileBuiltinMaterialProfile('all'),
})

await printer.print({
  schema,
  data,
  printerName: 'XP-80C',
})
```

这段代码会默认使用 `pageSizeMode: 'driver'`，并且不会强制下发自定义纸张尺寸。只有你传入 `forcePageSize: true` 时，HiPrint 才会收到按模板尺寸换算出的 `pageSize`。

如果你的设备更依赖驱动当前纸张，比如热敏机或连续纸，这个默认值通常更稳。继续看 [Electron HiPrint](/hiprint/)。

## LODOP 路径 {#lodop}

LODOP 的高层打印器默认会把 Viewer 页面序列化成 HTML，再交给 LODOP runtime。

```ts
const printer = createLodopPrinter({
  client,
  viewer: 'iframe',
  profile: compileBuiltinMaterialProfile('all'),
})

await printer.print({
  schema,
  data,
  printerName: 'XP-80C',
})
```

这段代码会默认调用 LODOP 的页面尺寸设置。也就是说，`LodopClient` 会把毫米尺寸换算给 `SET_PRINT_PAGESIZE`，再通过 `ADD_PRINT_HTM` 或 `ADD_PRINT_HTML` 提交页面内容。

如果你想使用打印机驱动当前纸张，可以传 `forcePageSize: false`：

```ts
await printer.print({
  schema,
  data,
  forcePageSize: false,
})
```

LODOP 还适合直接打印业务 HTML 或 base64 图片。继续看 [LODOP](/lodop/)。

## Render 路径 {#render}

Render 不提交物理打印任务。它只负责把输入变成 PDF。
连续纸会按 Viewer 实际渲染高度生成 PDF，不依赖浏览器打印驱动接管纸张。

```bash
easyink-render render \
  --request lib/EasyInk.Render/samples/html/request.json \
  --out out.pdf \
  --json
```

如果你的目标是服务端批量生成 PDF、CI 中校验模板输出，或者先排查渲染问题，就从 [Render PDF 渲染](/printing/render) 开始。

## 排错顺序 {#troubleshooting-order}

用户说“点了打印没反应”时，先按这个顺序查：

```ts
await printer.ready()
await printer.print({
  schema,
  data,
})
```

上面这段先把连接、打印机选择和提交路径跑通。`printer.ready()` 在这里同样只是预检，不是打印前必须调用的步骤。要看渲染阶段，就回到你自己创建 Viewer 的那层。

- 拿不到打印机：先查本地服务和系统打印机。
- 有打印机但提交失败：看前端抛出的错误和服务端日志。
- 提交成功但纸张异常：再看 `paper`、模板尺寸和驱动默认介质。

关于选型，目前停在这里就够了。下一步可以进入具体链路：[EasyInk Printer](/dotnet/getting-started)、[HiPrint](/hiprint/getting-started) 或 [LODOP](/lodop/getting-started)。
