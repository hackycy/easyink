# 10. 设计器交互层

EasyInk 的 Designer 需要按“顶层双栏 + 画布内窗口系统 + 状态栏”的方式建模，而不是按固定三栏工作台建模。第一轮文档已经确立了这个方向，第二轮修订要把它落到真实交互对象和状态协议上。

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
- 模板库不是窗口之一，而是覆盖式 overlay
- 属性窗口、结构树、历史、动画并不要求固定停在某一边
- 状态栏是独立层，不应和动画/历史混为同一抽屉

## 10.2 顶层双栏

### 第一层：外部插槽（Slot）

第一层顶部栏不再由框架内置，而是通过 `EasyInkDesigner` 的 `#topbar` 插槽暴露给外部用户。外部用户可自行填充：

- 品牌 Logo
- 保存、预览、模板库等全局动作
- 任意自定义内容

框架不再内置 Logo、物料入口、保存/预览按钮。外部用户通过 `useDesignerStore()` 访问 store 来操作工作台状态（如打开模板库、触发预览等）。

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
	preview: PreviewWorkbenchState
	templateLibrary: TemplateLibraryState
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

当前 EasyInk 仓库的页面属性实现仍是 `width / height / mode` 最小版。这个差距说明我们缺的不是若干控件，而是页面属性协议和兼容映射层本身。

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

## 10.6 模板库 overlay

模板库应作为覆盖式工作台能力处理。

它至少包括：

- 标题区
- 帮助入口
- 搜索框
- 模板卡片矩阵
- 分页器
- 关闭动作

它不应该被塞进普通 `WorkspaceWindow`，因为：

- 它覆盖范围更大
- 它与画布交互层不同级
- 它会拦截顶栏和画布的输入焦点

### 10.6.1 模板库交互流

模板库至少需要支持以下工作流：

1. 用户从第一层顶栏点击模板库入口。
2. 工作台进入 overlay opening。
3. 模板列表请求开始，overlay 进入 loading。
4. 请求成功后进入 list-ready，允许搜索、翻页、选择模板。
5. 用户选择模板后进入 selecting-template。
6. 工作台拉取模板内容并替换当前文档。
7. overlay 关闭，画布、结构树、属性面板、状态栏同步刷新。

如果当前环境处于静态示例模式，则搜索和翻页不是静默失效，而是：

1. 用户执行搜索或翻页。
2. overlay 进入 `backend-capability-check`。
3. 工作台弹出显式提示。
4. 用户确认后回到 `list-ready`，但列表内容不发生变化。

### 10.6.2 模板库状态机

```typescript
interface TemplateLibraryState {
	phase:
		| 'closed'
		| 'opening'
		| 'loading-list'
		| 'list-ready'
		| 'static-demo-warning'
		| 'selecting-template'
		| 'loading-template'
		| 'closing'
	query: string
	page: number
	pageSize: number
	backendMode: 'static-demo' | 'remote'
	selectedTemplateId?: string
}
```

边界要求：

- `query/page/pageSize` 属于工作台状态，不进入模板 Schema
- `selectedTemplateId` 只在 overlay 流程内短暂存在
- 模板加载成功后，真正进入命令历史的是新模板文档，而不是 overlay 过程本身

## 10.7 深度编辑（Deep Editing）

深度编辑不是表格专属能力。所有复杂物料（table/chart/container/relation）通过同一套扩展协议进入深度编辑模式。

### 10.7.1 统一深度编辑协议

Designer 提供基础状态机，包含三个顶层阶段：`idle`、`selected`、`deep-editing`。

当物料在其 extension 中声明 `deepEditing` 时，进入 `deep-editing` 阶段后控制权委托给物料自身的 FSM：

```
idle --click element--> selected
selected --trigger deep edit--> deep-editing (delegate to material FSM)
deep-editing --click outside / exit--> idle
```

职责划分：

**Designer 管理：**
- 选区边框（selection box）
- element 级 resize handle
- 对齐辅助线
- 拖拽移动（drag movement）
- deep-editing 的进入/退出生命周期
- overlay 容器和 toolbar 容器的 DOM 分配

**物料 FSM 管理：**
- 内容渲染（content rendering）
- overlay 渲染（自行挂载到 Designer 提供的 overlay DOM 容器）
- toolbar 渲染（自行挂载到 Designer 提供的 toolbar DOM 容器）
- 内部 resize handle（如列/行边线手柄）
- 子选中（sub-selection，如单元格选中）
- 键盘路由（进入 deep-editing 后键盘事件先经过物料 FSM）

进入 deep-editing 时：
- element 级 8 个 resize handle 和 rotate handle 隐藏
- 外部拖拽把手保持显示，用于移动元素
- overlay DOM 通过 teleport 挂载到页面级专用 overlay 容器，绝对定位基于元素在页面上的位置计算
- 提升元素 z-index，确保 overlay 不被其他元素遮挡
- 同一时刻只有一个元素可进入 deep-editing
- 多选元素状态与 deep-editing 互斥：进入前必须先取消多选

### 10.7.2 深度编辑运行时状态

```typescript
interface DeepEditingState {
	nodeId: string
	materialType: string
	currentPhase: string
	materialState: unknown  // 不透明状态，由物料 FSM 自行管理
}
```

注意：Schema 不感知 FSM -- 此状态纯粹属于运行时/交互上下文，不进入 Schema 也不进入命令历史。

### 10.7.3 示例：表格物料的 FSM 实现

> 以下是表格物料内部的阶段定义，属于物料自身的 FSM，不是 Designer 级协议。其他复杂物料（chart/container/relation）各自定义自己的内部阶段。

表格物料声明三个内部阶段：

**`table-selected`：**
- 显示表格级属性，element resize handle 可见
- 尚未进入 deep-editing（仍在 Designer 的 `selected` 阶段）
- overlay 仅渲染微妙的虚线边框指示器（无 grid lines、无 resize handles），表明已进入深度编辑
- 点击任意单元格区域触发转换到 `cell-selected`

**`cell-selected`：**
- 进入 deep-editing
- overlay 由两层构成：
  - **透明点击捕获层**：覆盖整个表格区域，负责路由对其他单元格的点击事件，无视觉效果
  - **单元格 overlay**：仅覆盖被选中的单元格区域，包含蓝色高亮边框+背景、该单元格右列边和下行边的 resize 手柄（手柄长度仅等于单元格宽/高）
- resize 手柄在拖拽过程中命令式同步更新位置和尺寸（overlay 容器、高亮区、手柄位置在 pointermove 回调中实时更新）
- element 级 handle 隐藏
- 浮动工具条挂载到 toolbar 容器（固定在表格上方，不随单元格移动）
- 属性面板在表格级属性基础上动态追加格子级属性分组

**`content-editing`：**
- onEnter 在单元格位置创建原生 input overlay 进行原位文本编辑
- 同样使用透明点击捕获层 + 单元格高亮（无 resize 手柄）
- 属性面板仍保持表格壳层

阶段转换：

```
table-selected --click cell--> cell-selected
cell-selected --double-click cell--> content-editing
cell-selected --Esc--> table-selected
content-editing --Esc--> cell-selected
任意阶段 --click outside table--> Designer 退出 deep-editing（回到 idle）
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
- 下半段根据 `DeepEditingState.currentPhase` 动态追加格子背景、格子操作、格子内容等局部属性组
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
- 编辑完成后通过 `UpdateTableCellCommand` 写入 cell 的 content
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

表格采用表级主数据源 + cell 继承绑定模型。

1. 从数据源树拖拽字段到表格上方。
2. 如果表格尚无 `table.source`，首次拖入自动设置 `table.source`（sourceId + fieldPath 指向该字段所属集合）。
3. 如果字段不属于当前 `table.source.sourceId`，拒绝拖入并显示提示。
4. 当前悬停的单元格显示 drop zone 高亮，并指示类型兼容性。
5. 松手后生成该单元格的 `BindingRef`，sourceId 自动从 `table.source` 填充，用户只需关心字段名。
6. repeat-template 行内 cell 使用相对路径（相对于集合项），header/footer/normal 行内 cell 使用绝对路径。
7. 解除 table.source 时，CompositeCommand 原子清除所有 cell binding，支持整体 undo。

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

部分物料支持双击进入内容编辑态（物料 extension 声明 `deepEditing` 能力）：

- 文本：双击进入富文本编辑
- 表格：先进入格子态，再由格子内内容触发原位编辑（与 10.7 表格深度编辑衔接）

编辑态下，交互层（手柄、选区边框）退到背景或隐藏，聚焦在内容操作上。

## 10.10 设计器与 Viewer 的全量预览

全量预览由 iframe Viewer 承担，与画布设计态渲染是两套独立能力。

预览流程：

1. Designer 把当前 Schema 和调试数据发送给 Viewer。
2. Viewer 完成真实分页、字体加载和导出能力准备。
3. Designer 接收预览结果、缩略图和诊断。

交互上要注意：

- 预览入口位于顶层第一栏
- 预览是工作台级动作，不是元素级动作
- 预览后返回编辑态时应保持窗口布局和工作台状态

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
- 模板库开关与筛选
- 预览浮层开关

以下状态属于模板状态，应进入 Schema 和命令历史：

- 页面属性
- 元素属性
- 数据绑定
- 结构树变更
- 表格单元格结构变更

以下状态属于交互上下文状态，不进入 Schema，但可能进入工作台内存：

- 当前深度编辑阶段（DeepEditingState）
- 当前区段选择
- 物料 FSM 内部状态（materialState）
- 模板库搜索关键字和页码

这些状态可以持久化为用户偏好，但不能污染 Schema。

## 10.13 故障可见性

Designer 必须把问题直接呈现在画布或窗口中，而不是静默降级：

- 未知元素显示占位块
- 失效绑定显示异常提示
- 加载失败资源显示错误态
- 缺失编辑器显示只读占位
- 网络状态或自动保存异常通过状态栏反馈

原则是：错误应该显眼，但尽量不阻塞继续编辑。
