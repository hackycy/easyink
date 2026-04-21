# 10. 设计器交互层

EasyInk 的 Designer 按”顶层双栏 + 画布内窗口系统 + 状态栏”的方式建模。

## 10.1 工作台骨架

默认工作台应接近如下结构：

```
┌──────────────────────────────────────────────────────────────────────┐
│ Top Bar A: Slot (由外部用户自定义，如 Logo/Save/Preview 等)          │
├──────────────────────────────────────────────────────────────────────┤
│ Top Bar B: Toolbar Manager + Configurable Toolbar Groups + Zoom      │
├──────────────────────────────────────────────────────────────────────┤
│ Canvas Workspace                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Ruler / Guides / Region Navigator / Page Canvas               │  │
│  │                                                                │  │
│  │  Floating Window: Materials                                    │  │
│  │  Floating Window: DataSource                                   │  │
│  │  Floating Window: Minimap                                      │  │
│  │  Floating Window: Properties                                   │  │
│  │  Floating Window: Structure Tree                               │  │
│  │  Floating Window: History                                      │  │
│  │  Floating Window: Animation                                    │  │
│  │  Floating Window: Assets / Debug / Draft                       │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│ Status Bar: Focus / Network / Draft / Auto Save                    │
└──────────────────────────────────────────────────────────────────────┘
```

这套结构的关键点：

- 主画布周围不是固定停靠 rail，而是多个窗口对象
- 物料浏览是画布内浮动窗口之一（`WorkspaceWindow`），而不是顶栏内联元素
- 模板选择不属于内置窗口体系，而是宿主侧工作流
- 属性窗口、结构树、历史、动画并不要求固定停在某一边
- 状态栏是独立层，不应和动画/历史混为同一抽屉

## 10.2 顶层双栏

### 第一层：外部插槽（Slot）

第一层顶部栏不再由框架内置，而是通过 `EasyInkDesigner` 的 `#topbar` 插槽暴露给外部用户。外部用户可自行填充：

- 品牌 Logo
- 保存、自定义模板入口、预览入口等全局动作
- 任意自定义内容

框架不再内置 Logo、保存按钮、预览按钮或模板库入口。外部用户通过 `useDesignerStore()` 访问 store 来操作编辑器状态，并在宿主层自行接入 `@easyink/viewer`、模板选择与未保存确认。

物料窗口、数据源窗口等浮动窗口的显隐控制已移入 Toolbar Manager（见下文）。

### 第二层：可配置工具组带

第二层不是静态按钮行，而是”可配置工具组带”。

实测表明它具备：

- 工具栏管理器入口
- 浮动窗口快捷切换按钮（与管理器入口同级，直接控制窗口显隐；空间不足时自动隐藏）
- 工具组对齐方式：居左、居中、居右
- 每个工具组可独立隐藏
- 每个工具组前的分割线可独立隐藏
- 可恢复默认编排
- 工具组本身支持横向滚动

### 工具栏管理器（Toolbar Manager）

Toolbar Manager 负责管理工具组带的编排。

Manager 面板包含：

- **工具组编排区**：对齐方式、工具组显隐、分割线显隐、恢复默认。

浮动窗口的显隐控制已提升至 TopBarB 工具栏，以 icon 按钮形式直接展示在工具栏管理器入口旁边，点击即可切换对应浮动窗口的显隐。支持的窗口包括：
- 物料（materials）
- 数据源（datasource）
- 属性（properties）
- 结构树（structure-tree）
- 历史记录（history）
- 缩略图（minimap）
- 调试（debug）

TopBarB 整体结构为：工具栏管理器入口 | 浮动窗口切换按钮 | 分割线 | 可滚动工具组带 | 缩放控制

因此 EasyInk 需要把它建模为：

```typescript
interface ToolbarLayoutState {
	align: 'start' | 'center' | 'end'
	groups: ToolbarGroupState[]
}

interface ToolbarGroupState {
	id: string
	hidden: boolean
	hideDivider: boolean
	order: number
}
```

对标产品里已验证存在的工具组包括：

- 撤销与重做
- 新建与清空
- 字号
- 旋转
- 显示与隐藏
- 选择
- 同类选择
- 分散排列
- 对齐
- 层级调整
- 组合
- 编辑锁定
- 复制、粘贴与剪切板清理
- 保持宽高比与拖动转移元素
- 磁吸控制

## 10.3 窗口系统

### 窗口是一级交互对象

数据源、概览图、属性、结构树、历史、动画、图片库、调试、暂存以及物料浏览等都应作为 `WorkspaceWindow` 处理。

每个窗口至少具备：

- 标题栏拖拽移动
- 折叠
- 关闭
- 帮助入口
- 部分窗口的宽高调整
- 本地状态持久化

### 需要持久化的窗口状态

```typescript
interface WorkspaceWindowState {
	id: string
	kind: string
	visible: boolean
	collapsed: boolean
	x: number
	y: number
	width: number
	height: number
	zIndex: number
}
```

### 工作台完整状态

此前文档只写了窗口状态，不够。现在明确工作台状态模型：

```typescript
interface WorkbenchState {
	windows: WorkspaceWindowState[]
	toolbar: ToolbarLayoutState
	viewport: CanvasViewportState
	panels: PanelToggleState
	status: StatusBarState
	snap: SnapState
}

interface CanvasViewportState {
	zoom: number
	scrollLeft: number
	scrollTop: number
	activeRegionId?: string
}

interface PanelToggleState {
	dataSource: boolean
	minimap: boolean
	properties: boolean
	structureTree: boolean
	history: boolean
	animation: boolean
	assets: boolean
	debug: boolean
	draft: boolean
}
```

这些状态都属于工作台状态，不进入 Schema，也不进入命令历史。

## 10.4 画布区结构

### 标尺与辅助线

- 顶部与左侧标尺常驻
- 辅助线管理器独立存在
- 缩放变化后标尺仍与页面单位对应

### 区段导航

对票据、多区域模板和多编辑区模板，画布上方需要有显式 `RegionNavigator`：

- 显示区段名称，例如单据头、单据体、单据尾
- 支持切换当前编辑区或单元格
- 反映当前可编辑块的层次结构

这不是普通结构树替代品，而是面向当前页面编辑上下文的快捷层。

### 选区与编辑态

- 单选显示边框和拖拽手柄
- 多选显示联合包围框
- 表格类元素允许深入到单元格级编辑
- 区段型模板允许直接选中当前格子或当前区块

## 10.5 主要窗口职责

### 数据源窗口

- 搜索数据源字段
- 展示折叠树
- 叶子字段拖拽绑定
- 分组字段拖拽 `union` 批量投放

### 属性窗口

属性窗口不是”某种选中态就整个切换内容”，而是同一壳层中承载元素属性与页面属性的互斥视图：

- 当前元素属性
- 当前页面属性

行为约束：

- 空白选中时，只显示页面属性区
- 元素选中时，只显示元素属性区，页面属性区隐藏
- 页面属性永远不进入元素撤销栈，元素属性永远不污染工作台状态

#### 页面属性区必须是描述符驱动系统

页面属性区至少要覆盖四类信息：

- 文档上下文：类型、单位、预览器
- 纸张与编辑区：宽、高、编辑区、常用纸张、标签列数与间距、圆角
- 打印与分页：水平位置、垂直位置、打印份数、空白页、连续排版、底部留白
- 辅助与背景：网格开关和尺寸、全局字体、背景颜色、背景图片、背景重复/缩放/偏移

这里面至少包含三种来源：

- 规范字段：直接落在 `DocumentSchema` 或 `page`
- 兼容字段：来自 benchmark 原始 JSON 的历史别名或未归一字段
- 派生控件：例如 `常用纸张`、`单位`，它们是编辑器便利视图，不应该直接保存成 schema 噪音

因此页面属性区不应继续硬编码成 `width / height / mode` 三项表单，而应抽象为描述符系统：

```typescript
interface PagePropertyDescriptor {
	id: string
	group: 'document' | 'paper' | 'print' | 'assist' | 'background'
	source: 'document' | 'page' | 'compat' | 'derived'
	path: string
	persisted: 'schema' | 'compat' | 'derived'
	editor: 'readonly' | 'number' | 'select' | 'switch' | 'color' | 'asset'
	visible?: (ctx: PagePropertyContext) => boolean
	normalize?: (value: unknown, ctx: PagePropertyContext) => PagePropertyPatch
}

interface PagePropertyContext {
	document: DocumentSchema
	rawPage?: Record<string, unknown>
	selectedElementId?: string
}

interface PagePropertyPatch {
	page?: Partial<PageSchema>
	document?: Partial<DocumentSchema>
	compat?: Record<string, unknown>
}
```

设计约束：

- 页面属性区仍属于同一属性窗口壳层，元素选中时隐藏，空白选中时显示
- 派生控件写回时必须经过 `normalize`，避免把 `A4`、`毫米(mm)` 这类展示值直接写进模板
- benchmark 中尚未稳定归一的页面项，先走 `compat` 或 `extensions`，不要在 Designer 层偷偷丢掉

#### PropertyPanelOverlay 动态叠加层

静态 `PropSchema[]` 无法覆盖 deep editing 阶段的动态属性需求（如表格 cell-selected 需要展示单元格级 typography/border/binding）。通过命令式推送叠加层解决：

```typescript
interface PropertyPanelOverlay {
  id: string
  title?: string
  schemas: PropSchema[]
  readValue: (key: string) => unknown
  writeValue: (key: string, value: unknown) => void
  binding?: BindingRef | BindingRef[] | null
  clearBinding?: (bindIndex?: number) => void
  editors?: Record<string, Component>
}
```

物料通过 `ctx.requestPropertyPanel(overlay)` 推送，`null` 清除叠加层。

**渲染模型**（从上到下）：

1. **Geometry** -- 位置/尺寸，始终显示
2. **基础层** -- `MaterialDefinition.props` 驱动，始终显示
3. **叠加层** -- `PropertyPanelOverlay.schemas` 驱动，仅 deep editing 推送时显示
4. **BindingSection** -- 按规则显隐（见下）
5. **可见性/锁定** -- 始终显示

**BindingSection 显隐规则**：

- overlay 提供 `binding` 且非 `null` → 展示推送的 binding
- overlay 提供 `binding === null` → 隐藏 BindingSection
- 无 overlay 且 `material.capabilities.bindable === false` → 隐藏
- 否则 → 展示元素顶层 binding

**自动清除**：PropertiesPanel watch editing session 状态，session 退出时自动 `setPropertyOverlay(null)`。90% 场景由 `selectionType.getPropertySchema` 自动派生（见 [22 章 S22.6.3](./22-editing-behavior.md)），仅 EphemeralPanel 场景需要手动推送。

**自定义编辑器**：物料包可定义 Vue 组件，通过 `editors` 映射传入。面板按 `PropSchema.editor` 字段查找，匹配到自定义编辑器时渲染该组件。

**sectionFilter 声明**：

`MaterialDefinition` 可选声明 `sectionFilter` 控制面板 section 显隐：

```typescript
sectionFilter?: (sectionId: PanelSectionId, context: SectionFilterContext) => boolean
// PanelSectionId = 'geometry' | 'props' | 'overlay' | 'binding' | 'visibility'
// SectionFilterContext = { node: MaterialNode, isEditing: boolean }
```

返回 `false` 隐藏该 section。表格物料注册时声明 `sectionFilter: (id) => id !== 'binding'`，因为表格绑定粒度是单元格级而非元素级（cell 级 binding 通过 `PropertyPanelOverlay.binding` 在 cell-selected 阶段展示）。

**状态管理**：

```typescript
// DesignerStore 新增 reactive 状态
private _propertyOverlay: PropertyPanelOverlay | null = null
setPropertyOverlay(overlay: PropertyPanelOverlay | null): void
get propertyOverlay(): PropertyPanelOverlay | null
```

`MaterialExtensionContext.requestPropertyPanel(overlay)` 内部调用 `store.setPropertyOverlay(overlay)`。

**约束**：当前仅支持单叠加层、仅 deep editing 上下文、仅单选、自定义编辑器限 Vue 组件。

### 结构树窗口

结构树不是纯图层列表，而是真正的递归树。

它至少要支持：

- 展示页面根节点和元素树
- 显示元素类型图标和名称
- 点击树节点联动画布选中
- 折叠/展开递归结构
- 支持表格包含表格、容器包含子元素、Flex 包含局部子树

### 历史窗口

- 显示历史总数和当前游标
- 支持直接跳转历史点

### 动画窗口

- 更接近时间轴编辑器而不是简单列表
- 需要独立的宽度和播放控制区
- 适合放在画布下方，但本质仍是窗口对象

### 概览图窗口

- 显示当前页面缩略图和可视区
- 用于快速定位长页或多区段内容

## 10.6 模板选择由宿主负责

模板列表、模板权限、搜索分页、模板切换确认与覆盖当前文档的 UX 不再内置在 designer 中。

框架边界调整为：

- designer 只暴露 `#topbar` 插槽与 store，供宿主放置模板入口
- 宿主自行维护模板来源、分页、搜索、权限与未保存确认
- 宿主决定模板切换是否直接覆盖当前 schema

这样可以避免把业务权限模型、模板管理策略和设计器工作台状态混在一起。

## 10.7 深度编辑（Deep Editing）

深度编辑不是表格专属能力。所有复杂物料（table/chart/container/relation）通过同一套扩展协议进入深度编辑模式。编辑行为的正式协议已迁移至 [22 章 编辑行为架构](./22-editing-behavior.md)，本节保留设计器侧顶层交互模型和物料级示例。

### 10.7.1 统一编辑会话协议

Designer 提供 `EditingSessionManager`，包含三个顶层阶段：`idle`、`selected`、`editing-session`。

物料在 extension 中声明 `geometry / selectionTypes / behaviors / decorations`（见 [22 章](./22-editing-behavior.md)）时，可通过 `enterTrigger`（默认 `'dblclick'`，表格为 `'click'`）进入编辑会话：

```
idle --click element--> selected
selected --enterTrigger--> editing-session (delegate to behavior chain)
editing-session --click outside / Esc--> idle
```

职责划分：

**Designer 管理：**
- 选区边框（selection box）
- element 级 resize handle
- 对齐辅助线
- 拖拽移动（drag movement）
- editing session 的进入/退出生命周期
- `SelectionDecoration` 自动定位渲染（基于 `resolveLocation` 返回的矩形）

**物料通过 22 章协议声明：**
- 内容渲染（`renderContent`）
- overlay 渲染（`SelectionDecoration` Vue 组件，框架自动定位）
- toolbar 渲染（物料自管，可在 `SelectionDecoration` 中渲染或用 `EphemeralPanel`）
- 内部 resize handle（如列/行边线手柄，在 `SelectionDecoration` 中实现）
- 子选中（`SelectionStore` 持有类型化 `Selection`，物料只读）
- 键盘路由（`behaviors` 中间件链，Koa 风格 `(ctx, next)`）

进入 editing session 时：
- element 级 8 个 resize handle 和 rotate handle 隐藏
- 外部拖拽把手保持显示，用于移动元素
- `SelectionDecoration` 由框架自动挂载到页面级 overlay 容器，定位基于 `resolveLocation` 返回的画布坐标
- 提升元素 z-index，确保 overlay 不被其他元素遮挡
- 同一时刻只有一个 `EditingSession` 活动（互斥约束）
- 多选元素状态与 editing session 互斥：进入前必须先取消多选

### 10.7.2 编辑会话运行时状态

```typescript
// EditingSession runtime state (not in Schema, not in undo/redo)
// Managed by EditingSessionManager (see packages/designer/src/editing/)
interface EditingSessionState {
  nodeId: string
  selection: Selection | null  // from SelectionStore, typed & JSON-safe
  meta: Record<string, unknown>  // reactive, for decoration/toolbar communication
}
```

注意：Schema 不感知编辑会话 -- 此状态纯粹属于运行时/交互上下文，不进入 Schema 也不进入命令历史。

### 10.7.3 示例：表格物料的 Behavior 实现

> 以下是表格物料内部的行为实现，通过 22 章 behavior middleware 注册。其他复杂物料（chart/container/relation）各自定义自己的 behavior 链。

表格物料注册以下 behavior middleware（按 priority 排序执行）：

**`selectionMiddleware`（框架级，priority -100）：**
- 调用 `materialGeometry.hitTest()` 产出 Selection 候选
- 更新 `selectionStore`

**`table.cell-select`（priority 10）：**
- pointer-down 时解析合并单元格 owner
- 更新 selection 为 `{ type: 'table.cell', payload: { row, col } }`

**`table.keyboard-nav`（priority 10，仅 `table.cell` selection）：**
- Tab/Shift+Tab：行优先导航
- 方向键：4 向导航
- Delete：清除单元格内容

**`table.cell-edit`（priority 20，仅 `table.cell` selection）：**
- Enter/F2：进入内联编辑（设置 `session.meta.editingCell`）
- `SelectionDecoration` 组件 watch `meta.editingCell` 渲染 textarea

**`table.resize`（priority 30）：**
- 列/行 resize 命令，使用 `mergeKey` coalesce 连续拖拽

**`table.command-handler`（priority 50）：**
- 插入/删除行列、合并/拆分、对齐、commit-cell-text 等

表格的 `SelectionDecoration` 组件渲染：
- 单元格高亮边框 + 背景
- 列/行 resize 手柄
- toolbar 容器（物料自管 DOM）
- 内联编辑 textarea（当 `meta.editingCell` 匹配当前选区时）

交互流程：

```
editing-session 进入 --hitTest--> selection = { type: 'table.cell', row, col }
click 另一格子 --> selectionStore 更新 --> decoration 重渲染
Enter/F2 --> meta.editingCell 设置 --> decoration 渲染 textarea
Enter (textarea) --> commit-cell-text command --> meta.editingCell 清除
Esc --> keyboardCursorMiddleware 退出 editing session
```

### 10.7.4 示例：表格事件分发

> 以下是表格物料 FSM 内部的事件处理逻辑。

**cell-selected 阶段：**
- 单击另一个格子 → 直接切换 cellPath（跨 row role 时同时更新行上下文）
- 双击格子 → 进入 `content-editing`
- 拖拽列边线 → 列 resize（修改当前列 ratio，推动右侧列位置，改变 element.width）
- 拖拽行边线 → 行 resize（修改 row.height，改变 element.height）

**table-selected 阶段：**
- 单击格子区域 → 进入 `cell-selected`（记录 cellPath，推断行 role 上下文）
- 拖拽 element resize handle → 调整表格整体尺寸，列宽等比伸缩

### 10.7.5 示例：表格格子态 affordance

> 以下是表格物料在 cell-selected 阶段自行渲染到 overlay/toolbar 容器中的 UI 元素。

进入 `cell-selected` 后，表格物料挂载：

- 透明点击捕获层（覆盖整个表格，pointer-events:auto，无视觉效果，路由对其他单元格的点击/双击事件）
- 单元格高亮边框+背景（仅覆盖选中单元格区域，pointer-events:none）
- 右列边 resize 手柄（仅在选中单元格的右列边缘，长度等于单元格高度）
- 下行边 resize 手柄（仅在选中单元格的下行边缘，长度等于单元格宽度）
- resize 手柄在拖拽期间实时更新位置（命令式同步：overlay 容器、高亮、手柄位置在 pointermove 中更新）
- 绑定字段拖拽句柄
- 删除当前绑定字段动作
- 浮动工具条（挂载到 toolbar 容器，固定在表格上方），v1 覆盖：添加/删除行列、合并/拆分单元格、单边边框显隐、内容对齐

### 10.7.6 示例：表格列 resize 交互语义

> 以下是表格物料内部的列 resize 逻辑。

- 拖拽列右边线时，修改当前列的 ratio 值
- 右侧所有列位置平移，表格元素总宽（element.width）随之变化
- 这不是”左右列此消彼长”模式
- 最小列宽约束：计算 `ratio * element.width` 的实际像素值，当低于下限（如 4px）时拖拽停止响应
- 列 resize 命令支持 merge，连续拖拽期间的中间值压缩为一条 undo 记录

### 10.7.7 示例：表格列操作与合并单元格的交互

> 以下是表格物料内部的列操作逻辑。

- 插入列时，已有合并单元格（colSpan > 1）自动扩展 colSpan
- 删除列时，涉及的合并单元格自动收缩 colSpan（colSpan 减到 1 则变回普通单元格）
- 这些批量修改由 CompositeCommand 包装，undo 时整体回滚

### 10.7.8 示例：表格属性壳层行为

> 以下是表格物料与属性面板的协作方式。

格子态下属性面板不应切换成”另一个单元格编辑器页面”，而应保持同一壳层：

- 上半段仍是表格级属性
- 下半段根据 editing session 的 selection 状态（由 `selectionType.getPropertySchema` 自动派生，见 [22 章 S22.6.3](./22-editing-behavior.md)）动态追加格子级属性组
- `cell-selected` 时自动追加格子属性组
- `table-selected` 时仅显示表格级属性
- 属性面板使用展开/折叠组分离不同层级的属性

行角色级属性（显隐、重复）不需要独立的交互态。用户点击不同 role 行中的 cell 时，属性面板的表级属性区自动反映当前行的 role 上下文。

### 10.7.9 示例：表格格子内容编辑

> 以下是表格物料 content-editing 阶段的实现。

v1 表格格子内容仅支持纯文本：

- 双击单元格后，在单元格位置覆盖一个原生 input 元素
- input 的位置和尺寸与单元格对齐，由 overlay 层管理
- 回车键确认编辑，Esc 退出到 `cell-selected`
- 编辑完成后通过 `tx.run()` 写入 cell 的 content（见 [22 章](./22-editing-behavior.md) `commit-cell-text` 命令）
- 右侧属性面板仍显示表格壳层属性，不切成独立文本属性页

Cell 内容为纯文本，不支持嵌套子物料。

### 10.7.10 示例：表格键盘交互（v1 最小集）

> 以下是表格物料 FSM 内部的键盘路由。

- **Esc**：逐层退出（content-editing -> cell-selected -> table-selected -> idle）
- **Tab**：cell-selected 时切换到下一个单元格（按行优先顺序，末尾回绕到首格）
- **Enter**：cell-selected 时进入 content-editing；content-editing 时确认编辑并退出到 cell-selected
- **Delete**：cell-selected 时删除当前格子内容

## 10.8 绑定交互

绑定不是改一个路径字符串，而是一组工作台动作。

### 标量元素

1. 从数据源树拖拽叶子字段到画布元素。
2. Designer 通过命中测试确定目标元素。
3. 生成 `BindingRef` 并更新元素。
4. 属性窗口与画布角标同步反映绑定状态。

### `union` 投放

1. 拖拽带 `union` 的字段组。
2. Designer 根据字段元数据一次生成多个元素。
3. 生成相对偏移布局和默认 props。
4. 结构树一次插入一组相关节点。

### `table-data` 绑定

表格采用 cell 级绝对路径绑定 + 同行同集合约束模型。

1. 从数据源树拖拽字段到表格上方。
2. 当前悬停的单元格显示 drop zone 高亮，并指示类型兼容性。
3. 根据目标 cell 所在行的 role 区分处理：
   - **repeat-template 行**：检查新字段的集合前缀是否与同行已有 cell 一致（`getFieldCollectionPrefix()` 校验），不一致则拒绝拖入并显示提示。通过 `context.tx.run()` 设置 `cell.binding`，fieldPath 为绝对路径（如 `items/name`）。
   - **header / footer / normal 行**：通过 `context.tx.run()` 设置 `cell.staticBinding`，fieldPath 为绝对路径，无集合约束。
4. 解除绑定时，repeat-template cell 通过 `tx.run()` 清除 `cell.binding`，header/footer cell 通过 `tx.run()` 清除 `cell.staticBinding`。所有表格绑定操作均通过 `TransactionAPI` 产生 `PatchCommand` 进入历史栈（见 [22 章](./22-editing-behavior.md)）。

### 拖拽视觉反馈

拖拽数据源字段到画布时，Designer 统一渲染 drop zone overlay（物料只返回数据描述符，不碰 DOM）：

- `accepted`：绿色边框 + 半透明填充
- `rejected`：红色边框 + 半透明填充
- 可选 label 标签显示在矩形上方

离开页面时（`onDragLeave`）隐藏 overlay。

## 10.9 画布设计态渲染

画布中的每个物料必须根据自身 props 展示近似真实的视觉效果，而不是只显示类型名标签。

### 10.9.1 设计态渲染与 Viewer 渲染的分层

EasyInk 存在两套独立的物料渲染能力：

```
┌─────────────────────────────────────────────────────┐
│ Designer 画布                                        │
│  MaterialDesignerExtension.renderContent(nodeSignal, container)   │
│  - 轻量、快速、不依赖运行时数据流                      │
│  - 绑定值显示为字段标签 {#字段名}                      │
│  - 复杂物料使用简化占位                               │
│  - 叠加选区/拖拽/编辑态交互层                          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Viewer 预览                                          │
│  MaterialViewerExtension.render()                    │
│  - 完整运行时管线：数据加载 → 绑定 → 分页 → 渲染        │
│  - 替换为真实数据                                     │
│  - 引入第三方库（图表、条码等）                         │
│  - 用于预览、打印、导出                                │
└─────────────────────────────────────────────────────┘
```

两者不共享渲染代码，因为它们的职责和约束完全不同：

| 维度 | 设计态渲染 | Viewer 渲染 |
|---|---|---|
| 数据 | 无真实数据，绑定显示为标签 | 真实数据绑定 |
| 性能要求 | 主线程同步，必须快 | 可异步，可重量级 |
| 第三方依赖 | 不引入 | 按需加载 |
| 交互响应 | 悬停/选中/编辑态样式 | 无交互 |
| 输出目的 | 编辑体验 | 预览/打印/导出 |

### 10.9.2 画布元素渲染流程

```
CanvasWorkspace 遍历 elements
  → store.getDesignerExtension(el.type)
  → extension.renderContent 存在？
     ├─ 是：创建 NodeSignal 并传入 renderContent(nodeSignal, container)
     │     物料首次挂载 DOM，后续通过 subscribe 增量更新
     └─ 否：显示类型名占位块 + 虚线边框（回退）
  → 叠加交互层：选区边框、8 向缩放手柄、旋转手柄、绑定角标
```

### 10.9.3 设计态绑定值显示

当元素已绑定数据字段时，设计态不显示真实数据（没有数据源运行时），而是：

- 文本元素：`{#字段标签}` 或 `前缀{#字段标签}后缀`，使用用户设置的文本样式渲染
- 图片元素：显示图标占位 + `{#字段标签}`
- 条码/二维码：显示示意图 + `{#字段标签}`
- 表格数据区：每个绑定单元格显示 `{#字段标签}`

绑定标签由 `DesignerRenderContext.getBindingLabel()` 统一提供，格式为 `bindingRef.fieldLabel || bindingRef.fieldPath`。

### 10.9.4 编辑态过渡

部分物料支持双击进入内容编辑态（物料 extension 声明 `geometry / behaviors / decorations` 协议，见 [22 章](./22-editing-behavior.md)）：

- 文本：双击进入富文本编辑
- 表格：先进入格子态，再由格子内内容触发原位编辑（与 10.7 表格深度编辑衔接）

编辑态下，交互层（手柄、选区边框）退到背景或隐藏，聚焦在内容操作上。

## 10.10 预览由宿主引入 Viewer

全量预览仍然由 `@easyink/viewer` 承担，但 designer 不再内置 Viewer 宿主或预览状态。

推荐流程：

1. 宿主从 designer 读取当前 schema。
2. 宿主准备预览 data，并自行挂载 `@easyink/viewer`。
3. Viewer 完成真实分页、字体加载、打印和导出适配。

交互边界：

- 预览入口仍建议位于顶层第一栏，但入口和 UI 由宿主实现
- 预览数据属于宿主输入，不属于 designer 工作台状态
- 预览关闭后如何恢复焦点、是否保留对话框状态，也由宿主决定

## 10.11 状态栏

状态栏应作为独立工作台层存在，至少承载：

- 画布焦点状态
- 网络请求状态
- 暂存状态
- 自动保存状态

状态栏必须允许显示成功和失败两种状态，而不是只有“正在保存”。对标产品里已经能看到自动保存失败提示，这意味着 EasyInk 也要把失败视作一级反馈对象。

## 10.12 工作台状态边界

以下状态属于工作台状态，不进入模板历史：

- 窗口显隐、位置、尺寸和层级
- 工具组带排列、隐藏和分隔线显示
- 当前缩放和视口滚动
- 吸附开关与阈值

以下状态属于模板状态，应进入 Schema 和命令历史：

- 页面属性
- 元素属性
- 数据绑定
- 结构树变更
- 表格单元格结构变更

以下状态属于交互上下文状态，不进入 Schema，但可能进入工作台内存：

- 当前编辑会话状态（EditingSession: nodeId / selection / meta）
- 当前区段选择

这些状态可以持久化为用户偏好，但不能污染 Schema。

## 10.13 故障可见性

Designer 必须把问题直接呈现在画布或窗口中，而不是静默降级：

- 未知元素显示占位块
- 失效绑定显示异常提示
- 加载失败资源显示错误态
- 缺失编辑器显示只读占位
- 网络状态或自动保存异常通过状态栏反馈

原则是：错误应该显眼，但尽量不阻塞继续编辑。
