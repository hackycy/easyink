---
description: Viewer 打印与导出：基于已渲染页面消费结果，支持浏览器打印、自定义打印驱动和自定义导出器。
---

# 打印与导出 {#print-export}

Viewer 的打印和导出都建立在同一个前提上：页面已经通过 Viewer 渲染出来。

这一层不重新设计模板。它消费当前 Schema、数据、渲染页尺寸和页面 DOM。

## 浏览器打印 {#browser-print}

最短路径是直接调用 `print()`：

```ts
await viewer.print()
```

不传 `driverId` 时，Viewer 会走浏览器打印路径。即使你已经注册了自定义打印驱动，默认也仍然是浏览器打印。

有 Host 时，Viewer 会先给当前 Host 加一层打印隔离样式，再调用 `host.print()`。打印结束或抛错后，这层隔离状态会被清理。

## 纸张尺寸策略 {#page-size-mode}

`pageSizeMode` 用来回答一个问题：纸张尺寸听谁的。

```ts
await viewer.print({ pageSizeMode: 'driver' })
await viewer.print({ pageSizeMode: 'fixed' })
```

当前只支持两个值：

- `driver`：连续纸会让打印机驱动决定纸张；固定页仍会使用 Schema 解析出的纸张尺寸。
- `fixed`：按 Schema 或已渲染页面尺寸生成固定纸张策略。

连续纸比较特殊。如果连续纸请求 `fixed`，Viewer 需要已经有渲染页尺寸。否则会发出 `PRINT_RENDER_METRICS_MISSING` 诊断。

## 自定义打印驱动 {#custom-print-driver}

需要接本地服务、远程网关或专用设备时，注册一个打印驱动。

```ts
viewer.registerPrintDriver({
  id: 'thermal-printer',
  defaults: {
    pageSizeMode: 'fixed',
  },
  async print(context) {
    console.log(context.printPolicy)
    console.log(context.renderedPages)
    console.log(context.container)
  },
})

await viewer.print({
  driverId: 'thermal-printer',
})
```

驱动可以提供 `defaults.pageSizeMode`。调用 `viewer.print()` 时，如果你没有显式传 `pageSizeMode`，Viewer 会使用驱动默认值。

`context` 里最常用的是：

- `schema` 和 `data`
- `printPolicy`
- `renderedPages`
- `container`
- `onPhase`、`onProgress`、`onDiagnostic`

驱动适合做协议适配。布局、分页和尺寸策略应该交给 Viewer 先算好。

## 托管打印 SDK {#managed-print-sdk}

如果你使用官方高层打印器，不需要自己注册 `PrintDriver`。打印器会创建一个托管 Viewer，渲染完成后再把页面交给对应驱动。

模板使用官方内置物料时，在 `setupViewer` 里注册：

```ts
import { registerBuiltinViewerMaterials } from '@easyink/builtin/all'
import { createEasyInkPrinter } from '@easyink/print-integration-easyink-printer'

const printer = createEasyInkPrinter({
  serviceUrl: 'http://localhost:18080',
  viewer: 'iframe',
  setupViewer(viewer) {
    registerBuiltinViewerMaterials((type, binding, extension) => {
      viewer.registerMaterial(type, binding, extension)
    })
  },
})

await printer.print({ schema, data })
```

`setupViewer` 会在 `viewer.open()` 之前执行。也就是说，内置物料、企业物料和你自己的物料都可以在这里通过 `viewer.registerMaterial()` 注册。

HiPrint 和 LODOP 的高层打印器也使用同一个入口：

```ts
import { registerBuiltinViewerMaterials } from '@easyink/builtin/all'
import { createHiPrintPrinter } from '@easyink/print-integration-hiprint'
import { createLodopPrinter } from '@easyink/print-integration-lodop'

function setupViewer(viewer) {
  registerBuiltinViewerMaterials((type, binding, extension) => {
    viewer.registerMaterial(type, binding, extension)
  })
}

const hiPrintPrinter = createHiPrintPrinter({
  client: hiPrintClient,
  viewer: 'iframe',
  setupViewer,
})

const lodopPrinter = createLodopPrinter({
  client: lodopClient,
  viewer: 'iframe',
  setupViewer,
})
```

打印包不会自动引入 `@easyink/builtin`。如果你的模板只使用自定义物料，就把自定义注册逻辑放进同一个 `setupViewer` 里。

## 打印任务回调 {#print-callbacks}

自定义驱动可以复用 Viewer 传进来的任务回调。

```ts
await viewer.print({
  driverId: 'thermal-printer',
  onPhase(event) {
    console.log(event.phase, event.message)
  },
  onProgress(event) {
    console.log(event.current, event.total)
  },
  onDiagnostic(event) {
    console.warn(event.code, event.message)
  },
  throwOnError: true,
})
```

`throwOnError: true` 会让打印驱动错误、打印策略错误或浏览器打印错误继续向外抛出。默认情况下，Viewer 会发诊断并结束这次打印调用。

## 导出器注册 {#exporter-registration}

导出使用 `registerExporter()`。

```ts
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

然后调用 `exportDocument()`：

```ts
const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'preview',
})
```

Viewer 会按 `format` 找到第一个匹配的导出器。如果不传 `format`，会使用当前实例注册的第一个导出器。

没有匹配导出器时，会发出 `NO_EXPORTER` 诊断。传了 `throwOnError: true` 时，同一个错误会继续抛出。

## 导出任务回调 {#export-callbacks}

导出器可以有 `prepare()`，也可以在 `export()` 里上报进度和诊断。

```ts
const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'api',
  onPhase(event) {
    console.log(event.phase)
  },
  onProgress(event) {
    console.log(event.current, event.total)
  },
  onDiagnostic(event) {
    console.warn(event.code, event.message)
  },
  throwOnError: true,
})
```

当前 Viewer 会在导出过程中发出这些阶段：

- 有 `prepare()` 时：`preparing`
- 调用 `export()` 前：`exporting`
- 导出成功后：`completed`

如果导出器抛错，Viewer 会发出 `EXPORTER_ERROR`。`throwOnError: true` 时会继续抛出原始错误。

## 字符串快捷调用 {#string-format}

`exportDocument()` 也可以直接传格式字符串。

```ts
const blob = await viewer.exportDocument('pdf')
```

这等价于：

```ts
const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'api',
})
```

如果你的导出来自预览按钮、保存菜单或程序调用，可以显式传 `entry`。当前类型支持 `save-menu`、`preview` 和 `api`。

## 打印策略解析 {#resolve-print-policy}

写驱动时，你通常会想知道 Viewer 最终准备怎么打印。

```ts
import { resolvePrintPolicy } from '@easyink/viewer'

const policy = resolvePrintPolicy({
  schema: documentSchema,
  options: { pageSizeMode: 'fixed' },
  renderedPages: viewer.renderedPages,
})
```

策略对象里常用字段是：

- `pageMode`
- `pageSizeMode`
- `sheetSize`
- `orientation`
- `pageBreakBehavior`
- `offset`

`sheetSize.source` 会告诉你尺寸来自 `schema` 还是已渲染页面。

## 官方 PDF 与图片导出 {#official-file-export}

Viewer 本身只定义导出器接口，不内置 PDF 或图片编码。要快速导出文件，可以接入官方 DOM 导出插件。

先注册 PDF 和 PNG 插件：

```ts
import { createExportRuntime } from '@easyink/export-runtime'
import { createDomImageExportPlugin } from '@easyink/export-plugin-dom-image'
import { createDomPdfExportPlugin } from '@easyink/export-plugin-dom-pdf'
import { toMillimeters } from '@easyink/print-core'

const exportRuntime = createExportRuntime()

exportRuntime.registerPlugin(createDomPdfExportPlugin())
exportRuntime.registerPlugin(createDomImageExportPlugin())
```

然后把 Viewer 页面交给它们：

```ts
function resolvePageSizes(context) {
  return context.renderedPages?.map(page => ({
    widthMm: toMillimeters(page.width, page.unit),
    heightMm: toMillimeters(page.height, page.unit),
  }))
}

function resolveDomPages(context) {
  return Array.from(
    context.container?.querySelectorAll<HTMLElement>('.ei-viewer-page') ?? [],
  )
}

viewer.registerExporter({
  id: 'pdf-export',
  format: 'pdf',
  async export(context) {
    return exportRuntime.exportDocument({
      format: 'pdf',
      input: {
        pages: resolveDomPages(context),
        pageSizes: resolvePageSizes(context),
      },
      throwOnError: true,
      onProgress: context.onProgress,
    })
  },
})

viewer.registerExporter({
  id: 'png-export',
  format: 'png',
  async export(context) {
    return exportRuntime.exportDocument({
      format: 'png',
      input: {
        pages: resolveDomPages(context),
        pageIndex: 0,
        pageSizes: resolvePageSizes(context),
      },
      throwOnError: true,
      onProgress: context.onProgress,
    })
  },
})
```

现在可以直接调用 Viewer：

```ts
const pdfBlob = await viewer.exportDocument({ format: 'pdf', throwOnError: true })
const pngBlob = await viewer.exportDocument({ format: 'png', throwOnError: true })
```

`png` 导出里的 `pageIndex` 从 `0` 开始。如果你的预览界面有“当前页”状态，把它换成当前页索引就行。

JPEG 需要一个单独的插件实例：

```ts
exportRuntime.registerPlugin(createDomImageExportPlugin({
  id: 'jpeg-export-runtime',
  format: 'jpeg',
  type: 'image/jpeg',
}))
```

然后注册 `jpeg` 导出器，调用 `exportDocument({ format: 'jpeg' })`。`input.quality` 可以控制 JPEG 质量，范围是 `0` 到 `1`。

如果你想一次拿到多页图片，可以直接使用图片插件的纯函数：

```ts
import { renderPagesToImageBlobs } from '@easyink/export-plugin-dom-image'

const imageBlobs = await renderPagesToImageBlobs({
  pages: resolveDomPages(context),
  pageSizes: resolvePageSizes(context),
  type: 'image/png',
})
```

这里会返回 `Blob[]`。你可以逐个下载，也可以在业务层打包成 zip。

如果你要把 Viewer 接到打印设备，继续看 [自定义打印驱动](/advanced/print-drivers)。如果你要自己实现一种新导出格式，继续看 [自定义导出插件](/advanced/exporters)。

关于打印与导出，目前知道这些就够用了。排查错误时可以继续看 [诊断系统](./diagnostics)。
