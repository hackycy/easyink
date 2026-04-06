# 5. Schema DSL 设计

EasyInk 的 Schema 不是“给渲染器吃的 JSON”，而是完整的文档模型。它既要让设计器可编辑，也要让 Viewer 可回放，还要解决一个此前文档没说清的问题：对标产品的原始 JSON 与 EasyInk 内部规范模型不应该混为一谈。

## 5.1 两种 Schema 视图

EasyInk 需要同时维护两种视图：

### 规范模型

给 EasyInk 内部各包使用的稳定类型系统。

### 兼容输入

用于导入/导出 report-designer 风格 JSON 的编解码层。

原则：

- 内部类型不照搬对标产品的历史命名噪音
- codec 必须尽量无损读取 `x / y / g / page / elements / props / bind / animations`
- 未识别字段和 props 必须保留，避免导入导出破坏模板资产

## 5.2 顶层结构

### 规范模型

```typescript
interface DocumentSchema {
  version: string
  meta?: DocumentMeta
  unit: UnitType
  page: PageSchema
  guides: GuideSchema
  elements: MaterialNode[]
  extensions?: Record<string, unknown>
  compat?: BenchmarkCompatState
}

type UnitType = 'mm' | 'pt' | 'px'

interface GuideSchema {
  x: number[]
  y: number[]
  groups?: GuideGroupSchema[]
}

interface BenchmarkCompatState {
  rawGuideGroupKey?: 'g'
  passthrough?: Record<string, unknown>
}
```

### 对标产品兼容输入

```typescript
interface BenchmarkDocumentInput {
  unit?: UnitType
  x?: number[]
  y?: number[]
  g?: unknown[]
  page: Record<string, unknown>
  elements: BenchmarkElementInput[]
  [key: string]: unknown
}
```

映射原则：

- `x` -> `guides.x`
- `y` -> `guides.y`
- `g` -> `guides.groups`，无法识别时保留到 `compat.passthrough`
- 原始顶层未知字段进入 `compat.passthrough`

## 5.3 页面模型

第一轮文档只写了 `mode + width + height` 级别，这对复刻不够。当前页面模型应覆盖对标产品里已经被验证存在的字段族。

```typescript
interface PageSchema {
  mode: PageMode
  width: number
  height: number
  pages?: number
  scale?: PageScale
  radius?: string
  offsetX?: number
  offsetY?: number
  copies?: number
  blankPolicy?: BlankPolicy
  label?: LabelPageConfig
  grid?: GridConfig
  font?: string
  background?: PageBackground
  print?: PagePrintConfig
  extensions?: Record<string, unknown>
}

type PageMode = 'fixed' | 'stack' | 'label'
type PageScale = 'auto' | 'fit-width' | 'fit-height' | number
type BlankPolicy = 'keep' | 'remove' | 'auto'

interface LabelPageConfig {
  columns: number
  gap: number
}

interface GridConfig {
  enabled: boolean
  width: number
  height: number
}

interface PageBackground {
  color?: string
  image?: string
  repeat?: 'full' | 'repeat' | 'repeat-x' | 'repeat-y' | 'none'
  width?: number
  height?: number
  offsetX?: number
  offsetY?: number
}

interface PagePrintConfig {
  horizontalOffset?: number
  verticalOffset?: number
}
```

注意：

- `DocumentSchema.unit` 是文档级字段，因此属性面板里的“单位”是文档上下文展示，不重复落到 `page`
- `常用纸张` 是根据 `width / height` 推导和反写的编辑器派生控件，不是规范模型字段
- `pages` 不只是“页数”显示，它还要支撑多编辑区模板和固定分页模板的编辑上下文
- `连续排版`、`底部留白`、`readonly`、`title`、`preformat` 这类 benchmark 页面项在公开样例里来源并不稳定；语义未被完全归一前，先进入 `page.extensions` 或 `compat.passthrough`，不要草率固定成规范字段

与对标产品字段的对应关系：

| benchmark 字段 | EasyInk 规范字段 |
| --- | --- |
| `viewer` | `page.mode` |
| `width` / `height` | `page.width` / `page.height` |
| `pages` | `page.pages` |
| `scale` / `scaleType` | `page.scale` |
| `radius` | `page.radius` |
| `xOffset` / `yOffset` | `page.offsetX` / `page.offsetY` |
| `copies` | `page.copies` |
| `blank`（字符串或数字） | `page.blankPolicy` |
| `labelCol` / `labelGap` | `page.label.columns` / `page.label.gap` |
| `font` | `page.font` |
| `gridWidth` / `gridHeight` | `page.grid.width` / `page.grid.height` |
| `background` / `backgroundImage` | `page.background.color` 或 `page.background.image` |
| `backgroundRepeat`（如 `full` / `no-repeat`） | `page.background.repeat` |
| `backgroundWidth` / `backgroundHeight` | `page.background.width` / `page.background.height` |
| `backgroundX` / `backgroundY` / `backgroundXOffset` / `backgroundYOffset` | `page.background.offsetX` / `page.background.offsetY` |

兼容策略补充：

- codec 不能假设 benchmark 页面字段命名全局一致，必须接受别名并归一化
- 当原始值无法安全归一时，先保留到 `compat.passthrough`，优先保证模板资产无损
- `backgroundRepeat = 'no-repeat'` 这类原始值应在兼容层归一成规范枚举，而不是把原始历史命名直接扩散到内部公共类型

设计约束：

- `fixed` 仍是当前第一优先级
- 标签纸和多栏打印能力不能靠运行时临时参数补，必须进入 `page`
- 背景图的拉伸、平移和重复方式属于模板永久语义
- 页面属性面板里的派生控件不应污染 schema；schema 只保存能稳定回放的文档语义

## 5.4 元素模型

规范模型中，EasyInk 仍然把公共几何字段提升到节点根部，避免所有物料都把 `x/y/width/height` 藏在 `props` 里。

```typescript
interface MaterialNode {
  id: string
  type: string
  name?: string
  unit?: UnitType
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  alpha?: number
  zIndex?: number
  hidden?: boolean
  locked?: boolean
  print?: PrintBehavior
  props: Record<string, unknown>
  binding?: BindingRef | BindingRef[]
  animations?: AnimationSchema[]
  children?: MaterialNode[]
  diagnostics?: NodeDiagnosticState[]
  extensions?: Record<string, unknown>
  compat?: BenchmarkElementCompatState
}

type PrintBehavior = 'each' | 'odd' | 'even' | 'first' | 'last'

interface BenchmarkElementCompatState {
  rawProps?: Record<string, unknown>
  rawBind?: unknown
  passthrough?: Record<string, unknown>
}
```

为什么保留 `children`：

- 容器是显式子树
- 表格单元格内可以包含元素
- Flex 类结构物料本质也是局部坐标树

为什么顶层仍保留平铺 `elements`：

- 页面级结构树、对齐、排序、批量选择都更清晰
- 只有明确声明支持子树的结构物料才持有 `children`

## 5.5 绑定模型

当前绑定不再是只有 `path` 的最小对象，而是必须能回放 report-designer 的拖拽结果。

```typescript
interface BindingRef {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldLabel?: string
  usage?: UsageRule
  bindIndex?: number
  union?: UnionBinding[]
  required?: boolean
  extensions?: Record<string, unknown>
}

interface UnionBinding {
  sourceId?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldLabel?: string
  use?: string
  offsetX?: number
  offsetY?: number
  defaultProps?: Record<string, unknown>
}

type UsageRule =
  | string
  | {
      id: string
      options?: Record<string, unknown>
    }
```

设计要点：

- `fieldPath` 采用 `/` 作为规范分隔符
- 导入层兼容 `.`、混合路径和仅 `key` 的简化格式
- `bindIndex` 用于二维码、BWIP、公式等多输入物料
- `union` 用于一拖多生成场景，不应被塞成 Designer 私有逻辑

### `union` 示例

```typescript
const receiptBaseBinding: BindingRef = {
  sourceId: 'receipt',
  sourceTag: 'apis/receipt.json',
  fieldPath: 'base/name',
  fieldLabel: '店铺名称',
  union: [
    {
      fieldPath: 'base/time',
      fieldLabel: '创建时间',
      offsetX: 0,
      offsetY: 40,
      defaultProps: { width: 150, height: 20 },
    },
    {
      fieldPath: 'base/cashier',
      fieldLabel: '收银员',
      offsetX: 160,
      offsetY: 40,
      defaultProps: { width: 80, height: 20 },
    },
  ],
}
```

### `bindIndex` 示例

```typescript
const bwipBindings: BindingRef[] = [
  { sourceId: 'bwip', fieldPath: 'text', bindIndex: 0 },
  { sourceId: 'bwip', fieldPath: 'format', bindIndex: 1 },
  { sourceId: 'bwip', fieldPath: 'params', bindIndex: 2 },
]
```

## 5.6 结构物料不是普通 props

数据表格、静态表格、Flex 容器都要有独立结构模型，而不是让 `props` 自由生长。

```typescript
interface TableNode extends MaterialNode {
  type: 'table-static' | 'table-data' | 'table-flex'
  table: TableSchema
}

interface TableSchema {
  layout: TableLayoutConfig
  sections: TableSectionSchema[]
  diagnostics?: LayoutDiagnostic[]
}

interface TableLayoutConfig {
  equalizeCells?: boolean
  gap?: number
  borderAppearance?: 'outer' | 'inner' | 'all' | 'none'
  borderWidth?: number
  borderType?: 'solid' | 'dashed' | 'dotted'
  borderColor?: string
}

interface TableSectionSchema {
  kind: 'title' | 'header' | 'data' | 'total' | 'footer'
  repeatOnEachPage?: boolean
  hidden?: boolean
  rows: TableRowSchema[]
}

interface TableRowSchema {
  height?: number
  cells: TableCellSchema[]
}

interface TableCellSchema {
  rowSpan?: number
  colSpan?: number
  width: number
  height?: number
  border?: CellBorderSchema
  padding?: BoxSpacing
  props?: Record<string, unknown>
  binding?: BindingRef | BindingRef[]
  elements?: MaterialNode[]
}
```

这个模型要解决的是：

- 让设计器支持单元格选区与局部属性编辑
- 让结构树能表达“表格里还有表格/文本/图形”的关系
- 让 Viewer 支持分页、重复头、留白、空行填充、单元格内容递归渲染

## 5.7 动画与扩展

`animations` 是元素级声明，Viewer 决定是否执行。它们应是声明式配置，不允许直接注入脚本。

`extensions` 用于受控扩展；`compat` 用于兼容原始输入。两者都必须在导入导出中保留。
