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

页面模型覆盖打印、标签和背景语义的完整字段族。

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

绑定必须能完整回放拖拽结果，包含数据源引用、字段路径和多参数绑定位次。

```typescript
interface BindingRef {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldLabel?: string
  bindIndex?: number
  required?: boolean
  extensions?: Record<string, unknown>
}
```

设计要点：

- `fieldPath` 采用 `/` 作为规范分隔符
- 导入层兼容 `.`、混合路径和仅 `key` 的简化格式
- `bindIndex` 用于二维码、BWIP、公式等多输入物料
- `union` 仅存在于 `DataFieldNode`（数据源字段树），不持久化到 `BindingRef`

### `bindIndex` 示例

```typescript
const bwipBindings: BindingRef[] = [
  { sourceId: 'bwip', fieldPath: 'text', bindIndex: 0 },
  { sourceId: 'bwip', fieldPath: 'format', bindIndex: 1 },
  { sourceId: 'bwip', fieldPath: 'params', bindIndex: 2 },
]
```

## 5.6 结构物料不是普通 props

数据表格、静态表格等结构物料要有独立结构模型，而不是让 `props` 自由生长。

```typescript
interface TableNode extends MaterialNode {
  type: 'table-static' | 'table-data'
  table: TableSchema | TableDataSchema
}

/** 表格基类 Schema，table-static 直接使用此类型 */
interface TableSchema {
  kind: 'static' | 'data'
  layout: TableLayoutConfig
  topology: TableTopologySchema
  diagnostics?: LayoutDiagnostic[]
}

/** table-data 专用 Schema，继承基类，增加头尾可见性。
 *  不再持有表级 source 字段，集合路径由 repeat-template 行内各 cell.binding.fieldPath 的
 *  公共前缀在运行时推导（Viewer 使用 extractCollectionPath）。 */
interface TableDataSchema extends TableSchema {
  kind: 'data'
  /** 表头可见性。false 时 Viewer 不渲染 header 行、分页不重复 header。默认 true */
  showHeader?: boolean
  /** 表尾可见性。false 时 Viewer 不渲染 footer 行。默认 true */
  showFooter?: boolean
}

interface TableTopologySchema {
  columns: TableColumnSchema[]
  rows: TableRowSchema[]
}

interface TableColumnSchema {
  /** 归一化比例值 (0-1)，所有列的 ratio 总和严格等于 1。
   *  实际像素宽度 = element.width * ratio。
   *  resize 表格元素整体时列宽自动等比伸缩。 */
  ratio: number
}

interface TableLayoutConfig {
  equalizeCells?: boolean
  gap?: number
  borderAppearance?: 'outer' | 'inner' | 'all' | 'none'
  borderWidth?: number
  borderType?: 'solid' | 'dashed' | 'dotted'
  borderColor?: string
  /** 以下为 table-data 专属打印配置，table-static 忽略 */
  fillBlankRows?: boolean
  multiColumn?: boolean
  multiColumnGap?: number
}

/** 表级排版默认值，单元格 typography 字段缺失时回退到此对象 */
interface TableTypography {
  fontSize: number      // default: 9
  color: string         // default: '#000000'
  fontWeight: 'normal' | 'bold'    // default: 'normal'
  fontStyle: 'normal' | 'italic'   // default: 'normal'
  lineHeight: number    // default: 1.2
  letterSpacing: number // default: 0
  textAlign: 'left' | 'center' | 'right'  // default: 'left'
  verticalAlign: 'top' | 'middle' | 'bottom' // default: 'top'
}

/** 单元格排版属性，所有字段可选，缺失时回退到表级 TableTypography */
interface CellTypography {
  fontSize?: number
  color?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

interface TableRowSchema {
  /** 行高为绝对值（使用文档 unit），不采用比例制。
   *  原因：不同 role 的行数独立，table-data 数据区行数运行时动态变化，
   *  行高比例的语义不成立。resize 行高时直接修改此值并联动 element.height。
   *  table-data 的 repeat-template 行高度统一应用于所有展开的数据行。 */
  height: number
  /** 行角色决定该行在渲染和打印时的语义行为。
   *  - normal: 普通行（table-static 仅允许此值）
   *  - header: 表头行，Viewer 分页时每页重复（仅 table-data，强制单行）
   *  - footer: 表尾行，Viewer 在最后一页显示（仅 table-data，强制单行）
   *  - repeat-template: 数据重复模板行，Viewer 从 cell.binding 的公共集合前缀推导集合路径，
   *    按集合数据逐项重复（仅 table-data） */
  role: 'normal' | 'header' | 'footer' | 'repeat-template'
  cells: TableCellSchema[]
}

interface TableCellSchema {
  rowSpan?: number
  colSpan?: number
  /** 单元格宽度由 columns[].ratio 计算得来，不自持。
   *  合并单元格的宽度 = 跨越列的 ratio 之和 * element.width。 */
  border?: CellBorderSchema  // 四侧独立显示/隐藏（boolean），粗细/颜色/类型继承表级 TableLayoutConfig
  padding?: BoxSpacing
  content?: TableCellContentSlot
  /** 单元格排版属性，字段缺失时回退到表级 typography 默认值 */
  typography?: CellTypography
  props?: Record<string, unknown>
  /** table-data 专用：单元格绑定，仅单值。
   *  - repeat-template 行：fieldPath 为绝对路径（如 items/name），同一行内所有 cell 的 fieldPath 必须共享相同的集合前缀
   *  - header / footer / normal 行不使用此字段，改用 staticBinding */
  binding?: BindingRef
  /** 静态绑定：table-static 和 table-data 的 header/footer/normal 行共用。
   *  每个 cell 可绑定不同 source 的字段，fieldPath 为绝对路径，从数据源根解析。
   *  与手动编辑(content)互斥：有 staticBinding 时文本由数据源填充，
   *  清除 staticBinding 后恢复手动编辑。Viewer 逐 cell 独立解析，不做集合展开。 */
  staticBinding?: BindingRef
}

interface TableCellContentSlot {
  text: string
  editMode?: 'inline-text' | 'rich-text'
}
```

这个模型要解决的是：

- 让 `table-static` 与 `table-data` 共享表壳、格子和内容槽，通过 `TableDataSchema extends TableSchema` 实现类型拆分
- 用行 `role` 替代 band 语义：header / footer / repeat-template 直接标记在行上，不再维护独立的区段索引（bands）
- cell 绑定采用绝对路径：repeat-template 行的 cell.binding.fieldPath 使用绝对路径（如 `items/name`），同行内所有 cell 必须共享相同的集合前缀（如 `items`），Designer 在拖拽时强制此约束
- header/footer/normal 行的 cell 使用 staticBinding 绑定，与 table-static 共用同一机制
- Viewer 在运行时通过 `extractCollectionPath()` 从 repeat-template 行各 cell 的 fieldPath 提取公共集合前缀，再通过 `Array.isArray` 确认其为集合节点
- repeat-template 行不再持有独立的 repeatBinding：集合路径由 cell.binding 的公共前缀推导
- cell.binding 为单值 BindingRef，不支持数组（cell 无多参数绑定场景）
- 单元格内容为纯文本，不嵌套子物料：内容槽只有 `text` + `editMode`，降低编辑和渲染复杂度
- 让设计器支持表壳、格子、格子内容三层编辑上下文
- 让 Viewer 根据行 role 处理打印语义：header 行每页重复、footer 行在末页显示、repeat-template 行按推导出的集合数据展开
- fillBlankRows 语义为自动填充空行到页底，行数由页面剩余空间和行高自动计算
- table-data 头尾可见性通过 `showHeader` / `showFooter` 控制，隐藏时 Viewer 完全不渲染对应行（不占空间、不分页重复）
- 单元格排版属性通过 `CellTypography` 独立设置，缺失字段回退到表级 `TableTypography` 默认值
- table-static 和 table-data 的 header/footer/normal 行统一通过 `staticBinding` 支持独立数据源绑定，每个 cell 可绑定不同 source，与手动编辑互斥

### table-static 与 table-data 的 role 约束

- `table-static`：所有行的 role 强制为 `'normal'`。静态表格不涉及打印语义分区和数据重复。schema 层和命令层双重强制此约束。
- `table-data`：允许 `header`、`footer`、`repeat-template`、`normal` 四种 role，但 **header 和 footer 各强制单行**（schema + 命令层双层强制）。Designer 在创建 table-data 默认节点时预置 header + repeat-template + footer 各一行。

### table-data 头尾单行约束

schema 和命令层双重强制 header/footer 各最多 1 行：

- `InsertTableRowCommand`：在 header/footer 区域插入时，若该区域已有 1 行则拒绝执行
- `RemoveTableRowCommand`：删除 header/footer 行时正常执行（区域变为 0 行）
- `UpdateTableRowRoleCommand`：修改 role 后若违反单行约束则拒绝执行
- codec 迁移旧数据时，多 header/footer 行仅保留第一行，其余转为 `normal`

### role 排列顺序约束

`table-data` 中行的 role 必须遵守固定顺序：

```
header 行（0 或 1 行，必须在顶部）
↓
normal 行 / repeat-template 行（0 或多行，在中间）
↓
footer 行（0 或 1 行，必须在底部）
```

- 插入行时，新行继承插入位置相邻行的 role。如果继承的 role 会违反顺序约束或单行约束，命令拒绝执行
- 移动行或修改行 role 时，如果会违反顺序约束，操作应被拒绝
- Viewer 渲染时依赖此顺序：从 rows[] 中按位置提取 header/body/footer 区域，不做排序

### repeat-template 行的绑定路径语义

repeat-template 行中单元格的 `binding.fieldPath` 采用绝对路径语义：

- 所有 fieldPath 均为绝对路径（如 `items/name`、`items/price`），从数据源根路径开始
- 同一 repeat-template 行内所有 cell 的 fieldPath 必须共享相同的集合前缀（如 `items`），Designer 在拖拽时强制此约束（`getFieldCollectionPrefix()` 逐 cell 校验）
- Viewer 运行时通过 `extractCollectionPath(fieldPaths)` 提取公共集合前缀，再对该路径的值做 `Array.isArray` 检查确认其为集合节点
- 展开数据行时，Viewer 使用 `resolveFieldFromRecord(leafField, record)` 从集合项中取出叶子字段值（leafField 为去掉集合前缀后的相对部分）
- Designer 设计态显示字段标签时，优先使用 `binding.fieldLabel`（存储在模板内），fallback 到数据源字段树中对应节点的 name/title
- header / footer / normal 行的单元格使用 `staticBinding`（绝对路径），从数据源根解析，与 table-static 共用同一机制

### 合并操作约束（双层防护）

合并通过 UI 层和命令层双重防护，避免产生非法状态：

**UI 层**（editing session toolbar）：根据表类型和 cell 上下文动态显示/隐藏合并按钮

| 上下文 | 合并右 | 合并下 | 拆分 |
|--------|--------|--------|------|
| table-static 任意 cell | 可见 | 可见 | 有 span 时可见 |
| table-data header cell | 可见 | 隐藏 | colSpan>1 时可见 |
| table-data footer cell | 可见 | 隐藏 | colSpan>1 时可见 |
| table-data 数据区 cell | 隐藏 | 隐藏 | 隐藏 |

**命令层**（MergeTableCellsCommand）：execute 前置校验

- 跨 role 合并禁止：选区内所有行 role 必须一致
- table-data 数据区（repeat-template）完全禁止合并
- table-data header/footer 仅允许列方向合并（rowSpan 必须为 1）

### 其他拓扑操作约束

- **content 可选**：`TableCellContentSlot` 为可选字段。新插入的单元格可以不携带 content，渲染层视缺失 content 为空字符串
- **删列与绑定**：删除列时，该列单元格上的绑定（binding 或 staticBinding）随单元格一起被删除，不产生诊断或确认。用户通过 undo 恢复

### 排版属性继承链

```
TableBaseProps.typography (表级默认值)
  ↓ 字段缺失时回退
TableCellSchema.typography (单元格级别)
```

渲染时解析：`cell.typography.X ?? tableProps.typography.X`

### 列宽模型说明

列宽采用归一化比例制而非绝对值，核心动机：

- **element.width 是唯一绝对宽度来源**：resize 表格元素时所有列等比伸缩，不需要逐列重算
- **列 resize 交互语义**：拖拽列边线时修改当前列 ratio、推动右侧列并改变 element.width（表格总宽变化），不是左右列此消彼长
- **最小列宽约束**：通过计算 `ratio * element.width` 的实际像素值与下限(如 4px)比较来约束，而非约束 ratio 本身
- **浮点精度**：所有列 ratio 总和严格为 1。增删列时重新归一化。默认 3 列等分 → `[1/3, 1/3, 1/3]` 归一化存储

### 行高模型说明

行高采用绝对值(使用文档 unit)，与列宽不对称：

- 列是跨所有行共享的全局拓扑，行是按 role 分组的局部拓扑
- table-data 中 repeat-template 行的 `row.height` 统一应用于所有展开的数据行
- 拖拽行 resize 时修改 row.height 并联动 element.height

### TableNode 类型访问

schema 包通过 TypeScript 类型拓展声明 `TableNode extends MaterialNode`，其中 `table` 字段类型为 `TableSchema | TableDataSchema`。运行时通过判别函数 `isTableNode(node)` 访问 `node.table`，通过 `isTableDataNode(node)` 进一步窄化为 `TableDataSchema`（含 `showHeader`、`showFooter` 字段）。不破坏 `MaterialNode` 基础类型，但类型层明确。实际存储中表格数据位于 `node.table` 顶层字段，不再使用 `node.extensions.table`。

## 5.7 动画与扩展

`animations` 是元素级声明，Viewer 决定是否执行。它们应是声明式配置，不允许直接注入脚本。

`extensions` 用于受控扩展；`compat` 用于兼容原始输入。两者都必须在导入导出中保留。
