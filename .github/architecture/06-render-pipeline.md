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
BindingProjector / FormatResolver
  │
  ▼
LayoutPipeline / PaginationEngine
  │
  ▼
RenderSessionMaterials
  │
  ├── 页面 DOM / SVG
  ├── 缩略图模型
  └── 打印 / 导出入口
```

关键点：

- 预览是 Viewer 独立流程，不在设计器画布中完成
- 字体加载、绑定投影、分页、缩略图生成都属于 Viewer
- 数据加载和多接口聚合不属于 Viewer，宿主必须在 `open()` 前准备好运行时 `data`
- 设计器只负责嵌入和调度 Viewer

## 6.2 运行时阶段补充

结合对标产品实测，Viewer 运行时至少还要显式经过以下阶段：

1. `SchemaCodec`：把外部输入转为 EasyInk 规范模型。
2. `FontRegistryLoader`：加载字体描述与字体资源。
3. `BindingProjector`：按 `BindingRef.fieldPath` 从传入的 `data` 根对象解析值，并处理 `bindIndex` 与显示格式。表格单元格绑定在物料自己的会话准备中解析（见 6.6.1）。
4. `MeasureAndFlowResolver`：先在绑定和 beforePagePlan 后等待物料可选 prepare，再同步测量动态尺寸，最后按 `page.reflow.strategy` 执行 `flow-y` 等回流策略，把后续 flow 元素按文档顺序重新定位。
5. `LayoutPipeline / PaginationEngine`：基于回流后的几何结果生成固定页、连续纸或自动分页页计划。对 table-data 等可拆分页物料通过 `FragmentPaginator` 协作（见 [7.5](./07-layout-engine.md)）。
6. `RenderSurface`：输出页面 DOM/SVG 和缩略图，并把最终 `ViewerPageMetrics` 缓存在 ViewerRuntime 内。`RenderSurface` 只负责页面容器、定位和通用诊断，不允许按 `materialType` 写分支。若某类物料的运行态渲染尺寸不等于 schema 几何尺寸，必须由 `ViewerSessionRenderer.getRenderSize()` 通过注册表回传，`RenderSurface` 只消费 registry 返回值。
7. `PrintPolicyResolver`：基于 `page.pageModel / page.mode / pageSizeMode / renderedPages` 解析打印策略。连续纸使用 driver 模式时不强制纸张尺寸；连续纸使用 fixed 模式时必须使用 render 阶段缓存的最终页面尺寸，缺失时发出 `PRINT_RENDER_METRICS_MISSING` 并拒绝打印。
8. `ExportPluginLoader`：按需装载导出依赖和插件。

## 6.3 Viewer 接口

```typescript
function createViewer(options?: ViewerOptions): Promise<ViewerRuntime>

interface ViewerRuntime {
  open(input: ViewerOpenInput): Promise<ViewerRenderResult>
  updateData(data: Record<string, unknown>): Promise<ViewerRenderResult>
  render(): Promise<ViewerRenderResult>
  print(options?: ViewerPrintOptions): Promise<void>
  exportDocument(): Promise<Blob | void>
  destroy(): Promise<DisposeResult>
}

interface ViewerOpenInput {
  schema: DocumentSchema
  data?: Record<string, unknown>
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
}

interface ViewerPrintOptions {
  pageSizeMode?: 'driver' | 'fixed'
}
```

`ViewerRenderResult` 以 `status` 区分 `completed` 与 `cancelled`。完成结果包含 `requestId`、页面、缩略图和本轮诊断；替代、切文档或销毁取消返回原因，整体计算失败拒绝 Promise。`renderState` 独立报告更新中、完成、失败和销毁状态，失败状态不代表旧输出已被删除。

### 6.3.1 固定输入与提交

每轮在异步等待前复制 Schema 和 data，并捕获单位、声明几何、目标 document/mount、字体 provider 和预览 zoom。复制使用 shared 的 `deepClone`，保留 Date、undefined 等受支持值。新请求永久撤销旧候选的提交权，即使新请求失败也不恢复旧请求；不可取消的外部 Promise 不阻塞正常取消。

Viewer 在独立候选容器中绘制，再检查 Host、目标容器、文档代次和请求身份，一起发布页面、metrics、成功输入快照及输出诊断。同文档刷新等待或失败时保留完整旧输出；显式 `open()` 清旧页面与 metrics，随后验证并计算新文档。迟到诊断钩子的失败也受当前请求身份保护。

`render/getRenderSize` 的 `signal/onDispose` 归属单次输出项。失败项、取消候选和替换预览分别释放自身资源；一次清理异常不停止其他清理，并在 `destroy()` 的 `DisposeResult` 中汇总。安装级 loader 仍属于 material Host。复杂物料可通过同步 createSession 为每轮创建实例；可选 prepare 每个可见源节点执行一次，可异步。factory/prepare/measure/分页的资源归计算范围，计算结束、失败或取消时释放；render/getRenderSize 使用独立输出项范围。

打印/导出在开始前等待当前文档的最新成功请求，同文档新请求会替代等待对象，最新失败拒绝输出，open/destroy 取消未开始任务。开始后固定成功输入、metrics、诊断和版本容器，预览及各任务分别持有内部使用权。替换预览时将仍被使用的原容器移到同 document 的连接环境中，保留 canvas、监听器和字体；最后使用方通过 finally 释放。destroy 同步取消库内任务和迟到回调，清理已取得资源，但不等待不可取消的外部工作或声称撤回已交付任务。Viewer print/export 返回 completed/cancelled 判别结果，export 的完成结果可含 file；整体错误拒绝，无 Viewer throwOnError 分支。

字体 catalog/provider 与目标 document 的 FontFaceSet 就绪检查分别使用 `resource-readiness.ts` 集中定义的 3,000 ms 有限、可取消预算。测量前选择实际可用字体或确定的 sans-serif fallback；provider 字体使用每轮唯一的 CSS family，防止另一轮或另一 Viewer 的注入和清理改变旧输出。候选 img/srcset 和内联 CSS 背景图并行等待加载/解码，失败或超时使用可见占位与诊断，提交后的选择不随迟到完成改变；新一轮渲染才重试。没有 DOM 的纯计算不声称图片已解码。真实 Chromium 检查入口为 `node internal-packages/viewer-runtime/scripts/check-resource-readiness.mjs`，可用 `EASYINK_RENDER_BROWSER_PATH` 指定浏览器；检查启动隔离临时 profile、本地资源服务，结束后清理。

## 6.4 设计态渲染与 Viewer 渲染的分层

EasyInk 存在两套独立的物料渲染能力，不共享实现代码：

| | 设计态渲染 | Viewer 渲染 |
|---|---|---|
| 接口 | `DesignerRenderInstance.renderContent(nodeSignal, container, renderContextSignal?)` | `ViewerSessionRenderer.render() / getRenderSize() / measure()` |
| 运行场景 | Designer 画布内 | Viewer 运行时（预览/打印/导出） |
| 数据 | 无真实数据，绑定显示为字段标签；页码等通过临时设计态上下文预览 | 真实数据绑定 + 格式化 |
| 性能要求 | 主线程同步渲染，必须轻量 | prepare 可异步；measure/分页/render/getRenderSize 同步，可按需加载重量级实现 |
| 输出 | HTML 注入画布元素容器 | DOM/SVG 页面 + 缩略图 |

详细设计见 [10.9 画布设计态渲染](./10-designer-interaction.md) 和 [11.6 Designer 扩展面](./11-element-system.md)。

## 6.5 设计器与 Viewer 的全量预览关系

设计器预览时：

1. Designer 把当前 Schema 和调试数据传给 iframe Viewer，不传 `dataSources`。
2. Viewer 重新做绑定解析、分页和渲染。
3. Designer 只接收预览结果事件，不直接操纵 Viewer 内部 DOM。

这保证：

- 设计器不会把自己的编辑态 DOM 误当成真实预览
- 宿主应用与设计器内预览共享同一运行时路径

## 6.6 数据与格式规则处理

Viewer 在渲染前执行：

- `BindingRef.fieldPath` 路径解析
- `BindingRef.format` 显示格式解释
- `DataContractBinding` 目标数据模型解析
- 聚合规则求值

显示格式规则由 Viewer 在绑定解析边界统一执行：

1. 使用 `resolveBindingValue()` 或表格行内解析得到原始值
2. 若值为 `null / undefined / ''`，先使用 `format.fallback`
3. `format.mode='preset'` 时执行内置格式：`datetime / weekday / chinese-money / number / currency / percent`
4. `format.mode='custom'` 时执行可信模板函数表达式 `(value, data) => string`
5. 最后拼接 `format.prefix` 与 `format.suffix`
6. 失败时保留原始显示值并发出 `datasource` warning

自定义函数是同步、可信模板能力。函数可以读取当前字段值和 Viewer 正在消费的完整运行时 data；不应依赖物料差异、DOM、网络或异步副作用。

### 6.6.0 Material Data Contract 解析

`DataContractBinding` 不走普通 `resolvedProps` 投影。它由消费该目标数据模型的物料调用 `@easyink/core` 的 `resolveMaterialDataContract(contract, binding, data)` 解析，再把目标 records 转成物料运行时数据。

当前 chart-bar 的路径是：

1. 物料定义声明 `CHART_BAR_DATA_CONTRACT`：`model.kind='tabular'`，目标字段为 `category` 和 `value`。
2. Designer 把用户拖拽字段写入 `node.binding.kind='data-contract'` 的 `mappings`。
3. Viewer 渲染 chart-bar 时传入 `context.data`。
4. `resolveMaterialDataContract()` 读取完整 `select.path`，推导 relation，并输出目标 records。
5. chart-bar 将 records 转成 `{ label, value }[]` 后渲染 SVG 图表。

Resolver 的推导规则：

- 若多个 mapping 的完整 path 共享同一个数组父级，例如 `monthlySales/month` 与 `monthlySales/revenue`，按 record collection 解析。
- 若 mapping 直接指向多个数组，例如 `category` 与 `values`，按 index 对齐，长度取最短数组。
- 若 `data[sourceId]` 存在且该候选根能解析 mapping path 或 path 的父级集合，则优先从该 source-scoped root 读取；否则回退到全局 `data` 根读取。
- `relation.kind='record'` 会要求 record collection 可解析；失败时返回 invalid 并产生 diagnostic。
- `relation.kind='index'` 会跳过 record 推导，直接要求 index 对齐。

这条链路的核心约束是：binding 保存 source mapping，不保存 resolver mode。Viewer 和物料渲染器不得把 `select.path` 截断成集合内字段后写回 schema。

### 6.6.1 table-data 会话准备与片段

`@easyink/material-table-data/viewer` 的完整物料入口使用 `createTableDataSession()`。其 `prepare()` 根据源节点的原声明高度、本轮绑定后的 props 和固定 data 展开 repeat-template 行，解析 staticBinding，过滤 header/footer，再计算 rows、rowHeights 和 totalHeight。状态保存在该会话私有 Map 中，按框架分配的运行引用区分源实例与派生片段，不依赖 table 对象身份或模块缓存。

`measure()` 同步读取准备结果，重复调用不会重新缩放或累加行高。分页通过框架的 `createFragment()` 分配新身份，为当前页与后续页保存各自的行数组和行高；后续片段不重新展开原表。剩余可分正文行数必须是非负安全整数，有 nextPage 时严格递减；无进展、异常或越界引用会停止该源项并诊断/占位。

core 仅携带可选 `LayoutFragment.runtimeRef`，不解释物料状态。Viewer 保留片段至页面绘制，按引用继承源节点的 resolved props，不用虚拟 id 重新查绑定。复制页与逐页 overlay 共享计算身份，每次绘制分别提供 pageContext 和输出资源范围；运行字段不写入文档 Schema。

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

ViewerRuntime 同时缓存 `ViewerPageMetrics[]`，作为打印策略的尺寸来源。打印阶段不能从 `.ei-viewer-page` 的 inline style 反推纸张尺寸；DOM 只承载输出，布局结果才是打印尺寸真值。

## 6.8 打印策略

打印入口先解析 `ViewerPrintPolicy`，再分发到浏览器 fallback 或 `PrintDriver`：

```typescript
interface ViewerPrintPolicy {
  pageSizeMode: 'driver' | 'fixed'
  pageMode: DocumentSchema['page']['mode']
  pageSizeMode: 'driver' | 'fixed'
  sheetSize?: { width: number, height: number, unit: string, source: 'schema' | 'rendered' }
  pageBreakBehavior: { after: 'auto' | 'page', inside: 'auto' | 'avoid' }
  offset: { horizontal: number, vertical: number, unit: string }
}
```

策略规则：

- 连续纸 + driver：`pageSizeMode='driver'`，不输出固定 `@page size`，避免连续纸被浏览器或驱动裁切。
- 连续纸 + fixed：`pageSizeMode='fixed'`，`sheetSize.source='rendered'`，尺寸来自 render 后缓存的 `ViewerPageMetrics`。
- `fixed`：尺寸来自 schema page。
- `PagePrintConfig` 的 offset 只进入策略对象，CSS 模板不重新读取 schema。

## 6.9 样式与承载策略

### 设计器

- 以编辑体验为主
- 可使用 Shadow DOM 或局部样式隔离
- 不要求和打印 DOM 完全同构

### Viewer

- 以稳定预览、打印和导出为主
- 使用 iframe 隔离上下文
- 内部仍以 DOM/SVG 为主要输出
- 自动生成页面样式、打印样式和缩略图容器

## 6.10 导出依赖装载

对标产品预览时已经验证 `viewer` 会动态加载：

- `pptxgenjs`
- `jszip`
- `jspdf`
- `file-saver`
- `docx`

这意味着 EasyInk 需要把导出能力建模成运行时插件：

- 预览核心路径不强绑定某一个导出格式
- 第三方导出依赖按需装载
- 装载失败时给出可见诊断，而不是让整个 Viewer 崩溃

## 6.11 诊断机制

诊断事件至少覆盖：

| scope | category | 触发场景 |
|---|---|---|
| schema | schema | 缺字段、未知元素、迁移降级 |
| datasource | datasource | 数据源缺失、路径无效、字段类型不匹配 |
| font | viewer | 字体加载失败 |
| material | viewer | 单个物料渲染异常 |
| print | print | 打印策略缺失、打印 DOM 操作或 window.print() 失败 |
| exporter | exporter | 第三方依赖加载失败、格式不支持 |

所有问题默认都应该是可见的、可追踪的，而不是静默跳过。

### 6.11.1 统一诊断中间件

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
  scope: 'schema' | 'datasource' | 'font' | 'material' | 'print' | 'exporter'
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

### 6.11.2 诊断阶段覆盖

| 阶段 | 文件 | 诊断码 |
|---|---|---|
| schema 校验 | `runtime.ts` | `INVALID_SCHEMA` |
| datasource/binding | `runtime.ts` | `BINDING_RESOLVE_ERROR` |
| font 加载 | `font-loader.ts` | `FONT_LOAD_FAILED` |
| material 渲染 | `render-surface.ts` | `MATERIAL_RENDER_ERROR` |
| flow-y 回流 | `reflow-engine.ts` | `FLOW_Y_FIXED_OVERLAP` |
| 自动分页 | `pagination-engine.ts` | `AUTO_SHEETS_FRAGMENT_OVERFLOW` |
| print | `runtime.ts` | `PRINT_ERROR`, `PRINT_RENDER_METRICS_MISSING` |
| exporter | `runtime.ts` | `NO_EXPORTER` |
