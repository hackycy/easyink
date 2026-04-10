# 11. 物料体系

EasyInk 的物料体系要覆盖报表设计器里的“内容元素”和“结构元素”两类对象，而不是只围绕文本、图片这类基础块。第一轮文档已经明确了 `table / container / chart / svg / relation` 是一级类别，第二轮修订要把“一级类别”继续拆成真实可实现的目录和属性矩阵。

## 11.1 物料定义

每个物料都由四部分组成：

- Schema 定义
- Designer 交互定义
- Viewer 渲染定义
- 目录注册定义

```typescript
interface MaterialDefinition {
  type: string
  name: string
  icon: string
  category: MaterialCategory
  capabilities: MaterialCapabilities
  props: PropSchema[]
  createDefaultNode(input?: Partial<MaterialNode>): MaterialNode
}

interface MaterialCatalogEntry {
  id: string
  group: MaterialGroup
  label: string
  icon: string
  materialType: string
  useTokens?: string[]
  priority?: 'quick' | 'grouped'
}

interface MaterialCapabilities {
  bindable?: boolean
  rotatable?: boolean
  resizable?: boolean
  supportsChildren?: boolean
  supportsAnimation?: boolean
  supportsUnionDrop?: boolean
  pageAware?: boolean
  multiBinding?: boolean
  /** 拖拽 element 级 resize handle 时保持宽高比。 */
  keepAspectRatio?: boolean
}
```

## 11.2 目录层级

### 高频直达物料

- `line`
- `rect`
- `ellipse`
- `text`
- `image`
- `qrcode`
- `barcode`

### 数据目录

对标产品已经验证数据目录不是一个单一 `table-data` 入口，而是一整组面向报表、票据和运行时组件的物料簇。当前应按目录注册方式支持：

- `cell`
- `table-data`
- `table-free`
- `cell-free`
- `card-grid`
- `rich-text`
- `html`
- `background-image`
- `map`
- `progress`
- `formula`
- `function`
- `ruler`
- `bulk-text`
- `bulk-bwip`
- `bulk-qrcode`
- `bulk-barcode`
- `bulk-image`
- `rating`
- `heat`
- `radial-progress`
- `tag-cloud`
- `clock`
- `signature`
- `iframe`
- `conditional-image`
- `datetime`
- `signal-light`
- `alarm`
- `video`
- `weather`
- `number-adjuster`
- `pressure-button`
- `carousel`
- `link`
- `notice`
- `fan`
- `pdf`
- `serial-number`
- `page-number`
- `seal-span`
- `page-break`

### 图表目录

- `chart-line`
- `chart-gauge`
- `chart-bar`
- `chart-pie`
- `chart-funnel`
- `chart-radar`
- `chart-scatter`
- `chart-gauge-alt`
- `chart-water-ball`
- `chart-word-cloud`
- `chart-echarts`
- `chart-chartjs`
- `chart-mermaid`

### SVG 目录

- `svg-line`
- `svg-bezier-2`
- `svg-bezier-3`

### 关系图目录

- `relation-process`
- `relation-decision`
- `relation-start-end`
- `relation-data`
- `relation-document`
- `relation-subprocess`
- `relation-manual-input`
- `relation-page-ref`
- `relation-storage`
- `relation-card`
- `relation-manual-op`
- `relation-parallel`
- `relation-prepare`
- `relation-database`
- `relation-external-data`
- `relation-queue-data`
- `relation-band`
- `relation-cross-page-ref`

结论：

- `chart / svg / relation` 在架构上不是一个物料，而是目录型系统
- v1 不必把所有子物料全部做完，但物料注册体系必须一开始就能容纳它们

## 11.3 一等公民物料

以下物料必须按一级系统建设，而不是当成普通盒子补丁处理。

> **v2 重设计**：table-static 和 table-data 经过 breaking change 重设计，详见 [23-table-v2-redesign](./23-table-v2-redesign.md)。

### `table-static`

它需要：

- 固定行列拓扑，无 role 概念（所有行强制 `normal`）
- 任意方向合并与拆分单元格
- 格子尺寸和局部边框编辑
- 每个格子独立排版属性（`cell.typography`，回退到表级 `typography` 默认值）
- 格子内联内容编辑（深度编辑 content-editing 阶段，工具栏 + 属性面板设置文本属性）
- 独立数据源绑定（`cell.staticBinding`），每个 cell 可绑定不同 source 的字段，与手动编辑互斥

### `table-data`

它需要：

- 表级主数据源绑定（`TableDataSchema.source`），指向集合字段
- Row role 标记 (normal/header/footer/repeat-template)，header 和 footer 各强制单行（schema + 命令层双层强制）
- 头尾可见性控制（`showHeader` / `showFooter`），隐藏时 Viewer 完全不渲染对应行
- Cell 绑定自动继承 table.source 的 sourceId（严格单源）
- 表头/尾编辑：支持手动编辑或拖拽数据源，仅允许左右列方向合并
- 数据区编辑：设计态展示 3 行（1 行编辑区 + 2 行灰色占位），编辑区仅接受数据源绑定，不允许手动编辑和合并
- 数据区占位行：纯渲染层虚拟行，不存在于 schema，完全惰性不可交互
- Row 级 repeat：repeat-template 行按 table.source.fieldPath 集合数据逐项重复

分页切片、重复头、合计区、空行填充由 Viewer/PagePlanner 负责，不属于 table-data 职责。Cell 仅包含文本内容，不支持子物料嵌套。

### 表格工具库

`table-kernel` 是纯工具库，提供 table-static 和 table-data 共享的纯函数：几何计算、拓扑合并/拆分、命中测试。两个表格物料直接 import 所需函数，table-kernel 不做抽象层、不做 re-export。

### 表格 capabilities

```
table-static:  rotatable=false, resizable=true, bindable=true, multiBinding=true
table-data:    rotatable=false, resizable=true, bindable=true, multiBinding=true
```

深度编辑能力通过扩展协议的 `deepEditing` FSM 定义声明，不再通过 capability 标志。

### 深度编辑工具栏

table-static 和 table-data 使用独立的工具栏配置，不再共用：

**table-static 工具栏**：
- 插入行（上/下）、删除行
- 插入列（左/右）、删除列
- 合并右 / 合并下 / 拆分（任意方向均可用）
- 对齐（左/中/右/上/中/下）

**table-data 工具栏**（根据选中 cell 所在区域动态调整）：

Header/Footer 区域选中时：
- 插入列（左/右）、删除列
- 合并右 / 拆分（仅列方向）
- 对齐
- 头/尾可见性切换

数据区选中时：
- 插入列（左/右）、删除列
- 对齐
- 无合并/拆分、无手动编辑入口

### 数据区占位行渲染

table-data 的 Designer Extension 在 repeat-template 行下方额外渲染 2 行纯视觉占位区域：

- 占位行高度 = repeat-template 行的 `row.height`
- 占位行单元格边框/宽度克隆自 repeat-template 行对应 cell
- 占位行整体施加灰色半透明叠加层（如 `background: rgba(0,0,0,0.04)`）
- 占位行不参与 hit-test、不可选中、不可编辑（完全惰性）
- schema 中 element.height 仅反映实际行（不含虚拟行），占位行仅影响设计态视觉高度

### 深度编辑元素的通用交互模型

深度编辑由统一扩展协议驱动，物料通过声明式 FSM 定义自己的编辑阶段，不再依赖 capability 标志。

1. **声明式 FSM**：每个复杂物料通过 `DeepEditingDefinition` 声明内部编辑 phase 和转换规则。Designer 提供基础状态机（idle / selected / deep-editing），物料在 deep-editing 内部扩展子 phase。
2. **Overlay 与 Toolbar 自渲染**：物料在 phase 的 `onEnter` 回调中接收 Designer 提供的定位好的 DOM 容器（overlay + toolbar），自行 mount 渲染内容。Designer 不参与物料内部 UI 渲染。
3. **职责划分**：Designer 管理选区框、resize 把手、对齐、拖拽；物料管理内容渲染和深度编辑 UI。
4. **通信机制**：物料通过 `MaterialExtensionContext` 的查询方法读取状态，通过 `commitCommand` / `emit` 发送指令。
5. **Extension 注册**：物料通过工厂函数 `createExtension(context)` 注册，返回 `MaterialDesignerExtension` 实例。
6. **Phase 生命周期**：每个 phase 通过 `onEnter` / `onExit` 回调管理挂载和清理。
7. **互斥约束**：同一时刻只有一个元素可进入深度编辑。多选状态与深度编辑互斥。

### `container`

它需要：

- 子元素管理
- 局部坐标系
- 内部布局边界
- 分组选择和局部编辑

### `relation`

它需要：

- 节点关系描述
- 锚点
- 连线和标签
- 结构性编辑

### `chart`

它需要：

- 主数据源绑定
- 图表类型切换
- 图表库适配层
- 与 Viewer 导出路径兼容的静态快照或运行时渲染策略

## 11.4 属性系统

属性系统通过 `PropSchema` 驱动，但不能只停留在一个抽象接口。至少核心物料要有明确属性矩阵。

```typescript
interface PropSchema {
  key: string
  label: string
  type: PropSchemaType
  group?: string
  default?: unknown
  enum?: Array<{ label: string; value: unknown }>
  min?: number
  max?: number
  step?: number
  properties?: PropSchema[]
  items?: PropSchema
  visible?: (props: Record<string, unknown>) => boolean
  disabled?: (props: Record<string, unknown>) => boolean
  editor?: string
  editorOptions?: Record<string, unknown>
}
```

### 所有物料的公共属性组

- 几何：`x / y / width / height / rotation / alpha`
- 可见性：`hidden / locked / print`
- 元数据：`name / help / diagnostics`

### 文本物料属性矩阵

文本物料不是只有 `content + fontSize`。当前至少要有：

- 内容：内容、绑定字段、显示格式
- 绑定辅助：快捷前缀、快捷后缀
- 文本行为：富文本、自动换行、溢出省略、幽灵展示、自动分页
- 排版：字号、字体、行高、字间距、排列
- 颜色：文字颜色、背景颜色、黑白模式
- 边框：边框宽度、边框颜色、边框类型
- 元信息：帮助链接、元素名称、隐藏、锁定

### 表格物料属性矩阵

表格物料属性按三层上下文组织：

- 表级属性：格子均分、边框外观、格子间距、边框宽度、边框类型、边框颜色、排版默认值（`typography`：字号、颜色、粗体、斜体、行高、字间距、对齐、垂直对齐）、主数据源（仅 table-data）、头尾可见性（仅 table-data，`showHeader` / `showFooter`）
- 行属性：行角色（仅 table-data 显示）、行高
- 单元格属性：跨度、边框（四侧独立 width/color/type）、内边距、排版（`cell.typography`：字段缺失时显示表级默认值 + "重置为默认"按钮）、绑定字段（table-data: `binding`，table-static: `staticBinding`）
- 内容属性：格子文本内容（仅无绑定时可编辑）、内联文本编辑入口

内容层不是另一套独立属性面板。它必须挂在表格壳层之下，避免编辑文字时丢失当前表格上下文。

### 目录型物料的属性策略

- `chart/*` 子物料共享图表基类属性，再叠加图表类型专属属性
- `svg/*` 子物料共享路径/描边/填充基类属性
- `relation/*` 子物料共享节点外观、锚点和连接器属性

## 11.5 绑定能力

物料的绑定能力按类型划分：

### 单值绑定

- `text`
- `image`
- `barcode`
- `qrcode`
- `datetime`
- `table-static`（cell 级独立绑定，每 cell 可绑不同 source）

### 结构绑定

- `table-data`
- `chart/*`
- `relation/*`
- `carousel`

### 多参数绑定

- `barcode`
- `formula`
- `function`
- 其他声明了 `multiBinding` 的物料

### 非绑定物料

- `rect`
- `line`
- `ellipse`
- 多数纯装饰图形

## 11.6 Designer 扩展面

物料通过工厂函数注册 extension，Designer 提供上下文能力，物料自行渲染和管理深度编辑。

```typescript
/** 物料通过工厂函数注册 extension */
type MaterialExtensionFactory = (context: MaterialExtensionContext) => MaterialDesignerExtension

interface MaterialExtensionContext {
  /** 查询能力：读取 schema、获取选中状态 */
  getSchema(): DocumentSchema
  getNode(id: string): MaterialNode | undefined
  getSelection(): SelectionState
  /** 指令能力：提交 command、请求属性面板切换 */
  commitCommand(command: Command): void
  requestPropertyPanel(descriptor: PropertyPanelRequest): void
  emit(event: string, payload: unknown): void
  on(event: string, handler: (...args: unknown[]) => void): () => void
}

interface MaterialDesignerExtension {
  /** 设计态内容渲染：设计器提供定位好的内容 DOM 容器，物料自行渲染。
   *  nodeSignal 提供框架无关的响应式订阅：调用 nodeSignal.subscribe(callback) 监听节点变化，
   *  调用 nodeSignal.get() 获取当前值。物料在首次调用时完成 DOM 挂载，后续通过 subscribe 增量更新。
   *  返回 cleanup 函数，在元素从画布移除时调用。 */
  renderContent(nodeSignal: NodeSignal, container: HTMLElement): () => void

  /** 声明式 FSM 定义（可选，仅复杂物料提供） */
  deepEditing?: DeepEditingDefinition
}

> **右键菜单**由 Designer 统一管理（`CanvasContextMenu`），提供通用操作（复制/剪切/粘贴/克隆/删除/层级/锁定），物料不参与右键菜单注册。物料特有的操作应通过深度编辑或属性面板暴露。

/** 框架无关的节点响应式信号 */
interface NodeSignal {
  /** 获取当前节点快照 */
  get(): MaterialNode
  /** 订阅节点变化，返回取消订阅函数 */
  subscribe(callback: (node: MaterialNode) => void): () => void
}

/** 声明式有限状态机定义 */
interface DeepEditingDefinition {
  /** 物料内部 phases + 转换规则 */
  phases: DeepEditingPhase[]
  /** 初始 phase（进入 deep editing 时） */
  initialPhase: string
}

interface DeepEditingPhase {
  id: string
  /** Phase 进入时，设计器提供 DOM 容器，物料自行 mount overlay/toolbar */
  onEnter(containers: PhaseContainers, node: MaterialNode): void
  /** Phase 退出时 cleanup */
  onExit(): void
  /** 子选择协议：物料声明当前 phase 支持的子元素选择逻辑 */
  subSelection?: SubSelectionHandler
  /** Resize 协议：物料声明内部可 resize 区域 */
  internalResize?: InternalResizeHandler
  /** Keyboard 路由：物料声明对按键事件的响应 */
  keyboardHandler?: KeyboardRouteHandler
  /** 转换规则：声明从当前 phase 可以转换到哪些 phase 及触发条件 */
  transitions: PhaseTransition[]
}

interface PhaseContainers {
  /** overlay DOM 容器（覆盖在元素上方，绝对定位） */
  overlay: HTMLElement
  /** toolbar DOM 容器（位于元素上方的浮动区域） */
  toolbar: HTMLElement
}

interface SubSelectionHandler {
  hitTest(point: { x: number; y: number }, node: MaterialNode): SubSelectionResult | null
  getSelectedPath(): unknown
  clearSelection(): void
}

interface InternalResizeHandler {
  getResizeHandles(node: MaterialNode): ResizeHandle[]
  onResize(handle: ResizeHandle, delta: { dx: number; dy: number }): void
  onResizeEnd(handle: ResizeHandle): void
}

interface KeyboardRouteHandler {
  handleKey(event: KeyboardEvent, node: MaterialNode): boolean
}

interface PhaseTransition {
  to: string
  trigger: 'click' | 'double-click' | 'escape' | 'custom'
  guard?: (event: unknown, node: MaterialNode) => boolean
}
```

### 11.6.1 设计态渲染（Design-time Rendering）

设计态渲染是画布中物料的视觉内容呈现，与 Viewer 渲染是两套独立实现。

**为什么不复用 Viewer 渲染器：**

- 设计态不执行数据绑定解析，绑定值显示为字段标签（如 `{#订单编号}`）
- 设计态不执行分页、字体加载、数据源拉取等运行时流程
- 复杂物料（图表、关系图）在设计态使用静态缩略图或简化占位，不引入第三方渲染库
- 设计态需要响应编辑交互（悬停、选中、编辑态样式变化），Viewer 渲染器不关心这些
- 设计态渲染运行在画布主线程，必须轻量快速

**渲染方式：**

`renderContent(nodeSignal, container)` 接收 Designer 提供的已定位 DOM 容器和框架无关的节点信号。物料在首次调用时挂载 DOM，后续通过 `nodeSignal.subscribe()` 监听变化并增量更新，无需重建。返回 cleanup 函数用于元素移除时的清理。不返回 HTML 字符串。

Designer 内部将 Vue computed 包装为 `NodeSignal` 接口，extension 代码不依赖 Vue。

**各类物料的设计态渲染策略：**

| 物料类别 | 设计态渲染 | 与 Viewer 的差异 |
|---|---|---|
| text | 根据 props 渲染文字样式（字号/字体/颜色/对齐）；绑定值显示为 `{#字段标签}`，使用用户设置的样式渲染 | Viewer 会替换为真实数据 |
| image | 有 src 时显示图片缩略图，无 src 时显示图标占位 | 无差异 |
| barcode / qrcode | 显示静态示意图 + 值标签 | Viewer 调用渲染库生成真实码 |
| line / rect / ellipse | 根据 props 直接渲染图形（颜色、边框、圆角） | 基本无差异 |
| table-static | 渲染表格格线结构和格子内容；有 staticBinding 的 cell 显示 `{#字段标签}`，无绑定的 cell 显示手动编辑文本 | Viewer 替换为真实数据 |
| table-data | 渲染表格格线结构；header/footer 显示文本或绑定标签；数据区编辑行显示绑定标签，下方 2 行灰色占位 | Viewer 执行数据展开、分页、重复头 |
| container | 渲染容器边界 + 递归渲染子元素 | 基本无差异 |
| chart | 显示图表类型图标 + 静态缩略图占位 | Viewer 调用图表库渲染真实图表 |
| svg | 直接渲染 SVG 内容 | 基本无差异 |
| relation | 显示关系类型图标 + 结构占位 | Viewer 渲染完整连线和锚点 |

**回退策略：**

- 如果物料未提供 `renderContent()`，画布显示类型名占位块（当前行为）
- 未知物料始终显示诊断占位，不静默消失

**画布调用流程：**

```
CanvasWorkspace 遍历 elements
  → 为每个元素创建定位好的内容 DOM 容器
  → 创建 NodeSignal：包装 Vue computed 为 { get(), subscribe() }
  → 查找 MaterialDesignerExtension.renderContent
  → 有：调用 cleanup = renderContent(nodeSignal, container)，物料自行渲染到容器内
  → 无：在容器内显示类型名占位
  → 叠加选区边框、拖拽手柄、绑定角标等交互层
  → 元素移除时调用 cleanup() 清理
```

对于结构物料，还需要支持：

- 局部选区
- 子树结构树映射
- 专属快捷键

对表格物料，还需要额外支持：

- 表壳、格子、格子内容三层编辑上下文
- 格子内文本进入内联编辑时，属性壳层仍保持 `table-static/table-data` 上下文
- 表格浮动工具条与属性面板共享同一份表格编辑状态，而不是各自维护一套临时状态
- 深度编辑 phase 的 overlay/toolbar 通过 `PhaseContainers` 挂载，由 Designer 管理定位

## 11.7 Viewer 扩展面

每个物料包可提供 Viewer 渲染扩展：

```typescript
interface MaterialViewerExtension {
  render(node: MaterialNode, context: ViewerRenderContext): ViewerRenderOutput
  measure?(node: MaterialNode, context: ViewerMeasureContext): ViewerMeasureResult
}
```

对目录型物料的要求：

- 目录项不能只影响 Designer 菜单，它必须最终映射到可渲染的 `materialType`
- Viewer 需要能根据 `materialType` 精确找到扩展实现

## 11.8 未知物料策略

当模板中出现未知物料时：

- Designer 不直接删除
- 画布显示占位块
- 属性面板显示只读基础信息
- Viewer 输出诊断和明显占位
- 导入导出时尽量保留原始节点

## 11.9 v1 与完整对标范围

当前不应把“架构支持的完整目录”与“v1 先做哪些物料”混为一谈。

### 架构必须支持的完整范围

- 快捷物料条
- 数据目录
- 图表目录
- SVG 目录
- 关系图目录

### v1 实现优先级

1. `text`、`image`、`barcode`、`qrcode`
2. `table-data`、`table-static`
3. `container`
4. `chart/*`、`svg/*`、`relation/*` 的基础注册和少量代表性实现

这意味着物料体系要优先保证报表、票据、标签、多区域模板的主路径可用，同时不把目录架构做死在少量基础物料上。
