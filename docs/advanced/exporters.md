---
description: EasyInk 自定义导出插件开发：Viewer 负责渲染页面，Export Runtime 负责转换为文件输出。
---

# 自定义导出插件开发 {#exporters}

导出扩展有两层：Viewer 负责拿到已渲染页面，Export Runtime 负责把输入转换成文件。

先看 DOM 页面导出 PDF 的组合：

```ts
import { createExportRuntime } from '@easyink/export-runtime'
import { createDomPdfExportPlugin } from '@easyink/export-plugin-dom-pdf'
import { toMillimeters } from '@easyink/print-core'

const exportRuntime = createExportRuntime()
exportRuntime.registerPlugin(createDomPdfExportPlugin())

viewer.registerExporter({
  id: 'pdf-export',
  format: 'pdf',
  async export(context) {
    const pages = Array.from(
      context.container?.querySelectorAll<HTMLElement>('.ei-viewer-page') ?? [],
    )

    return exportRuntime.exportDocument({
      format: 'pdf',
      input: {
        pages,
        pageSizes: context.renderedPages?.map(page => ({
          widthMm: toMillimeters(page.width, page.unit),
          heightMm: toMillimeters(page.height, page.unit),
        })),
      },
      throwOnError: true,
      onProgress: context.onProgress,
    })
  },
})
```

这里 `ViewerExporter` 只负责把 Viewer 上下文整理成插件输入。真正生成 PDF 的是 `ExportFormatPlugin`。

## 选择接入层 {#choose-layer}

你可以只写 `ViewerExporter`，也可以加一层 `ExportFormatPlugin`：

```ts
// 只依赖 Viewer 上下文：ViewerExporter 就够了
viewer.registerExporter({ id: 'json', format: 'json', export: exportSchemaJson })

// 格式转换想复用：写 ExportFormatPlugin，再用 ViewerExporter 桥接
runtime.registerPlugin(createDomPdfExportPlugin())
viewer.registerExporter(createPdfViewerExporter(runtime))
```

两种方式都能完成导出。区别在于复用边界：

- 只给当前 Viewer 用：直接写 `ViewerExporter`。
- 以后 CLI、服务端或别的入口也要用：把格式转换放进 `ExportFormatPlugin`。

## ViewerExporter 接口 {#viewer-exporter}

Viewer 侧导出器接收的是 `ViewerExportContext`：

```ts
interface ViewerExporter {
  id: string
  format: ExportFormat
  prepare?: (context: ViewerExportContext) => Promise<void>
  export: (context: ViewerExportContext) => Promise<Blob | void>
}
```

它常用的字段是：

```ts
async export(context) {
  context.onPhase?.({ phase: 'exporting', message: '导出模板 JSON' })

  return new Blob([
    JSON.stringify({
      schema: context.schema,
      data: context.data,
      entry: context.entry,
      renderedPages: context.renderedPages,
    }, null, 2),
  ], { type: 'application/json' })
}
```

如果导出结果直接依赖 `schema`、`data`、`container` 或 `renderedPages`，这一层就很自然。

## ExportFormatPlugin 接口 {#format-plugin}

格式插件只关心输入和输出：

```ts
import type { ExportFormatPlugin } from '@easyink/export-runtime'

interface LabelJsonInput {
  schemaName: string
  pages: number
}

export const labelJsonPlugin: ExportFormatPlugin<LabelJsonInput, Blob> = {
  id: 'label-json',
  format: 'json',
  validateInput(input): input is LabelJsonInput {
    return typeof input === 'object' && input !== null && 'schemaName' in input
  },
  async export(context) {
    context.reportProgress({ current: 1, total: 1, message: '生成 JSON' })
    return new Blob([
      JSON.stringify(context.input, null, 2),
    ], { type: 'application/json' })
  },
}
```

`validateInput()` 是可选的。写了之后，runtime 会用它挑选能处理当前输入的插件。

## 桥接 Viewer 和插件 {#bridge}

桥接代码应该薄一点：

```ts
import type { ExportRuntime } from '@easyink/export-runtime'
import type { ViewerExporter } from '@easyink/viewer'

export function createLabelJsonViewerExporter(runtime: ExportRuntime): ViewerExporter {
  return {
    id: 'label-json-viewer-export',
    format: 'json',
    async export(context) {
      return runtime.exportDocument({
        format: 'json',
        input: {
          schemaName: context.schema.meta?.name ?? 'untitled',
          pages: context.renderedPages?.length ?? 0,
        },
        entry: context.entry,
        throwOnError: true,
        onProgress: context.onProgress,
        onDiagnostic(diagnostic) {
          context.onDiagnostic?.({
            category: 'exporter',
            severity: diagnostic.severity,
            code: diagnostic.code,
            message: diagnostic.message,
            scope: 'exporter',
            detail: diagnostic.detail,
            cause: diagnostic.cause,
          })
        },
      })
    },
  }
}
```

这段代码只做数据转换和诊断映射。格式插件仍然不知道 Viewer 的存在。

## 导出状态 {#states}

Export Runtime 的状态会这样变化：

```text
idle
  -> dispatching
  -> preparing
  -> exporting
  -> completed
```

失败时会进入 `failed`：

```text
dispatching -> failed
preparing   -> failed
exporting   -> failed
```

你可以订阅状态来更新宿主 UI：

```ts
const unsubscribe = exportRuntime.subscribe((state) => {
  console.log(state.phase, state.format, state.error)
})
```

关于状态，目前知道这些就够了。业务 UI 通常只需要展示 `preparing`、`exporting`、`completed` 和 `failed`。

## 完成前检查 {#checklist}

开发时按这个顺序验证：

```ts
const runtime = createExportRuntime()
runtime.registerPlugin(labelJsonPlugin)

await runtime.exportDocument({
  format: 'json',
  input: { schemaName: 'demo', pages: 1 },
  throwOnError: true,
})
```

然后再接 Viewer：

```ts
viewer.registerExporter(createLabelJsonViewerExporter(runtime))
await viewer.exportDocument({ format: 'json', throwOnError: true })
```

检查结果时重点看这些点：

- 没有匹配插件时是否给出 `NO_EXPORT_PLUGIN`。
- `validateInput()` 失败时是否阻止导出。
- 多页导出时进度是否递增。
- 插件诊断是否映射到 Viewer 的 `onDiagnostic`。
- `throwOnError: true` 时错误是否能被宿主捕获。

关于导出扩展，目前知道这些就够用了。打印链路可以继续看 [自定义打印驱动开发](/advanced/print-drivers)。
