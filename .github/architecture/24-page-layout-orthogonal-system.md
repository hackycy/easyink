# 24. 页面布局正交体系

本文档记录当前已经落地的页面布局架构。它不是新功能愿景清单，而是代码实现的同步说明：页面介质、布局、测量重排和分页是四个可组合维度，`page.mode` 不再承担所有策略分发。

## 24.1 当前结论

- 合法 `PageMode` 只有 `fixed | continuous | label`。
- 历史 `stack` 只是 legacy input，由 `@easyink/schema` 的 compat 入口迁移为 `continuous + continuous-paper + stack-flow + flow-y + none`。
- `page.pageModel / page.layout / page.reflow / page.pagination` 是策略语义来源，`normalizeDocumentSchema()` 会按 `mode` 补齐默认层。
- Viewer 运行期通过 `runLayoutPipeline()` 与 `runPagination()` 生成 `LayoutDocument` 和 `OutputPagePlan[]`；`page-planner.ts` 只保留兼容 facade。
- Designer 编辑态通过 `EditorSurfacePlan` 描述纸张、连续画布和标签 cell，不直接复用 Viewer 的输出页计划。

## 24.2 四个维度

```text
DocumentSchema
  -> Page Model
  -> Layout + Reflow
  -> Pagination
  -> Render Surface / Editor Surface
```

| 维度 | 回答的问题 | 当前实现 |
| --- | --- | --- |
| Page Model | 介质是什么、纸张多大、是否标签 sheet 或连续纸 | `packages/core/src/page-model.ts` |
| Layout | 元素先如何进入文档坐标 | `packages/core/src/layout-strategy.ts` |
| Reflow | 测量后是否沿 Y 轴推移 flow 元素 | `packages/core/src/reflow-engine.ts` |
| Pagination | 文档坐标如何变成输出页或 sheet | `packages/core/src/pagination-engine.ts` |
| Editor Surface | Designer 如何显示可编辑纸张 | `packages/core/src/editor-surface-plan.ts` |

不变量：`MaterialNode.x/y/width/height` 存储文档坐标；测量、回流、分页和编辑态投影都不能把运行结果静默写回原始 schema。

## 24.3 Schema 契约

`PageSchema` 保留原有打印和背景字段，并增加四层策略字段：

```ts
interface PageSchema {
  mode: 'fixed' | 'continuous' | 'label'
  width: number
  height: number
  pages?: number
  copies?: number
  blankPolicy?: 'keep' | 'remove' | 'auto'
  label?: LabelPageConfig
  background?: PageBackground
  print?: PagePrintConfig

  pageModel?: PageModelConfig
  layout?: DocumentLayoutConfig
  pagination?: PaginationConfig
  reflow?: ReflowConfig
}

type PageModelKind = 'paged-paper' | 'continuous-paper' | 'label-sheet'
type LayoutStrategyKind = 'absolute' | 'stack-flow' | 'region-flow'
type PaginationStrategyKind = 'none' | 'fixed-sheets' | 'auto-sheets' | 'label-sheets'
type ReflowStrategyKind = 'none' | 'measure-only' | 'flow-y'
```

默认组合由 `packages/schema/src/defaults.ts` 生成：

| `page.mode` | `pageModel.kind` | `layout.strategy` | `reflow.strategy` | `pagination.strategy` |
| --- | --- | --- | --- | --- |
| `fixed` | `paged-paper` | `absolute` | `measure-only` | `fixed-sheets` |
| `continuous` | `continuous-paper` | `stack-flow` | `flow-y` | `none` |
| `label` | `label-sheet` | `absolute` | `measure-only` | `label-sheets` |

兼容规则：如果输入 `page.mode === 'stack'`，`migrateLegacyStackPageMode()` 会在 validation 和 normalize 前改写为连续纸组合。新代码、AI 生成、属性面板和 schema validation 都不得重新把 `stack` 当成合法页面类型。

## 24.4 Viewer 管线

ViewerRuntime 当前主流程：

1. 迁移 legacy schema，并执行 schema validation。
2. 执行 schema normalize hook，保存规范 schema。
3. 加载字体。
4. 投影数据绑定，包含 table-data/table-static 的单元格预解析。
5. 调用物料 `measure()`，把运行态尺寸写入 `measurements` map。
6. `runLayoutPipeline()` 根据 `reflow.strategy` 生成 `LayoutDocument`。
7. `runPagination()` 根据 `pagination.strategy` 生成输出页，并通过 `FragmentPaginator` 处理可拆分页物料。
8. 注入页码上下文，渲染 DOM，缓存 `ViewerPageMetrics` 供打印策略使用。

`RenderSurface` 只消费页面计划和物料 registry，不根据 `page.mode` 或物料类型重新判断分页策略。

## 24.5 分页策略语义

| 策略 | 行为 |
| --- | --- |
| `fixed-sheets` | 按 `pagination.pageCount ?? page.pages ?? 1` 生成固定页；元素按文档 Y 坐标归页；支持 `blankPolicy='remove'` 与 `copies`；显式 page break 只输出 info 诊断。 |
| `auto-sheets` | 按页面高度自动切页；支持 `pageBreakBefore / pageBreakAfter / keepTogether`；元素过高时优先调用 `FragmentPaginator`，否则输出 overflow 诊断。 |
| `none` | 连续纸只输出一张 sheet；高度为内容底边加尾部留白，且不因 page break 约束切成固定页。 |
| `label-sheets` | `page.width/height` 表示单个标签 cell；`label.columns/rows/gap/rowGap` 推导 sheet 尺寸；`copies` 展开成一个或多个 sheet。 |

分页控制字段从 `node.props.layoutMode / keepTogether / pageBreakBefore / pageBreakAfter` 读取并投影为 `LayoutFragment.flow`。当前约定：`layoutMode !== 'fixed'` 的节点参与 flow；固定节点不会被 `flow-y` 推移，若回流后与 flow 节点新增重叠，输出 `FLOW_Y_FIXED_OVERLAP`。

## 24.6 可分页物料

`MaterialViewerExtension` 支持可选 `fragmentPaginator`：

```ts
interface FragmentPaginator {
  canPaginate(node: MaterialNode): boolean
  paginateFragment(input: FragmentPaginateInput): FragmentPaginateResult
}
```

`table-data` 已经实现首个分页器：

- `measureTableData()` 展开 repeat-template 行、处理 header/footer 显隐、计算运行态行高，并把结果缓存在 table schema 对象上。
- `tableDataFragmentPaginator` 在 `auto-sheets` 中按可用高度拆分行，当前页保留 header，后续页继续带 header，footer 进入剩余片段。
- 分页生成虚拟 table fragment，保留 `sourceNodeId`，不改写原始 `table.topology.rows`。

## 24.7 Designer 编辑表面

Designer 不直接读取 `page.width/page.height` 渲染唯一页面，而是消费 `createEditorSurfacePlan(schema)`：

| 页面组合 | 编辑态表现 |
| --- | --- |
| `fixed-sheets` | 多张固定纸纵向排列；`visualTop` 包含视觉 gap，`yOffset` 仍是文档坐标偏移。 |
| `auto-sheets` | 单个连续编辑表面，并显示分页参考线；输出页数仍由 Viewer 决定。 |
| `none` / `continuous-paper` | 单个可增长连续画布，高度按内容底边、最小高度和尾部留白计算。 |
| `label-sheets` | 默认编辑单个 label cell；输出 sheet 由 Viewer 展开。 |

坐标投影统一通过 `projectDocumentPointToEditorSurface()` 和 `projectEditorSurfacePointToDocument()`。网格、辅助线、吸附线、元素 overlay 和选区都消费同一个 `EditorSurfacePlan`。

固定纸增删通过命令系统完成：

- `AddPageSheetCommand` 在目标页后插入一张纸，更新 `page.pages` 与 `pagination.pageCount`，并把后续元素整体下移一页。
- `RemovePageSheetCommand` 至少保留一页，删除目标页内元素，更新页数，并把后续元素整体上移一页。
- `CanvasWorkspace` 的页面工具栏只在 `fixed-sheets` 下显示新增、删除、上一页、下一页入口；命令消费 `EditorSurfacePlan` 和显式 `targetPageIndex`。

## 24.8 代码边界

- `@easyink/schema`：类型、默认层、validation、legacy `stack` 迁移。
- `@easyink/core`：页面模型解析、回流、分页、编辑表面计划、页面增删命令。
- `@easyink/viewer`：编排字体、绑定、测量、layout/pagination、渲染、打印策略。
- `@easyink/designer`：消费 `EditorSurfacePlan` 做编辑态投影和页面工具栏。
- `@easyink/material-*`：只提供渲染、测量和局部分页能力，不决定全局页面模型。

`packages/viewer/src/stack-flow-layout.ts` 仍作为历史 helper 和测试资产存在；ViewerRuntime 的主路径已经使用 `@easyink/core` 的正交 layout/pagination pipeline。

## 24.9 后续扩展边界

新增能力时优先增加策略或物料协议，不扩展 `PageMode`：

- 多区域布局走 `layout.strategy='region-flow'`。
- 固定纸长文档自动分页走 `pagination.strategy='auto-sheets'`。
- 更多可分页结构物料实现 `FragmentPaginator`。
- 打印和导出继续消费 Viewer 输出页和 `ViewerPageMetrics`，不从 DOM 反推尺寸。

任何扩展都要保持三条底线：schema 表达稳定语义；运行态计划不回写 schema；不支持的自动行为必须输出诊断。
