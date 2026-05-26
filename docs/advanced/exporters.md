# 自定义导出插件开发

导出层最容易做错的地方，不是代码写不出来，而是把 Viewer 适配和格式转换混在一起。

## 职责分层

当前导出体系至少有两层：

- `ViewerExporter`：负责从 Viewer 拿上下文
- `ExportFormatPlugin`：负责把输入变成最终文件

如果一段逻辑还依赖 `container`、`renderedPages` 或 `entry`，它更像 Viewer 侧桥接；如果它只关心输入和输出文件，它更像格式插件。

## 接口定义

```ts
interface ViewerExporter {
  id: string
  format: string
  prepare?: (context: ViewerExportContext) => Promise<void>
  export: (context: ViewerExportContext) => Promise<Blob | void>
}
```

```ts
interface ExportFormatPlugin<TInput = unknown, TResult extends Blob | void = Blob | void> {
  id: string
  format: string
  validateInput?: (input: unknown) => input is TInput
  prepare?: (context: ExportRuntimeContext<TInput>) => Promise<void>
  export: (context: ExportRuntimeContext<TInput>) => Promise<TResult>
}
```

## 开发顺序

最稳的顺序是：

1. 先把格式插件输入结构定义清楚
2. 先让 `ExportFormatPlugin` 跑通
3. 最后再写 `ViewerExporter` 去桥接 Viewer 上下文

这样格式转换能先独立验证，Viewer 这一层只负责适配。

## 典型组合

如果你要把 Viewer 页面导成 PDF，通常会这样组合：

```ts
const exportRuntime = createExportRuntime()
exportRuntime.registerPlugin(createDomPdfExportPlugin())

viewer.registerExporter({
  id: 'pdf-export',
  format: 'pdf',
  async export(context) {
    const pages = Array.from(context.container?.querySelectorAll('.ei-viewer-page') ?? [])

    return exportRuntime.exportDocument({
      format: 'pdf',
      input: {
        pages,
        widthMm: context.renderedPages?.[0]?.width ?? 210,
        heightMm: context.renderedPages?.[0]?.height ?? 297,
      },
      throwOnError: true,
      onProgress: context.onProgress,
    })
  },
})
```

这里真正做 PDF 的是格式插件，不是 ViewerExporter 本身。

## `ExportRuntime` 适用边界

如果你的导出结果本来就直接依赖 Viewer 上下文，而且没有复用价值，那可以只写 `ViewerExporter`。

比如导出模板快照 JSON：

```ts
viewer.registerExporter({
  id: 'template-json-export',
  format: 'template-json',
  async export(context) {
    return new Blob([
      JSON.stringify({
        schema: context.schema,
        data: context.data,
        entry: context.entry,
      }, null, 2),
    ], { type: 'application/json' })
  },
})
```

这类导出没有必要再抽 runtime 插件。

## 导出状态

```
idle -> preparing -> exporting -> completed
                \                /
                 -> failed <----
```

如何理解这几个阶段：

- `preparing`：校验输入、预热资源、准备环境
- `exporting`：真正执行格式转换
- `completed`：结果已生成
- `failed`：任一阶段发生错误

## 工程路径

如果你的需求只是“导出一种新格式”，最短路径通常不是先设计大而全的导出体系，而是：

1. 先把格式转换本身写成纯函数或插件。
2. 用一段固定输入把结果跑通。
3. 再接入 `ViewerExporter`。

这样你能更快定位问题到底在格式层还是 Viewer 层。
