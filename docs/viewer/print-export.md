# 打印与导出

Viewer 支持浏览器打印、自定义打印驱动和插件化导出。

## 打印

### 浏览器打印

最简单的方式，使用内置的 `browser` 驱动：

```ts
await viewer.print({ driverId: 'browser' })
```

打印时 Viewer 会：
1. 从 mount 向上遍历，标记所有祖先元素
2. 注入 `@media print` CSS，重置祖先布局，只显示 Viewer 内容
3. 调用 `window.print()`
4. 清理标记和注入的样式

### 打印策略

通过 `pageSizeMode` 控制纸张尺寸来源：

```ts
await viewer.print({
  driverId: 'browser',
  pageSizeMode: 'driver', // 使用打印机默认纸张
})

await viewer.print({
  driverId: 'browser',
  pageSizeMode: 'fixed',  // 使用模板定义的纸张尺寸
})
```

### 打印选项

```ts
await viewer.print({
  driverId: 'browser',
  pageSizeMode: 'driver',
  throwOnError: true,                    // 出错时抛出异常
  onPhase: (event) => { /* 阶段回调 */ },
  onProgress: (progress) => { /* 进度回调 */ },
  onDiagnostic: (event) => { /* 诊断回调 */ },
})
```

### 自定义打印驱动

注册自定义打印驱动，将渲染结果发送到远程打印机：

```ts
viewer.registerPrintDriver({
  id: 'thermal-printer',
  async print(context) {
    // context.renderedPages  -- 已渲染的页面 DOM
    // context.printPolicy    -- 打印策略（纸张尺寸、方向等）
    // context.container      -- 容器元素
    // context.schema         -- 文档 Schema
  },
})

await viewer.print({
  driverId: 'thermal-printer',
  pageSizeMode: 'fixed',
})
```

## 导出

### 注册导出插件

```ts
viewer.registerExporter({
  id: 'pdf-exporter',
  format: 'pdf',
  async export(context) {
    // context.renderedPages  -- 已渲染的页面信息
    // context.container      -- 容器元素
    // context.schema         -- 文档 Schema
    // context.data           -- 运行时数据
    // context.onProgress     -- 进度回调
    // context.onDiagnostic   -- 诊断回调
    return blob // 返回 Blob
  },
})
```

### 调用导出

```ts
const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'preview',
  throwOnError: true,
  onPhase: (event) => console.log(event.phase),
  onProgress: (progress) => console.log(progress),
})

// 下载文件
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'document.pdf'
a.click()
URL.revokeObjectURL(url)
```

## PrintPolicy

`resolvePrintPolicy()` 根据 Schema 和选项计算打印策略：

| 模式 | pageSizeMode | 行为 |
|------|-------------|------|
| fixed + driver | `'driver'` | 使用打印机默认纸张，仅设置方向 |
| fixed + fixed | `'fixed'` | 使用模板定义的纸张尺寸 |
| continuous + driver | `'driver'` | 使用打印机默认纸张，不强制 `@page size` |
| continuous + fixed | `'fixed'` | 使用渲染后的连续纸页面尺寸 |
| label | `'fixed'` | 计算标签 sheet 尺寸（列数 x 行数） |

```ts
import { resolvePrintPolicy } from '@easyink/viewer'

const policy = resolvePrintPolicy({
  schema: documentSchema,
  options: { pageSizeMode: 'fixed' },
  renderedPages: viewer.renderedPages,
})
```

### ViewerPrintPolicy

```ts
interface ViewerPrintPolicy {
  pageMode: 'fixed' | 'continuous' | 'label'
  pageSizeMode: 'driver' | 'fixed'
  sheetSize?: { width: number; height: number; unit: string; source: 'schema' | 'label' | 'rendered' }
  orientation: 'portrait' | 'landscape' | 'auto'
  pageBreakBehavior: { after: 'auto' | 'page'; inside: 'auto' | 'avoid' }
  offset: { horizontal: number; vertical: number; unit: string }
}
```

## 任务回调

打印和导出都支持统一的任务回调：

```ts
interface ViewerTaskCallbacks {
  onPhase?: (event: { phase: string; message?: string }) => void
  onProgress?: (event: { current?: number; total?: number; message?: string }) => void
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
  throwOnError?: boolean
}
```
