# 24. 页面布局正交体系

本文档记录当前已经落地的页面布局架构。它不是新功能愿景清单，而是代码实现的同步说明：页面介质、布局、测量重排和分页是四个可组合维度，`page.mode` 不再承担所有策略分发。

## 24.1 当前结论

- 合法 `PageMode` 只有 `fixed | continuous`。
- 连续纸模板使用 `continuous + continuous-paper + stack-flow + flow-y + none`。
- `page.pageModel / page.layout / page.reflow / page.pagination` 是策略语义来源；Viewer 只消费经过 compiled profile admission 的 canonical document。
- `page.layers` 是页面级渲染层数组，和上述布局策略字段不是同一类概念；它用于整页水印等非 MaterialNode 的页面装饰。
- Viewer 运行期先生成 `MaterialLayoutPlan`，再由 core document layout 和 pagination 生成 `LayoutDocument` 与 `OutputPagePlan[]`。
- Designer 编辑态通过 `EditorSurfacePlan` 描述纸张和连续画布，不直接复用 Viewer 的输出页计划。

## 24.2 四个维度

```text
Compiled Profile + Document Input
  -> Profile Admission
  -> Effective Output + Runtime Model
  -> Resource Readiness + MeasureService
  -> MaterialLayoutPlan
  -> Document Layout + Core Pagination
  -> Page Overlays
  -> ViewerRenderTree / Imperative Host
  -> Browser DOM
```

| 维度 | 回答的问题 | 当前实现 |
| --- | --- | --- |
| Page Model | 介质是什么、纸张多大、是否连续纸 | `packages/core/src/page-model.ts` |
| Layout | 元素先如何进入文档坐标 | `packages/core/src/layout-strategy.ts` |
| Reflow | 测量后是否沿 Y 轴推移 flow 元素 | `packages/core/src/reflow-engine.ts` |
| Pagination | 文档坐标如何变成输出页或 sheet | `packages/core/src/pagination-engine.ts` |
| Page Overlays | 哪些元素在分页完成后按输出页复制 | `packages/viewer/src/runtime.ts` |
| Editor Surface | Designer 如何显示可编辑纸张 | `packages/core/src/editor-surface-plan.ts` |

不变量：`MaterialNode.x/y/width/height` 存储文档坐标；测量、回流、分页和编辑态投影都不能把运行结果静默写回原始 schema。

## 24.3 Schema 契约

`PageSchema` 保留原有打印和背景字段，并增加四层策略字段：

```ts
interface PageSchema {
  mode: 'fixed' | 'continuous'
  width: number
  height: number
  pages?: number
  copies?: number
  blankPolicy?: 'keep' | 'remove' | 'auto'
  background?: PageBackground
  print?: PagePrintConfig
  layers?: PageLayerConfig[]

  pageModel?: PageModelConfig
  layout?: DocumentLayoutConfig
  pagination?: PaginationConfig
  reflow?: ReflowConfig
}

type PageModelKind = 'paged-paper' | 'continuous-paper'
type LayoutStrategyKind = 'absolute' | 'stack-flow' | 'region-flow'
type PaginationStrategyKind = 'none' | 'fixed-sheets' | 'auto-sheets'
type ReflowStrategyKind = 'none' | 'measure-only' | 'flow-y'

interface MaterialNode {
  placement?: { mode?: 'flow' | 'fixed' }
  break?: {
    keepTogether?: boolean
    before?: 'auto' | 'page'
    after?: 'auto' | 'page'
  }
  repeat?: { scope?: 'none' | 'every-output-page' }
}

type PageLayerPlacement = 'under-content' | 'over-content' | 'top'

interface TextWatermarkPageLayerConfig {
  id: string
  kind: 'watermark'
  type: 'text'
  enabled?: boolean
  placement?: PageLayerPlacement
  zIndex?: number // 0..999, local to the placement band
  text?: string
  rotation?: number
  opacity?: number // 0..1
  fontSize?: number
  gap?: number
  color?: string
}
```

默认组合由 `packages/schema/src/defaults.ts` 生成：

| `page.mode` | `pageModel.kind` | `layout.strategy` | `reflow.strategy` | `pagination.strategy` |
| --- | --- | --- | --- | --- |
| `fixed` | `paged-paper` | `absolute` | `measure-only` | `fixed-sheets` |
| `continuous` | `continuous-paper` | `stack-flow` | `flow-y` | `none` |

Profile admission 只接受已声明的页面介质和 canonical material envelope；Viewer 不在 layout 阶段补齐、迁移或改写输入。

### 24.3.1 页面级渲染层

`page.layers` 表达整页级、非元素级的渲染层。当前支持 `kind='watermark'`、`type='text'` 的文字水印层。默认文字水印 id 为 `page-watermark`，默认 `placement='over-content'`，默认 `zIndex=0`，`zIndex` 只在所属 placement band 内排序，范围固定为 `0..999`，不能穿透到其它 band。

Designer 和 Viewer 都通过 `@easyink/core` 的 `resolvePageLayerPlans()`、`groupPageLayerPlansByPlacement()` 和 `resolvePageLayerStackIndex()` 消费页面层计划；不得在两端各自实现 layer 排序、层级或水印 tile 生成规则。Viewer 对相同页面尺寸缓存 layer buckets，避免多页同尺寸重复生成水印 tile。

`page.layers` 与 `node.output.repeat.scope='every-output-page'` 的边界：

- `page.layers`：整页背景/前景装饰，当前用于文字水印；不是可选中、可拖拽、可绑定数据的 MaterialNode。
- `output.repeat.scope`：元素级页眉、页脚、页码、Logo 或可编辑水印；源节点仍在 `schema.elements[]`，Designer 只有一份可编辑源节点，其它页是预览/输出复制。

## 24.4 Viewer 管线

ViewerRuntime 当前主流程：

1. 编译 material profile，并通过 `loadDocumentWithProfile()` 执行 document admission。
2. 解析 effective output state，再激活 Viewer facet 并解析 runtime model。
3. 等待字体和资源 revision 就绪。
4. `MeasureService` 以明确 revision/constraint dependency keys 调用 `MaterialViewerLayoutFacet`，提交 `MaterialLayoutPlan`。
5. core document layout 根据 `reflow.strategy` 生成 `LayoutDocument`，不回写 Schema。
6. core pagination 从已提交的 break opportunities 选择断点；material fragment adapter 只按选择结果创建片段，不决定页面。
7. 在 pagination 之后生成 page overlays，并注入页码上下文。
8. 生成 `ViewerRenderTree` 或受能力约束的 imperative host mount，交给 render surface 提交 browser DOM。
9. 缓存已提交的 `ViewerPageMetrics` 供打印策略使用。

`RenderSurface` 只消费已提交的页面和渲染计划，不根据 `page.mode` 或物料类型重新判断布局或分页策略。

## 24.5 分页策略语义

| 策略 | 行为 |
| --- | --- |
| `fixed-sheets` | 按 `pagination.pageCount ?? page.pages ?? 1` 生成固定页；元素按文档 Y 坐标归页；支持 `blankPolicy='remove'` 与 `copies`；显式 page break 只输出 info 诊断。 |
| `auto-sheets` | 按页面高度自动切页；支持 `pageBreakBefore / pageBreakAfter / keepTogether`；core 从物料发布的 break opportunities 选择合法断点，否则输出 overflow 诊断。 |
| `none` | 连续纸只输出一张 sheet；高度为内容底边加尾部留白，且不因 page break 约束切成固定页。 |

分页控制字段从 admitted canonical document 的 `node.output.placement` 与 `node.output.break` 读取并投影为 `LayoutFragment.flow`，layout 阶段只有这一套合同。当前约定：`output.placement.mode !== 'fixed'` 的节点参与 flow；固定节点不会被 `flow-y` 推移，也不触发分页 break；若回流后与 flow 节点新增重叠，输出 `FLOW_Y_FIXED_OVERLAP`。

## 24.5.1 节点局部行为

节点级布局行为分三层，避免把所有控制塞进物料私有 props：

| 行为 | 字段 | 生效阶段 | UI 语义 |
| --- | --- | --- | --- |
| 位置行为 | `output.placement.mode` | reflow | 跟随内容 / 固定位置 |
| 跨页规则 | `output.break.keepTogether / before / after` | `auto-sheets` pagination | 保持整体、前置分页、后置分页 |
| 每页重复 | `output.repeat.scope='every-output-page'` | pagination 之后 | 每个输出页都显示 |

跨页规则只对参与 flow 的节点生效；固定位置节点即使保留旧 break 字段，也不会切页。每页重复节点不参与 layout/reflow/pagination，它们是分页完成后的 page overlay，因此不会影响页数或连续纸高度。但在 `fixed-sheets + blankPolicy='remove'` 下，可见的每页重复 overlay 会保留对应输出纸张，避免只有页码、页眉、页脚或水印的页面被误判为空白页。

Designer 属性面板按页面策略注入行为项：

| 页面组合 | 显示行为 |
| --- | --- |
| `absolute + fixed-sheets` | 每页重复 |
| `stack-flow + flow-y + none` | 跟随内容 / 固定位置、每页重复 |
| `stack-flow + flow-y + auto-sheets` | 跟随内容 / 固定位置、跨页规则、每页重复 |

每页重复不是隐藏的高级能力。页码物料默认 `output.repeat.scope='every-output-page'`，普通文本、图片等也可显式开启，用于页眉、页脚、水印等通用场景。

## 24.6 可分页物料

可分页物料通过 `MaterialViewerLayoutFacet.measure()` 返回 `MaterialLayoutPlan.breakOpportunities` 和只读 payload。core pagination 统一选择断点；可选 `MaterialFragmentAdapter.createFragment()` 只消费已选范围并创建对应 fragment，不能返回页面或自行决定分页。

`table-data` 的 layout facet 展开运行时记录、计算行高并发布 break opportunities。测量结果属于 runtime layout state，由 `MeasureService` 按 dependency keys 缓存；它不写回或依赖 Schema mutation。fragment adapter 根据 core 选定的行范围保留 header/footer 和稳定 source identity。

## 24.7 Designer 编辑表面

Designer 不直接读取 `page.width/page.height` 渲染唯一页面，而是消费 `createEditorSurfacePlan(schema)`：

| 页面组合 | 编辑态表现 |
| --- | --- |
| `fixed-sheets` | 连续 document surface；页只作为 `yOffset + height` 切片和 page break decoration 存在，`pageGap` 不进入坐标，编辑表面高度固定为 `resolvePageModel().height * pageCount`。 |
| `auto-sheets` | 单个纸张尺寸的连续编辑表面；输出页数仍由 Viewer 决定。 |
| `none` / `continuous-paper` | 单个纸张尺寸的连续编辑表面，高度固定为 `resolvePageModel().height`，不按内容底边自动增长。 |

每页重复元素在 Designer 中保留一份可交互源节点，其它输出页位置显示不可交互的重复预览。固定纸按页框复制预览；`auto-sheets` 在连续编辑表面内按分页参考线复制预览。预览只帮助用户理解输出效果，不参与选择、拖拽、缩放、吸附或命令历史。

坐标投影统一通过 `projectDocumentPointToEditorSurface()` 和 `projectEditorSurfacePointToDocument()`。网格、辅助线、吸附线、元素 overlay 和选区都消费同一个 `EditorSurfacePlan`。`visualTop` 和 `EditorSurfacePlan.pageGap` 已移除；普通编辑路径不得按 page slice clamp，禁止 drag/drop/resize/keyboard/paste 为 fixed-sheets 重新实现 page gap、nearest-page、page rect intersection 或页内编辑区逻辑。

分页提示渲染为独立分割标尺，而不是普通 border 虚线加伪元素三角。`PageBreakRuler` 只消费 `EditorSurfacePlan.decorations` 中的 `page-break`，并以 `decoration.position.y` 作为唯一锚点派生分割线、端点刻度和纸张外侧指针，避免缩放后线与指针分别取整造成错位。

物料 drop 是连续 document rect 创建行为，不以纸张 frame、分页带或 pageEl 可视矩形为有效性边界。投放在纸张左右外侧、最后页之后或当前可视画布外侧时，仍应创建物料，但不得让 `EditorSurfacePlan.contentBounds` 或 schema page 尺寸随内容自动增长；越界风险交给诊断系统表达。

纸张边界/中心线仍可作为拖拽或缩放的 page 辅助吸附候选，但分页线默认不作为吸附候选。需要吸附分页线时必须通过显式设置开启，并在交互反馈中区别于普通辅助线。

固定纸增删通过命令系统完成：

- `AddPageSheetCommand` 在目标页后插入一张纸，更新 `page.pages` 与 `pagination.pageCount`，并把后续元素整体下移一页。
- `RemovePageSheetCommand` 至少保留一页，删除目标页内元素，更新页数，并把后续元素整体上移一页。
- `CanvasWorkspace` 的页面工具栏只在 `fixed-sheets` 下显示新增、删除、上一页、下一页入口；命令消费 `EditorSurfacePlan` 和显式 `targetPageIndex`。

## 24.8 代码边界

- `@easyink/schema`：类型、默认层、validation，以及 invalid mode 的 loose input 回退。
- `@easyink/core`：页面模型解析、回流、分页、编辑表面计划、页面增删命令、页面 layer plan 与层级规则。
- `@easyink/viewer`：编排字体、绑定、测量、layout/pagination、page overlay 复制、页面 layer 渲染、打印策略。
- `@easyink/designer`：消费 `EditorSurfacePlan` 做编辑态投影、重复预览、页面 layer 预览和页面工具栏。
- `@easyink/material-*`：只提供渲染、layout facet 和 fragment adapter，不决定全局页面模型或分页断点。

## 24.9 后续扩展边界

新增能力时优先增加策略或物料协议，不扩展 `PageMode`：

- 多区域布局走 `layout.strategy='region-flow'`。
- 固定纸长文档自动分页走 `pagination.strategy='auto-sheets'`。
- 更多可分页结构物料发布 break opportunities，并按需实现 fragment adapter。
- 打印和导出继续消费 Viewer 输出页和 `ViewerPageMetrics`，不从 DOM 反推尺寸。

任何扩展都要保持三条底线：schema 表达稳定语义；运行态计划不回写 schema；不支持的自动行为必须输出诊断。
