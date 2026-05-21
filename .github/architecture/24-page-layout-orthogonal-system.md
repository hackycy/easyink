# 24. 页面、布局、分页、测量重排正交体系

本文档定义 EasyInk 下一阶段的页面与布局架构。目标不是在历史 `fixed / stack / label` 页面模式上继续追加分支，而是把页面模型、布局策略、分页策略、测量重排引擎拆成四个可独立表达、独立演进、组合使用的维度。`stack` 不再作为新的页面类型暴露，只作为旧 schema 的迁移输入。

## 24.1 当前问题

现有实现已经具备可用的基础能力，但职责边界发生了混叠：

- `packages/schema/src/types.ts` 的 `PageSchema.mode` 同时表达纸张形态、布局方式、分页方式和打印语义。
- `packages/core/src/page-planner.ts` 同时处理固定页、多页、连续纸、标签复制和空白页策略。
- `packages/viewer/src/runtime.ts` 在一个流程里完成绑定、测量、`stack` 回流、分页计划、页码复制和 DOM 渲染调度。
- `packages/viewer/src/stack-flow-layout.ts` 只服务 `stack`，但它表达的是更通用的测量后重排能力。
- `packages/designer/src/components/CanvasWorkspace.vue` 只渲染一个编辑页，编辑态页面模型与 Viewer 运行态页面计划没有统一中间层。
- `packages/materials/table-data/src/viewer.ts` 已有运行态展开和测量，但表格分页仍未成为可被分页策略调用的标准协议。
- `packages/schema-tools/src/domain-profile.ts` 已经出现 `continuous` 语义，但历史 schema 校验、默认值、设计器属性面板曾只承认 `fixed / stack / label`。

根因：`page.mode` 被当成总开关。它把"纸是什么"、"内容怎么排"、"输出怎么切页"、"动态内容怎么测量重排"压进一个枚举，导致新增能力只能继续加特判。

## 24.2 四层正交模型

新的体系把页面输出拆成四层：

```text
DocumentSchema
  |
  v
Page Model        纸张、画布、页集、背景、打印物理语义
  |
  v
Layout Strategy   元素如何放进文档坐标空间
  |
  v
Reflow Engine     运行态测量、依赖传播、冲突诊断
  |
  v
Pagination        把文档坐标空间切成输出 sheets/pages
  |
  v
Render Surface    只消费输出页面计划，不参与策略判断
```

四层职责必须互相正交：

| 维度 | 回答的问题 | 不负责 |
| --- | --- | --- |
| 页面模型 | 纸张尺寸、页集形态、背景、打印偏移、标签纸网格 | 元素如何流动、动态内容如何变高 |
| 布局策略 | schema 元素如何形成设计态或运行态文档坐标 | 把文档切成多少页 |
| 测量重排引擎 | 绑定后物料自然尺寸、依赖传播、重叠和溢出诊断 | 纸张物理尺寸和打印驱动策略 |
| 分页策略 | 输出页、页断点、页码上下文、重复页眉页脚、标签复制 | 物料内部测量细节 |

## 24.3 Schema 目标形态

`page.mode` 只表达页面介质类型；结构化字段是布局、分页和测量重排的真正语义来源：

```ts
interface PageSchema {
  mode: PageMode
  width: number
  height: number
  pages?: number
  copies?: number
  blankPolicy?: BlankPolicy
  label?: LabelPageConfig
  background?: PageBackground
  print?: PagePrintConfig

  pageModel?: PageModelConfig
  layout?: DocumentLayoutConfig
  pagination?: PaginationConfig
  reflow?: ReflowConfig
}

type PageMode = 'fixed' | 'label' | 'continuous'

type PageModelKind = 'paged-paper' | 'continuous-paper' | 'label-sheet'
type LayoutStrategyKind = 'absolute' | 'stack-flow' | 'region-flow'
type PaginationStrategyKind = 'none' | 'fixed-sheets' | 'auto-sheets' | 'label-sheets'
type ReflowStrategyKind = 'none' | 'measure-only' | 'flow-y'

interface PageModelConfig {
  kind: PageModelKind
  paper: {
    width: number
    height: number
    minHeight?: number
    maxHeight?: number
  }
}

interface DocumentLayoutConfig {
  strategy: LayoutStrategyKind
  flowAxis?: 'y'
}

interface PaginationConfig {
  strategy: PaginationStrategyKind
  pageCount?: number
  pageGap?: number
  orphanPolicy?: 'allow' | 'keep-together'
}

interface ReflowConfig {
  strategy: ReflowStrategyKind
  preserveTrailingGap?: boolean
  collisionPolicy?: 'diagnose' | 'clip' | 'push'
}
```

规范组合：

| `page.mode` | 页面模型 | 布局策略 | 测量重排 | 分页策略 |
| --- | --- | --- | --- | --- |
| `fixed` | `paged-paper` | `absolute` | `measure-only` | `fixed-sheets` |
| `continuous` | `continuous-paper` | `stack-flow` 或 `absolute` | `flow-y` 或 `measure-only` | `none` |
| `label` | `label-sheet` | `absolute` | `measure-only` | `label-sheets` |

旧模式迁移：

| 旧 `page.mode` | 迁移后 `page.mode` | 页面模型 | 布局策略 | 测量重排 | 分页策略 |
| --- | --- | --- | --- | --- | --- |
| `stack` | `continuous` | `continuous-paper` | `stack-flow` | `flow-y` | `none` |

原则：

- `mode` 只作为页面介质类型和 UI 快捷预设，不再作为底层策略分发的唯一依据。
- `stack` 不进入 `PageMode` 类型、schema validation、AI 生成枚举或设计器页面类型选项。
- 旧 schema 入口若发现 `page.mode === 'stack'`，必须先迁移为 `continuous + continuous-paper + stack-flow + flow-y + none`，再进入 validation、normalize、Viewer 或 Designer。
- 新字段进入 schema 后必须由 `normalizeDocumentSchema()` 补齐，不要求宿主一次性传全。
- 旧模板允许通过迁移入口运行，但运行期内部不保留 `stack` 分支。
- `continuous` 与旧 `stack` 的差异是页面模型语义更明确：连续纸是输出介质，`stack-flow` 只是布局策略之一。

## 24.4 核心包职责调整

### `@easyink/schema`

负责保存可回放语义：

- 收敛 `PageMode` 为 `fixed | continuous | label`，补齐 `pageModel / layout / pagination / reflow` 类型。
- 在 defaults 中从旧 `mode` 推导四层配置。
- 在 validation 中校验每层字段，不把策略组合写死在 Viewer。
- migration / compat 负责把旧 `stack` 页面模式升级为现行连续纸 + 流式布局组合，不改变元素坐标。

### `@easyink/core`

承接纯规则引擎：

- `page-model.ts`：把 schema 转成规范 `ResolvedPageModel`。
- `layout-strategy.ts`：注册和选择布局策略。
- `reflow-engine.ts`：执行测量、依赖传播、诊断生成。
- `pagination-engine.ts`：执行页面切分，替代当前 `page-planner.ts` 的模式分支。
- `layout-plan.ts`：定义 Viewer 和 Designer 都能消费的中间结果。

`page-planner.ts` 可以保留为兼容 facade，但内部应委托新引擎。

### `@easyink/viewer`

ViewerRuntime 只编排，不拥有策略：

```text
normalize schema
resolve bindings
resolve page model
run layout strategy
run reflow engine
run pagination strategy
resolve page-aware context
render pages
resolve print policy
```

`render-surface.ts` 继续只消费 `OutputPagePlan[]`，不得按 `page.mode` 或 `materialType` 写分支。

### `@easyink/designer`

设计器使用同一套页面模型，但允许只运行编辑态布局：

- `CanvasWorkspace` 不直接从 `page.width / page.height` 推导唯一页面，而是消费 `EditorSurfacePlan`。
- 固定多页采用多页画布作为主交互，不把 page tabs 作为第一优先级。
- 连续纸显示一个可增长 canvas，底部留白来自 `reflow.preserveTrailingGap`。
- 标签纸编辑单个 label cell，同时可切换 sheet preview。

#### 设计器多页交互架构

设计器的编辑态页面由 `EditorSurfacePlan` 描述，而不是直接由 Viewer 的 `OutputPagePlan` 驱动：

```ts
interface EditorSurfacePlan {
  pages: EditorSurfacePagePlan[]
  pageGap: number
  contentBounds: {
    width: number
    height: number
  }
}

interface EditorSurfacePagePlan {
  index: number
  width: number
  height: number
  yOffset: number
  visualTop: number
  kind: 'page' | 'continuous' | 'label-cell'
}
```

原则：

- Designer 显示的是可编辑纸张和画布段，Viewer 输出的是最终分页结果；两者共享页面模型，但不强行共用同一个运行态分页计划。
- `MaterialNode.y` 始终存储文档坐标。第 N 张固定纸的编辑局部坐标通过 `localY = node.y - page.yOffset` 投影。
- `EditorSurfacePlan` 不保存 `activePageIndex`，也不把页面焦点写入 store。页面上下文只能由指针位置、选择集、滚动视口或显式命令参数临时推导。
- 设计器增删纸张只改变编辑态页集，不执行运行态测量重排，也不回写测量后的元素尺寸。
- 自动分页页数由运行态内容决定，设计器不得把自动分页结果直接写成手工纸张数量。

页面上下文的派生规则：

- `hoverPageIndex`：由 pointer hit-test 得出。指针在纸张内部或页面边缘吸附区域时存在；指针在页间空隙时为空。
- `selectionPageIndexes`：由选中元素的 `y / height` 与 `EditorSurfacePagePlan.yOffset / height` 求交集得出。跨页元素可以同时归属多页。
- `viewportPageIndex`：由滚动容器中线与页面视觉矩形求最近页得出，只用于页面定位、迷你导航和初始工具条显隐，不影响拖拽落点。
- `commandTargetPageIndex`：新增、删除、定位等页面命令必须显式传入目标页；来源可以是 hover、selection 或页面列表点击，但命令内部不得读取全局页面状态。

画布布局与居中规则：

- 多页固定纸使用纵向 page stack。所有页面按最大页面宽度所在的中轴线水平居中，页面之间使用 `pageGap` 作为视觉间距。
- `yOffset` 表示文档坐标偏移，不包含视觉间距；`visualTop` 表示编辑器中实际绘制位置，等于前序页面高度和视觉 gap 的累积。
- 滚动容器内容尺寸来自 `contentBounds`，其宽度至少等于视口宽度。缩放后页面组在可视区域内水平居中，页面比视口宽时保留左侧安全边距并允许水平滚动。
- 新建、切换纸张数量或缩放时，优先保持当前视口中心对应的文档坐标稳定；没有历史视口时默认把第一页水平居中并显示顶部留白。
- 网格、参考线、选区框、吸附线和元素 overlay 都渲染在同一文档坐标层，通过 `page.yOffset` 与 `page.visualTop` 做坐标投影，不能各自维护一套页面偏移。

拖拽与落点规则：

- 从物料面板拖入画布时，落点由 drop pointer 所在页面决定：`node.y = targetPage.yOffset + localY`。如果指针落在页间空隙，使用最近页面的边缘吸附点并给出边缘预览。
- 拖动画布内已有元素时，元素按连续文档坐标移动，跨过页面边界时自然进入另一页；页面归属由最终坐标派生。
- 多选拖拽允许跨页移动，保持选区内部相对位置不变。若部分元素越过页面边界，Designer 只更新元素坐标，不自动新增纸张。
- 对 `fixed-sheets`，拖拽到最后一页下方的页外区域时默认阻止落点，并显示越界提示；新增纸张必须通过页面工具条或命令完成。
- 对 `auto-sheets` 和连续纸，拖拽下方越界可以扩展编辑态内容高度，但不把预测分页结果写回 `page.pages`。

画布侧提供一个轻量页面工具栏，锚定在目标纸张边缘附近，使用垂直布局、icon-only 按钮和 tooltip：

| 操作 | 图标语义 | 适用策略 | 写入字段 | 说明 |
| --- | --- | --- | --- | --- |
| 新增纸张 | plus / file-plus | `pagination.strategy='fixed-sheets'` | `page.pages` 与 `pagination.pageCount` | 在目标纸张后插入一张同尺寸纸。 |
| 删除纸张 | trash / file-minus | `pagination.strategy='fixed-sheets'` | `page.pages` 与 `pagination.pageCount` | 删除目标纸张，至少保留一张。 |
| 纸张定位 | chevron / list | `fixed-sheets` 可选 | 不写 schema | 快速跳到上一张、下一张或指定纸张。 |
| Sheet 预览 | grid / layers | `label-sheets` | 不写 schema | 从 cell edit 切到 sheet preview。 |
| 分页预览 | split / dashed-line | `auto-sheets` | 不写 schema | 显示 Viewer pipeline 预测的分页线或只读预览。 |

页面工具栏的交互形态：

- 工具栏为垂直按钮组，默认停靠在目标页面右侧外缘；右侧空间不足时自动翻到左侧。按钮顺序从上到下为新增、删除、定位、预览类入口。
- 工具栏目标页优先级为 `hoverPageIndex`、单页选择派生页、`viewportPageIndex`。任何按钮触发时都把解析出的目标页作为命令参数传入。
- 工具栏不改变选择集，不写入页面焦点。用户只是移动鼠标或滚动画布时，页面工具条可以换锚点，但元素编辑状态不应被打断。
- 页间空隙只显示定位或新增吸附预览，不显示删除按钮，避免用户误以为空隙也是一页。
- 移动端或窄视口下，工具栏可折叠为单个垂直 more 按钮，展开后仍保持垂直排列。

固定多页的新增/删除规则：

- 新增纸张时，`page.pages` 和 `pagination.pageCount` 同步递增；若二者只有一个存在，也补齐另一个，保持旧模板兼容。
- 新增纸张不移动已有元素，只增加新的空白文档坐标区间。
- 删除空白纸张时直接减少页数。
- 删除非空纸张必须走确认流程，提供"删除纸张和其中元素"与"取消"；后续可扩展"把后续纸张上移"。第一版不自动移动元素，避免静默改写大量 `node.y`。
- 删除中间纸张若未来支持"后续纸张上移"，必须用一个明确命令批量更新受影响元素的 `y -= page.height`，并进入 undo history。
- 删除最后一张纸被禁用，按钮保留 disabled 态并用 tooltip 解释。

不同页面策略的设计器表现：

- `fixed-sheets`：显示多张固定纸张。纸张之间有固定 gap，页面组水平居中，工具栏以垂直按钮组出现在 hover、selection 或 viewport 派生的目标纸张侧边。
- `auto-sheets`：编辑态仍是连续文档画布或流式画布，只显示分页参考线；不显示新增/删除纸张按钮，因为输出页数由内容和分页策略决定。
- `none`：连续纸显示单张可增长 canvas，允许用户改纸宽和最小高度，但不提供增删纸张。
- `label-sheets`：默认编辑单个 label cell，工具栏提供只读 sheet preview 切换；copies、rows、columns 决定输出 sheet，不用增删纸张按钮。

交互命令应进入命令系统：

- `AddPageSheetCommand`：更新 `page.pages / pagination.pageCount`。
- `RemovePageSheetCommand`：校验最小页数、空白页或确认结果，再更新页数。
- 命令不得直接依赖 DOM；它们消费 `EditorSurfacePlan` 和显式传入的 `targetPageIndex`。
- 页面工具栏只触发命令，不自己解释分页策略。

### `@easyink/material-*`

物料不参与全局分页决策，只暴露能力：

- `measure()` 返回自然尺寸和溢出信息。
- 可分页物料额外实现 `paginateFragment()`，例如 `table-data`。
- 页感知物料声明 `pageAware`，由分页策略注入 `pageIndex / pageNumber / totalPages`。

## 24.5 标准中间模型

所有运行态阶段围绕一个不可变中间模型传递：

```ts
interface LayoutInput {
  schema: DocumentSchema
  data: Record<string, unknown>
  resolvedPropsMap: Map<string, Record<string, unknown>>
  pageModel: ResolvedPageModel
}

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

interface LayoutDocument {
  width: number
  height: number
  fragments: LayoutFragment[]
  diagnostics: LayoutDiagnostic[]
}

interface OutputPagePlan {
  index: number
  sheetIndex: number
  width: number
  height: number
  yOffset: number
  fragments: LayoutFragment[]
  pageContext: {
    pageNumber: number
    totalPages: number
    copyIndex?: number
  }
}
```

重要约束：

- `MaterialNode.y` 仍然是文档坐标，输出页通过 `yOffset` 投影。
- 运行态测量不回写原始 schema。
- 分页策略生成 fragments，不复制原始 schema 节点作为真数据源；需要虚拟节点时必须保留 `sourceNodeId`。
- 诊断附着在阶段和 source node 上，不能只输出字符串。

## 24.6 分页控制语义

`keepTogether`、`pageBreakBefore`、`pageBreakAfter` 仍然需要，而且是新体系必须保留的能力。它们不属于页面模型，也不属于测量算法本身，而是 fragment 级的分页约束，由布局策略读取、由分页策略执行。

现有仓库已经在 `packages/prop-schemas/src/index.ts` 暴露了这三个属性，旧文档中也把它们列入 `StackFlowProps`。新体系对它们的定位如下：

```ts
interface FlowBreakConstraints {
  /** 当前 fragment 尽量不被拆开。 */
  keepTogether?: boolean
  /** 当前 fragment 前必须先开新页或新 sheet。 */
  pageBreakBefore?: boolean
  /** 当前 fragment 后必须开新页或新 sheet。 */
  pageBreakAfter?: boolean
  /** 后续可扩展：避免前 N 行/后 N 行孤行。 */
  widows?: number
  orphans?: number
}
```

执行规则：

- `pagination.strategy='none'` 时，`pageBreakBefore / pageBreakAfter` 不产生物理切页，但可作为诊断或预览分段提示；连续纸不应该因为它们被强制裁成固定纸。
- `pagination.strategy='fixed-sheets'` 时，只对已经位于不同固定页坐标区间的元素做归页；显式分页控制可以输出诊断，但不应悄悄重排绝对定位元素。
- `pagination.strategy='auto-sheets'` 时，三个控制全部生效：`pageBreakBefore` 先开页，`pageBreakAfter` 后开页，`keepTogether` 尽量整体放入下一页。
- `pagination.strategy='label-sheets'` 时，分页控制默认不生效；标签复制由 copies 和 label grid 决定。
- 对实现了 `FragmentPaginator` 的物料，`keepTogether=true` 表示优先整体挪页；若单个 fragment 高度超过可用高度，允许物料分页器拆分，并输出 `KEEP_TOGETHER_UNSATISFIABLE` 诊断。

存储策略：

- 短期继续兼容读取 `node.props.layoutMode / keepTogether / pageBreakBefore / pageBreakAfter`。
- 中期可把这些提升到 `MaterialNode.layout` 或 `MaterialNode.flow`，让它们从物料私有 props 中脱离。
- 迁移期间 Designer 属性面板仍可显示在"分页"分组，但写入层应通过统一 helper，避免不同物料各自解释。

为什么仍然需要它们：

- Word 多页和固定纸自动分页必须支持显式分页。
- 合同、报表、发票等场景常需要"标题和下一段不分离"、"合计块不被拆页"。
- 表格、容器、flow-row 等结构物料需要把内部可拆分能力和外部分页约束区分开。
- 没有这些控制，`auto-sheets` 只能按高度机械切页，无法产出可读文档。

## 24.7 可分页物料协议

`table-data` 不应被通用 Y 轴切页强行裁剪。它需要成为第一个 `FragmentPaginator` 示例：

```ts
interface FragmentPaginator {
  canPaginate(node: MaterialNode): boolean
  measureFragments(node: MaterialNode, ctx: MeasureContext): FragmentMeasureResult
  paginateFragment(input: FragmentPaginateInput): FragmentPaginateResult
}

interface FragmentPaginateInput {
  fragment: LayoutFragment
  availableHeight: number
  pageContext: { pageIndex: number }
}

interface FragmentPaginateResult {
  currentPage: LayoutFragment
  nextPage?: LayoutFragment
  diagnostics: LayoutDiagnostic[]
}
```

表格分页规则：

- header 行由表格分页器决定是否重复。
- footer 行只在最后一个表格 fragment 出现。
- repeat-template 展开和行高测量只在 measure 阶段做一次。
- 分页结果生成虚拟 fragment，不能破坏原始 `table.topology.rows`。

## 24.8 能力组合示例

### Word 多页文档

```ts
pageModel.kind = 'paged-paper'
layout.strategy = 'absolute'
reflow.strategy = 'measure-only'
pagination.strategy = 'fixed-sheets'
```

语义：

- 页面高度固定。
- `page.pages` 或 `pagination.pageCount` 决定编辑态页数。
- 元素按 document y 坐标归属页面。
- 页码物料由分页策略复制并注入上下文。

### 连续纸小票

```ts
pageModel.kind = 'continuous-paper'
layout.strategy = 'stack-flow'
reflow.strategy = 'flow-y'
pagination.strategy = 'none'
```

语义：

- 输出只有一张连续纸。
- 运行态内容变高后下推后续 flow 元素。
- 最终高度等于内容底边加原模板尾部留白。
- 打印 `pageSizeMode='driver'` 时不输出固定纸高。

### 固定纸自动分页长报表

```ts
pageModel.kind = 'paged-paper'
layout.strategy = 'stack-flow'
reflow.strategy = 'flow-y'
pagination.strategy = 'auto-sheets'
```

语义：

- 内容按流式规则重排。
- 输出按固定纸张高度切成多页。
- 支持 `keepTogether / pageBreakBefore / pageBreakAfter`。
- 表格通过 `FragmentPaginator` 切行，不被 DOM 裁切。

### 标签纸

```ts
pageModel.kind = 'label-sheet'
layout.strategy = 'absolute'
reflow.strategy = 'measure-only'
pagination.strategy = 'label-sheets'
```

语义：

- `page.width / height` 表示单个 label cell。
- sheet 尺寸由 columns、rows、gap、rowGap 推导。
- copies 被分页策略展开为 sheet/page。

## 24.9 迁移路径

### 阶段一：模型补齐，不改行为

- `@easyink/shared` 收敛 `PageMode` 为 `fixed | continuous | label`，保留策略枚举。
- `@easyink/schema` 增加四层字段，默认从 `mode` 推导。
- `@easyink/schema` 增加统一 compat 迁移入口：当输入 schema 的 `page.mode === 'stack'` 时，自动改写为 `mode='continuous'`、`pageModel.kind='continuous-paper'`、`layout.strategy='stack-flow'`、`reflow.strategy='flow-y'`、`pagination.strategy='none'`。
- compat 迁移必须发生在 validation 之前，并接入 `normalizeDocumentSchema()`、`deserializeSchema()`、`MigrationRegistry.migrate()` 和 Viewer open 流程；Designer 通过 `normalizeDocumentSchema()` 获得同样行为。
- compat 迁移不得把 `stack` 重新加入 `PageMode` 类型、schema validation、设计器页面类型、schema-tools 枚举或 MCP/AI 结构化输出。
- 增加统一 helper 读取 `node.props` 中既有分页控制，并投影为 `LayoutFragment.flow`。
- `designer` 页面属性面板展示页面类型和布局方式两个正交分组，不再展示 `stack` 页面类型。
- `schema-tools` 生成连续纸时写入 `continuous + stack-flow` 组合，不再生成 `stack`。

验收：现有测试全部通过；旧 `stack` 模板经迁移后输出保持连续纸流式行为，内部 schema 不再保留 `stack`。

### 阶段二：抽出计划引擎

- 在 `@easyink/core` 新增 `resolvePageModel()`、`runLayoutPipeline()`、`runPagination()`.
- `createPagePlan()` 改成兼容 facade。
- `viewer/runtime.ts` 删除直接调用 `applyStackFlowLayout()` 的模式判断，改为调用 pipeline。

验收：`page-planner.test.ts` 和 `stack-flow-layout.test.ts` 迁移到新 pipeline，行为保持一致。

### 阶段三：表格分页协议

- `MaterialViewerExtension` 增加可选 `fragmentPaginator`。
- `table-data` 把 runtimeLayoutCache 升级为显式 `FragmentMeasureResult`。
- `auto-sheets` 分页策略调用表格分页器，生成虚拟 fragments。

验收：长表格在固定 A4 多页下重复表头、末页页脚、行高稳定。

### 阶段四：设计器多页和连续纸 UI

- `CanvasWorkspace` 消费 `EditorSurfacePlan`。
- 固定多页优先实现多页纵向画布，页面组在滚动视口内水平居中。
- 画布侧增加垂直页面工具栏，提供 icon-only 的新增纸张、删除纸张、纸张定位入口。
- 移除设计器里的全局激活页状态，拖拽、页面命令和工具栏锚点都从 hover、selection、viewport 或显式目标页派生。
- 新增/删除纸张只作用于 `fixed-sheets`；`auto-sheets` 只显示分页预览线，不允许手工增删输出页。
- 连续纸显示运行态高度预估和底部留白。
- 标签模式区分 cell edit 和 sheet preview。
- 页面增删命令进入 undo history，并同步维护 `page.pages` 与 `pagination.pageCount`。

验收：Designer 编辑态不需要完整 Viewer，也不会和 Viewer 页面计划语义冲突。

### 阶段五：打印和导出收敛

- `PrintPolicyResolver` 消费 `OutputPagePlan` 或 `ViewerPageMetrics`，不再自己推导 label sheet。
- 导出插件只消费 Viewer 输出页，不重实现分页。

验收：浏览器打印、PDF、图片导出的页尺寸来源一致。

## 24.10 不变量

- Schema 表达稳定文档语义，运行态计划不回写 Schema。
- Designer 可以有编辑态近似布局，但最终预览、打印、导出必须走 Viewer pipeline。
- Designer 不维护全局激活页；页面相关交互必须从坐标、选择、视口或显式命令参数派生。
- `RenderSurface` 不知道分页策略，只知道输出页和 fragments。
- 物料可以测量和局部分页，但不能决定全局纸张或全局页数。
- `page.mode` 只能表达页面介质类型，不能继续承载布局、分页或重排能力。
- `stack` 是 legacy input，不是合法的新 schema 状态；任何入口完成迁移后都不得继续按 `page.mode === 'stack'` 分支。
- `keepTogether / pageBreakBefore / pageBreakAfter` 是分页约束，不是物料渲染属性；任何策略不支持时必须忽略并诊断，不能误解释。
- 所有自动行为必须有诊断出口，不能静默移动、裁切或丢弃内容。

## 24.11 决策

采用四层正交体系作为后续分页和布局演进方向。当前合法页面介质类型为 `fixed / continuous / label`；历史 `stack` 不再作为页面类型存在，只在 schema 入口迁移为 `continuous + stack-flow`。新增连续纸、固定纸自动分页、Word 多页、标签 sheet、多区域布局时，优先新增策略或策略组合，而不是扩展一个更大的 `PageMode` 分支。
