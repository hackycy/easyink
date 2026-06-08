# 7. 布局与分页引擎

EasyInk 的布局引擎当前由三类纯规则组成：运行态测量回流、分页策略、物料局部分页。页面介质本身由 [24. 页面布局正交体系](./24-page-layout-orthogonal-system.md) 定义，本章只记录代码层如何执行。

## 7.1 执行入口

ViewerRuntime 不再直接按 `page.mode` 分支做布局，而是按以下入口编排：

```text
MaterialViewerExtension.measure()
  -> runLayoutPipeline(schema, { originalSchema, measured })
  -> runPagination(schema, layoutDocument, { originalSchema, resolveFragmentPaginator })
  -> resolve page overlays
  -> RenderSurface
```

相关文件：

| 文件 | 职责 |
| --- | --- |
| `packages/core/src/layout-plan.ts` | 定义 `LayoutDocument`、`LayoutFragment`、`OutputPagePlan` 和诊断结构。 |
| `packages/core/src/layout-strategy.ts` | 应用测量尺寸，并按 `reflow.strategy` 调用回流引擎。 |
| `packages/core/src/reflow-engine.ts` | 实现 `flow-y`：按原始文档顺序传播高度差，并诊断 flow 元素与 fixed 元素的新重叠。 |
| `packages/core/src/pagination-engine.ts` | 实现 `fixed-sheets / auto-sheets / none`。 |
| `packages/core/src/page-planner.ts` | 兼容旧 `createPagePlan()` API，内部委托新 pipeline。 |

## 7.2 LayoutFragment

布局和分页阶段不直接复制整份 schema，而是围绕 fragment 传递：

```ts
interface LayoutFragment {
  id: string
  sourceNodeId: string
  node: MaterialNode
  box: { x: number, y: number, width: number, height: number }
  flow: {
    participates: boolean
    keepTogether?: boolean
    pageBreakBefore?: boolean
    pageBreakAfter?: boolean
  }
  measured?: ViewerMeasureResult
}
```

约束：

- `box` 是当前阶段的文档坐标，不是页面局部坐标。
- `sourceNodeId` 指向原始 schema 节点；虚拟 fragment 也必须保留它。
- `flow` 由 `node.placement / node.break` 投影而来；旧 `node.props.layoutMode / keepTogether / pageBreakBefore / pageBreakAfter` 只作为兼容 fallback。
- 运行态测量和分页不能回写原始 schema。

## 7.3 测量与 flow-y 回流

测量阶段由 ViewerRuntime 调用物料的 `measure()`，并把结果传给 core。`runLayoutPipeline()` 会先把测量尺寸应用到节点副本，再根据 `page.reflow.strategy` 决定是否回流。

`flow-y` 规则：

- 以原始元素顺序为基准，按 `y -> x -> 原始 index` 排序。
- 同一原始 `y` 带内的元素共享一组高度差，避免并排元素互相推动。
- `placement.mode !== 'fixed'` 的元素参与 flow；`placement.mode='fixed'` 的元素保持原始坐标。
- 动态元素变高会下推后续 flow 元素，变矮会拉回后续 flow 元素。
- 回流后如果 flow 元素与 fixed 元素产生新的重叠，输出 `FLOW_Y_FIXED_OVERLAP`。

## 7.4 分页策略

`runPagination()` 只消费 `LayoutDocument` 和 schema 页面策略：

| 策略 | 当前行为 |
| --- | --- |
| `fixed-sheets` | 固定页高；按 `pagination.pageCount ?? page.pages ?? 1` 生成页面；元素按 `box.y` 归页；支持空白页移除和 copies。 |
| `auto-sheets` | 按页面高度自动切分；支持 break before/after、keepTogether 和 fragment paginator。 |
| `none` | 连续纸输出一页；高度取内容底边加模板尾部留白。 |

`fixed-sheets` 不会因为 page break 属性自动重排绝对定位元素，只输出诊断。`none` 不会把连续纸切成固定页。真正会执行 page break 和 keepTogether 的策略是 `auto-sheets`。

## 7.4.1 每页重复

`repeat.scope='every-output-page'` 是分页后的 page overlay 行为，不属于 layout/reflow/pagination 输入。ViewerRuntime 会在进入 layout pipeline 前排除这些节点，避免页码、页眉、页脚、水印影响内容高度或页数；分页完成后再按每个输出页复制，并注入 `__pageNumber / __totalPages`。material registry 的 `pageAware` 仍作为物料默认重复能力，例如页码物料。

`fixed-sheets + blankPolicy='remove'` 是一个例外边界：可见的 page overlay 不参与分页输入，但会作为 `retainBlankPage` 条件参与空白页过滤，确保只有重复页码/页眉/水印的纸张仍被输出。

`page.layers` 是另一条页面级渲染层路径，不属于 MaterialNode，也不参与 layout/reflow/pagination/blankPolicy。当前文字水印通过 `page.layers[]` 在 RenderSurface 中按 placement 插入到内容层上下；可编辑、可绑定或需要作为空白页保留条件的页眉、页脚、页码、Logo 仍应建模为 `schema.elements[]` + `repeat.scope='every-output-page'`。

## 7.5 table-data 局部分页

`table-data` 是第一个实现 `FragmentPaginator` 的物料：

1. `measureTableData()` 展开 repeat-template 行，解析 header/footer 显隐，并计算运行态行高。
2. 运行态行布局缓存在 table schema 对象的 WeakMap 上，避免 render 阶段用测量后的 `node.height` 二次缩放。
3. `tableDataFragmentPaginator.paginateFragment()` 在 `auto-sheets` 中按可用高度切行。
4. 分页结果生成虚拟 table fragment，保持 `sourceNodeId`，不修改原始 topology。

当前职责边界：表格知道如何拆自己的行；全局页数、页码上下文和连续纸高度仍由 `pagination-engine` 决定。

## 7.6 Designer 与 Viewer 的差异

Designer 编辑的是声明坐标，Viewer 输出的是运行态页面计划。两者共享 schema 和 core 页面模型，但不共用同一个页面计划：

- Designer 使用 `EditorSurfacePlan` 显示固定多页或连续画布。
- Viewer 使用 `OutputPagePlan[]` 渲染预览、打印和导出页面。
- `auto-sheets` 在 Designer 中是一个连续编辑表面加分页参考线，最终页数仍由 Viewer pipeline 计算。

## 7.7 诊断原则

布局引擎不静默移动、裁切或丢弃内容。当前核心诊断包括：

| 诊断码 | 来源 |
| --- | --- |
| `FLOW_Y_FIXED_OVERLAP` | `flow-y` 回流后新增重叠。 |
| `FIXED_SHEETS_BREAK_CONSTRAINT_IGNORED` | 固定页中 page break 约束只作为提示。 |
| `CONTINUOUS_BREAK_CONSTRAINT_IGNORED` | 连续纸不因 page break 切页。 |
| `AUTO_SHEETS_FRAGMENT_OVERFLOW` | 自动分页中 fragment 高度超过单页且无可用分页器。 |
| `TABLE_DATA_FRAGMENT_OVERFLOW` | 表格分页器无法在当前剩余高度放下至少一行正文。 |
