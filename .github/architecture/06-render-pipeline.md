# 6. 渲染与预览管线

EasyInk 现在不再把“渲染”理解成单次 DOM 输出，而是把它定义为 Viewer 运行时流程。

## 6.1 Viewer 主流程

```
Schema
  │
  ▼
SchemaNormalizer / Migrator
  │
  ▼
DataSourceResolver
  │
  ▼
UsageFormatter / AggregateResolver
  │
  ▼
PagePlanner
  │
  ▼
MaterialRendererRegistry
  │
  ├── 页面 DOM / SVG
  ├── 缩略图模型
  └── 打印 / 导出入口
```

关键点：

- 预览是 Viewer 独立流程，不在设计器画布中完成
- 数据加载、字体加载、分页、缩略图生成都属于 Viewer
- 设计器只负责嵌入和调度 Viewer

## 6.2 运行时阶段补充

结合对标产品实测，Viewer 运行时至少还要显式经过以下阶段：

1. `SchemaCodec`：把外部输入转为 EasyInk 规范模型。
2. `FontRegistryLoader`：加载字体描述与字体资源。
3. `DataSourceResolver`：根据 `sourceId / sourceTag` 拉取数据。
4. `BindingProjector`：处理 `usage / union / bindIndex`。对 table-data 节点执行单元格级预解析（见 6.6.1）。
5. `MeasureAndFlowResolver`：先测量 table-data 等动态物料的运行态尺寸，再在 `stack` 模式下执行流式回流，把后续 flow 元素按文档顺序重新定位。
6. `PagePlanner`：基于回流后的几何结果生成固定分页、连续页或标签页计划。对 table-data 元素与 ViewerExtension 协作完成行展开和分页（见 [7.3](./07-layout-engine.md)）。
7. `RenderSurface`：输出页面 DOM/SVG 和缩略图。
8. `ExportAdapterLoader`：按需装载导出依赖和适配器。

## 6.3 Viewer 接口

```typescript
function createViewer(options?: ViewerOptions): ViewerRuntime

interface ViewerRuntime {
  open(input: ViewerOpenInput): Promise<void>
  updateData(data: Record<string, unknown>): Promise<void>
  print(): Promise<void>
  exportDocument(): Promise<Blob | void>
  destroy(): void
}

interface ViewerOpenInput {
  schema: DocumentSchema
  data?: Record<string, unknown>
  dataSources?: DataSourceDescriptor[]
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
}
```

## 6.4 设计态渲染与 Viewer 渲染的分层

EasyInk 存在两套独立的物料渲染能力，不共享实现代码：

| | 设计态渲染 | Viewer 渲染 |
|---|---|---|
| 接口 | `MaterialDesignerExtension.renderContent(nodeSignal, container)` | `MaterialViewerExtension.render()` |
| 运行场景 | Designer 画布内 | Viewer 运行时（预览/打印/导出） |
| 数据 | 无真实数据，绑定显示为字段标签 | 真实数据绑定 + 格式化 |
| 性能要求 | 主线程同步渲染，必须轻量 | 可异步，可引入重量级第三方库 |
| 输出 | HTML 注入画布元素容器 | DOM/SVG 页面 + 缩略图 |

详细设计见 [10.9 画布设计态渲染](./10-designer-interaction.md) 和 [11.6 Designer 扩展面](./11-element-system.md)。

## 6.5 设计器与 Viewer 的全量预览关系

设计器预览时：

1. Designer 把当前 Schema 和调试数据传给 iframe Viewer。
2. Viewer 重新做数据解析、分页和渲染。
3. Designer 只接收预览结果事件，不直接操纵 Viewer 内部 DOM。

这保证：

- 设计器不会把自己的编辑态 DOM 误当成真实预览
- 宿主应用与设计器内预览共享同一运行时路径

## 6.6 数据与格式规则处理

Viewer 在渲染前执行：

- 数据源适配器调用
- 字段路径解析
- `usage` 格式规则解释
- 聚合规则求值
- union 批量投放结果合并

### 6.6.1 table-data 单元格绑定预解析

ViewerRuntime 在 `resolveAllBindings` 阶段检测到 table-data 节点时，通过单一入口执行整表绑定预解析：

1. 收集 repeat-template 行内所有 cell 的 `binding.fieldPath`，调用 `extractCollectionPath(fieldPaths)` 提取公共集合前缀
2. 用提取出的集合路径从数据中取值，通过 `Array.isArray` 确认其为集合数组
3. 遍历集合中的每个数据项
4. **showHeader/showFooter 检查**：若 `showHeader=false`，跳过 header 行的绑定解析；若 `showFooter=false`，跳过 footer 行的绑定解析
5. 对 repeat-template 行内每个单元格的 `binding`，使用 `resolveFieldFromRecord(leafField, record)` 从集合项中取出叶子字段值（leafField 为 fieldPath 去掉集合前缀后的剩余部分）。所有路径均为绝对路径，不存在 scope 参数
6. 对 header / footer / normal 行内每个单元格的 `staticBinding`，调用 `resolveBindingValue(staticBinding, data)` 从根解析（绝对路径）
7. 将解析结果存入 `Map<string, ResolvedCellBindings>`，key 格式为 `${nodeId}:${rowIndex}:${colIndex}[:${dataIndex}]`
8. 后续测量 / 回流阶段、PagePlanner 协作阶段和表格 ViewerExtension 渲染阶段直接消费预解析结果

```typescript
interface ResolvedCellBindings {
  /** 解析后的值，对应 cell.binding 的解析结果 */
  value: unknown
  /** 格式化后的显示值（如果有 usage 规则） */
  formatted?: string
}
```

这种预解析模式确保绑定解析集中在 Viewer pipeline 的单一阶段完成，表格 ViewerExtension 只消费解析结果，不自行调用 resolveBindingValue。

### 6.6.2 table-static staticBinding 预解析

ViewerRuntime 在 `resolveAllBindings` 阶段检测到 table-static 节点时：

1. 遍历所有行的所有 cell，查找 `staticBinding` 字段
2. 对每个有 `staticBinding` 的 cell，调用 `resolveBindingValue(staticBinding, data)`（绝对路径，无集合展开）
3. 结果存入 `Map<string, ResolvedCellBindings>`，key 格式 `${nodeId}:${rowIndex}:${colIndex}`
4. 无 `staticBinding` 的 cell 使用 `content.text` 作为渲染内容

但不会执行：

- 任意 JavaScript 表达式
- 来自模板的自定义函数

## 6.7 页面输出

Viewer 的输出不再只有一个 `page` DOM 节点，而是页面集合：

```typescript
interface ViewerRenderResult {
  pages: ViewerPageResult[]
  thumbnails: ThumbnailResult[]
  diagnostics: ViewerDiagnosticEvent[]
}

interface ViewerPageResult {
  index: number
  width: number
  height: number
  elementCount: number
}
```

## 6.8 样式与承载策略

### 设计器

- 以编辑体验为主
- 可使用 Shadow DOM 或局部样式隔离
- 不要求和打印 DOM 完全同构

### Viewer

- 以稳定预览、打印和导出为主
- 使用 iframe 隔离上下文
- 内部仍以 DOM/SVG 为主要输出
- 自动生成页面样式、打印样式和缩略图容器

## 6.9 导出依赖装载

对标产品预览时已经验证 `viewer` 会动态加载：

- `pptxgenjs`
- `jszip`
- `jspdf`
- `file-saver`
- `docx`

这意味着 EasyInk 需要把导出能力建模成运行时适配器：

- 预览核心路径不强绑定某一个导出格式
- 第三方导出依赖按需装载
- 装载失败时给出可见诊断，而不是让整个 Viewer 崩溃

## 6.10 诊断机制

诊断事件至少覆盖：

| scope | category | 触发场景 |
|---|---|---|
| schema | schema | 缺字段、未知元素、迁移降级 |
| datasource | datasource | 数据源缺失、路径无效、字段类型不匹配 |
| font | viewer | 字体加载失败 |
| material | viewer | 单个物料渲染异常 |
| print | print | 打印 DOM 操作或 window.print() 失败 |
| export-adapter | export-adapter | 第三方依赖加载失败、格式不支持 |

所有问题默认都应该是可见的、可追踪的，而不是静默跳过。

### 6.10.1 统一诊断中间件

Viewer 渲染管线通过 `diagnostic-middleware.ts` 中的 `safeRender` 统一处理所有阶段的异常：

```typescript
// packages/viewer/src/diagnostic-middleware.ts
export function safeRender<T>(
  fn: () => T,
  options: SafeRenderOptions,
  diagnostics: ViewerDiagnosticEvent[],
): T | ErrorSentinel
```

`SafeRenderOptions` 定义：

```typescript
interface SafeRenderOptions {
  scope: 'schema' | 'datasource' | 'font' | 'material' | 'print' | 'export-adapter'
  code: string
  nodeId?: string
  placeholderHtml?: string
}
```

异常处理流程：
1. 捕获所有同步异常
2. 提取 `err.name / err.message / err.stack` 存入 `cause` 字段
3. 组装 `ViewerDiagnosticEvent`（含 `scope` + `cause`）推入 `diagnostics[]`
4. 通过 `emitDiagnostic()` 触发 `diagnosticsEmitted` hook
5. 若提供了 `placeholderHtml`，返回 `ErrorSentinel`，调用方通过 `isErrorSentinel()` 检测并渲染降级占位

`emitDiagnostic` 连接 `diagnosticsEmitted` hook：

```typescript
private emitDiagnostic(event: ViewerDiagnosticEvent): void {
  this._diagnosticHandler?.(event)
  this._hooks.diagnosticsEmitted.call(event).catch(() => {
    // hook 失败不应阻断渲染
  })
}
```

### 6.10.2 诊断阶段覆盖

| 阶段 | 文件 | 诊断码 |
|---|---|---|
| schema 校验 | `runtime.ts` | `INVALID_SCHEMA` |
| datasource/binding | `runtime.ts` | `BINDING_RESOLVE_ERROR` |
| font 加载 | `font-loader.ts` | `FONT_LOAD_FAILED` |
| material 渲染 | `render-surface.ts` | `MATERIAL_RENDER_ERROR` |
| stack-flow 布局 | `stack-flow-layout.ts` | `STACK_FLOW_FIXED_OVERLAP` |
| print | `runtime.ts` | `PRINT_ERROR` |
| export-adapter | `runtime.ts` | `NO_EXPORT_ADAPTER` |
