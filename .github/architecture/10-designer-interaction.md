# 10. 设计器交互层

EasyInk 的 Designer 需要按“顶层双栏 + 画布内窗口系统 + 状态栏”的方式建模，而不是按固定三栏工作台建模。第一轮文档已经确立了这个方向，第二轮修订要把它落到真实交互对象和状态协议上。

## 10.1 工作台骨架

默认工作台应接近如下结构：

```
┌──────────────────────────────────────────────────────────────────────┐
│ Top Bar A: Logo + Quick Materials + Grouped Materials + Save/Preview │
├──────────────────────────────────────────────────────────────────────┤
│ Top Bar B: Toolbar Manager + Configurable Toolbar Groups + Zoom      │
├──────────────────────────────────────────────────────────────────────┤
│ Canvas Workspace                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Ruler / Guides / Region Navigator / Page Canvas               │  │
│  │                                                                │  │
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
- 模板库不是窗口之一，而是覆盖式 overlay
- 属性窗口、结构树、历史、动画并不要求固定停在某一边
- 状态栏是独立层，不应和动画/历史混为同一抽屉

## 10.2 顶层双栏

### 第一层：工作台主导航 + 物料入口

第一层顶部栏同时承担四类职责：

- 品牌和工作台身份
- 高频物料直达入口
- 大类物料分组入口
- 保存、预览、模板库、更多等全局动作

其中物料入口是混合模型：

- 高频物料直接显示：直线、矩形、圆、文本、图片、二维码、条形码
- 复杂类别以下拉分组显示：数据、图表、SVG、关系图

这意味着 `MaterialBar` 需要拆为两部分：

- `QuickMaterialStrip`
- `GroupedMaterialMenu`

### 第二层：可配置工具组带

第二层不是静态按钮行，而是“可配置工具组带”。

实测表明它具备：

- 工具栏管理器入口
- 工具组对齐方式：居左、居中、居右
- 每个工具组可独立隐藏
- 每个工具组前的分割线可独立隐藏
- 可恢复默认编排
- 工具组本身支持横向滚动

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

数据源、概览图、属性、结构树、历史、动画、图片库、调试、暂存等都应作为 `WorkspaceWindow` 处理。

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

对票据、表格区段和多编辑区模板，画布上方需要有显式 `RegionNavigator`：

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

属性窗口不是“某种选中态就整个切换内容”，而是同一壳层中同时承载：

- 当前元素属性
- 当前页面属性

行为约束：

- 空白选中时，只显示页面属性区
- 元素选中时，优先显示元素属性区，再显示页面属性区
- 页面属性永远不进入元素撤销栈，元素属性永远不污染工作台状态

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

## 10.7 表格深度编辑

表格交互不能按“选中一个元素”处理。对标产品已经证明它是层级式编辑流。

### 10.7.1 表格交互流

1. 页面空白处选中时，属性面板显示页面属性。
2. 用户选中表格后，进入 table-selected，属性面板切到表格级属性。
3. 用户继续点入格子后，进入 cell-selected。
4. 画布出现格子级操作 affordance 和浮动工具条。
5. 属性面板在保留表格级属性的同时，追加格子级属性分组。
6. 用户可继续切换到标题、数据、合计、留白等区段上下文。
7. 用户点击空白处或切换其他节点后，退出格子深度编辑态。

### 10.7.2 表格状态机

```typescript
interface TableEditingState {
	phase: 'idle' | 'table-selected' | 'band-selected' | 'cell-selected'
	tableId?: string
	band?: 'header' | 'title' | 'data' | 'summary' | 'footer' | 'blank'
	cellPath?: {
		row: number
		col: number
	}
}
```

实现约束：

- `table-selected` 显示表格壳层属性和结构属性
- `band-selected` 用于标题、数据、合计、留白等逻辑区段
- `cell-selected` 才允许出现分裂、合并、局部边框、内容位置、格子内边距等操作
- `cellPath` 不能等价成普通元素 id，因为它依赖表格内部拓扑

### 10.7.3 格子态 affordance

进入 `cell-selected` 后，Designer 至少需要提供：

- 绑定字段拖拽句柄
- 删除当前绑定字段动作
- 格子宽度拖拽
- 格子高度拖拽
- 表格浮动工具条

表格浮动工具条至少要覆盖：

- 添加/删除行列
- 拆分单元格
- 合并单元格
- 单边边框显隐
- 内容水平/垂直对齐

### 10.7.4 属性壳层行为

格子态下属性面板不应切换成“另一个单元格编辑器页面”，而应保持同一壳层：

- 上半段仍是表格级属性
- 下半段追加格子背景、格子尺寸、格子操作、格子内容、内容位置、内边距等局部属性

这是同一属性壳层里的上下文递进，不是两个面板。

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

1. 拖拽集合字段到 `table-data`。
2. 指定主数据源和数据区。
3. 单元格再绑定相对字段或聚合规则。

## 10.9 设计器与 Viewer 的预览关系

设计器预览仍由 iframe Viewer 承担，而不是在画布 DOM 上直接拼结果。

预览流程：

1. Designer 把当前 Schema 和调试数据发送给 Viewer。
2. Viewer 完成真实分页、字体加载和导出能力准备。
3. Designer 接收预览结果、缩略图和诊断。

交互上要注意：

- 预览入口位于顶层第一栏
- 预览是工作台级动作，不是元素级动作
- 预览后返回编辑态时应保持窗口布局和工作台状态

## 10.10 状态栏

状态栏应作为独立工作台层存在，至少承载：

- 画布焦点状态
- 网络请求状态
- 暂存状态
- 自动保存状态

状态栏必须允许显示成功和失败两种状态，而不是只有“正在保存”。对标产品里已经能看到自动保存失败提示，这意味着 EasyInk 也要把失败视作一级反馈对象。

## 10.11 工作台状态边界

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

- 当前表格编辑阶段
- 当前区段选择
- 当前格子坐标
- 模板库搜索关键字和页码

这些状态可以持久化为用户偏好，但不能污染 Schema。

## 10.12 故障可见性

Designer 必须把问题直接呈现在画布或窗口中，而不是静默降级：

- 未知元素显示占位块
- 失效绑定显示异常提示
- 加载失败资源显示错误态
- 缺失编辑器显示只读占位
- 网络状态或自动保存异常通过状态栏反馈

原则是：错误应该显眼，但尽量不阻塞继续编辑。
