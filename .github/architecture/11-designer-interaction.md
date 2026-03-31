# 11. 设计器交互层

## 11.1 设计器组件结构

```
┌──────────────────────────────────────────────────────────────────┐
│  EasyInkDesigner                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ToolbarPanel（工具栏：元素类型 + 操作按钮 + 插件按钮）  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────┬────────────────────────────┬──────────────────┐   │
│  │Sidebar   │                            │  PropertyPanel   │   │
│  │ ┌──────┐ │                            │                  │   │
│  │ │页面  │ │                            │  ┌────────────┐  │   │
│  │ │设置  │ │       DesignCanvas         │  │ Schema 驱动│  │   │
│  │ ├──────┤ │                            │  │ 属性编辑器 │  │   │
│  │ │字段树│ │  ┌─────────────────────┐   │  │            │  │   │
│  │ ├──────┤ │  │  RulerH             │   │  │ [位置/尺寸]│  │   │
│  │ │图层树│ │  ├──┬──────────────────┤   │  │ [样式]     │  │   │
│  │ └──────┘ │  │R │                  │   │  │ [数据绑定] │  │   │
│  │          │  │u │   Page Canvas    │   │  │ [元素特有] │  │   │
│  │          │  │l │                  │   │  │            │  │   │
│  │          │  │e │                  │   │  └────────────┘  │   │
│  │          │  │r │                  │   │                  │   │
│  │          │  │V │                  │   │                  │   │
│  │          │  │  │                  │   │                  │   │
│  │          │  └──┴──────────────────┘   │                  │   │
│  └──────────┴────────────────────────────┴──────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  StatusBar（缩放、单位切换、标尺刻度）                │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## 11.2 交互特性

### 智能对齐线 + 吸附

```typescript
interface AlignmentGuide {
  /** 对齐类型 */
  type: 'edge' | 'center' | 'grid' | 'margin' | 'custom'
  /** 方向 */
  axis: 'horizontal' | 'vertical'
  /** 位置（页面坐标） */
  position: number
  /** 吸附阈值（像素） */
  snapThreshold: number  // 默认 5px
}

/**
 * 对齐引擎
 * - 拖拽/缩放时实时计算与其他元素的对齐关系
 * - 显示对齐参考线（类似 Figma）
 * - 吸附到最近的对齐线
 * - 支持 Grid 网格吸附
 */
```

### 多选 + 批量操作

- 框选（拖拽选择框）和 Shift+单击 追加选择
- 选中多个元素后显示统一的 bounding box
- 批量对齐：左对齐、右对齐、顶部对齐、底部对齐、水平居中、垂直居中
- 批量分布：水平等距、垂直等距
- 批量修改共有属性
- 组合/取消组合

### 自由旋转

- 元素选中后显示旋转手柄
- CSS `transform: rotate()` 实现视觉旋转
- 旋转后自动计算 bounding box 用于碰撞检测和对齐
- 按住 Shift 旋转时以 15 度为步进
- 旋转后的拖拽/缩放需要考虑变换矩阵

### 专业设计器特性

- **标尺**：顶部和左侧标尺，显示当前单位刻度，跟随缩放，鼠标悬停时在画布上显示预览辅助线
- **辅助线**：鼠标悬停标尺时显示半透明虚线预览，点击标尺固定辅助线，拖拽已固定辅助线可移动，拖回标尺区域删除（Figma 风格）
- **出血线/安全线**：打印场景的裁切标记
- **缩放**：Ctrl+滚轮缩放，适应页面、适应宽度等预设
- **平移**：Space+拖拽 或中键拖拽平移画布
- **键盘快捷键**：方向键微调位置（1单位）、Shift+方向键大步调整（10单位）
- **右键菜单**：层级调整、对齐、锁定、复制粘贴等
- **页边距/出血线可视化**：虚线显示页边距和出血区域

## 11.3 设计器画布预览策略

设计器画布**不填充实际运行时数据**，所有元素均以占位/静态方式预览。具体规则：

### 11.3.1 未绑定元素

直接显示元素 `props` 中的静态属性值。
例：text 显示 `content`，image 显示 `src` 对应的图片或空占位图。

### 11.3.2 已绑定数据源的元素

- 显示 `{{binding.path}}` 形式的占位符文本，如 `{{customerName}}`、`{{companyLogo}}`
- 视觉样式与静态文本**明确区分**：灰色虚线框/背景 + 不同文字颜色（如暗灰色占位文字 + 浅灰虚线边框）
- **静态值作为 fallback**：元素的 `props` 静态值在绑定后保留，运行时若数据源未填充则降级显示静态值；设计器中始终显示 `{{path}}` 占位符

> **绑定覆盖规则**：绑定是元素级别的单一绑定（`ElementNode.binding`），具体覆盖哪个 prop 由元素类型决定：text 覆盖 `content`，image 覆盖 `src`，barcode 覆盖 `value`。

### 11.3.3 数据表格（data-table）预览

- 显示**列标题行**（表头） + **N 行占位行**
- 占位行每个单元格显示该列的绑定路径占位符，如 `{{orderItems.itemName}}`
- 占位行数默认 **2 行**，可在设计器 UI 中调整（纯设计器本地设置，**不入 Schema**）
- 不填充实际数据，不显示真实行数

### 11.3.4 静态表格（table）预览

- 直接显示用户在设计时手动填写的单元格文本内容
- 支持画布上直接点击单元格进入编辑状态（类似 Excel/Word 表格体验）

## 11.4 属性面板 -- Schema 驱动

属性面板由元素类型定义中的 `propDefinitions` 自动生成：

```typescript
interface PropDefinition {
  /** 属性键名 */
  key: string
  /** 显示标签 */
  label: string
  /** 编辑器类型 */
  editor: string  // 'text' | 'number' | 'color' | 'select' | 'font' | 'switch' | 'custom' | 插件注册的编辑器
  /** 编辑器配置 */
  editorOptions?: Record<string, unknown>
  /** 默认值 */
  defaultValue?: unknown
  /** 分组 */
  group?: string
  /** 显示条件 */
  visible?: (props: Record<string, unknown>) => boolean
}

// 示例：条形码元素类型定义（从 @easyink/material-barcode/core 导出）
const barcodeDefinition: ElementTypeDefinition = {
  type: 'barcode',
  name: '条形码',
  icon: 'barcode-icon',
  propDefinitions: [
    { key: 'format', label: '编码格式', editor: 'select', group: '条形码',
      editorOptions: { options: ['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39'] } },
    { key: 'value', label: '内容', editor: 'text', group: '条形码' },
    { key: 'displayValue', label: '显示文字', editor: 'switch', defaultValue: true, group: '条形码' },
    { key: 'barWidth', label: '线条宽度', editor: 'number', group: '条形码',
      editorOptions: { min: 1, max: 5, step: 0.5 } },
  ],
  // ...
}
```

### 自定义编辑器（editor: 'custom'）

物料可通过 `editor: 'custom'` 在 propDefinitions 中注入自定义 Vue 组件，用于复杂属性 UI（如 data-table 的列管理、table 的单元格编辑）：

```typescript
// propDefinition 中使用 custom 编辑器
{
  key: 'columns',
  label: '列配置',
  editor: 'custom',  // 属性面板渲染物料注册的自定义组件
  group: '表格',
}

// 物料注册时提供编辑器组件映射
engine.useMaterial({
  definition: dataTableDefinition,
  renderer: dataTableRenderer,
  designerComponent: DataTableDesigner,
  behavior: dataTableBehavior,
  editors: {
    columns: ColumnManagerEditor,  // key 对应 propDefinition.key
  },
})

// 自定义编辑器组件 Props 签名
interface CustomEditorProps {
  modelValue: unknown           // 当前属性值
  element: ElementNode          // 当前元素节点
  definition: PropDefinition    // 属性定义
}
```

## 11.5 物料行为解释器

设计器框架内置**行为解释器（Behavior Interpreter）**，负责解释物料声明的 `DesignerBehavior` 配置并执行对应的交互逻辑。

> **定位**：行为原语适用于简单物料（text / image / barcode / rect / line 等），提供声明式入口开关。复杂物料（table / data-table / rich-text 等）的交互逻辑由其 designerComponent + 自定义 overlay + 事件合同完整自行实现，行为原语仅描述入口级行为。

### 解释器架构

```
物料声明 DesignerBehavior          设计器框架解释执行
   { doubleClick: 'inline-edit' }  ─────►  BehaviorInterpreter
                                            ├── InlineEditHandler
                                            ├── CellEditHandler
                                            ├── BindDefaultPropHandler
                                            ├── BindColumnHandler
                                            ├── ColumnResizeHandler
                                            └── TableRowColOpsHandler
```

### 工作流程

1. 物料注册时，`DesignerBehavior` 被存储在设计器的行为注册表中
2. 用户在画布上交互时（双击、拖入字段、选中、右键），设计器查询目标元素类型的行为声明
3. 行为解释器根据原语标识分发到对应的内置 Handler 执行
4. 若物料未声明某行为，使用框架默认处理（通常为 noop）
5. 复杂物料可绕过行为原语，在 designerComponent 内部直接处理所有交互事件

### 内置行为原语详细说明

| 原语 | 触发时机 | 行为描述 |
|------|----------|----------|
| `inline-edit` | 双击元素 | 在画布上进入行内文本编辑模式，完成后更新 props.content |
| `cell-edit` | 双击表格单元格 | 进入单元格文本编辑，完成后更新 cells 数据 |
| `bind-default-prop` | 数据源字段拖入元素 | 自动绑定到元素的默认属性（text->content, image->src, barcode->value） |
| `bind-column` | 数据源字段拖入 data-table | 添加或更新绑定列 |
| `column-resize` | 选中表格类元素 | 显示列宽调整手柄，拖拽时联动调整相邻列 |
| `table-row-col-ops` | 右键点击静态表格 | 在右键菜单中追加「插入行/列、删除行/列」操作项 |
| `noop` | 显式声明无操作 | 明确表示该交互不执行任何操作 |

## 11.6 交互状态机

### 混合状态管理

设计器采用**框架管高层、物料管内部**的混合状态管理模式：

```
┌────────────────────────────────────────────────────────────┐
│  框架管理的全局状态                                         │
│                                                            │
│  idle ──(单击元素)──► selected ──(enter-edit)──► editing   │
│   ▲                    ▲  │                       │        │
│   │                    │  │(click outside)        │        │
│   └────────────────────┘  │                       │        │
│   (ESC / click outside)   │(ESC)                  │        │
│                           └───────────────────────┘        │
├────────────────────────────────────────────────────────────┤
│  物料管理的内部子状态（editing 内部）                        │
│                                                            │
│  ┌─ Table 状态 ─────────────────────────────────────────┐  │
│  │  cell-selected ←→ cell-editing                       │  │
│  │  column-selected                                     │  │
│  │  row-selected                                        │  │
│  │  column-resizing                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌─ RichText 状态 ──────────────────────────────────────┐  │
│  │  inline-editing（Quill 接管焦点）                     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**职责划分**：

| 层级 | 管理者 | 状态 | 触发方式 |
|------|--------|------|----------|
| 全局 | 框架 | idle / selected / editing | 框架根据用户行为自动切换 |
| 内部 | 物料 | cell-editing / column-resizing / row-selected 等 | 物料 designerComponent 内部管理 |

**为什么框架不管内部子状态**：
- idle/selected 是所有元素共有的，放框架层避免重复
- editing 内的子状态完全是物料特有的（Table 的 cell-editing 与 Text 的 inline-editing 无关）
- 框架只需知道「该物料正在编辑」，不需关心具体子状态

### editing 状态的框架行为变化

当框架接收到物料的 `enter-edit` 事件后，自动禁用以下全局行为：

- 元素拖动（drag move）
- 元素缩放（resize handles）
- 元素旋转（rotate handle）
- 全局快捷键（Delete 删除元素、Ctrl+C 复制、Ctrl+V 粘贴等）
- 保留：点击外部区域取消选中（同时触发 `exit-edit`）

### 退出编辑

- **ESC**：一键退出到 unselected 状态（不做分层退出）
- **点击外部**：框架自动触发 `exit-edit` 通知物料，物料收到后提交未完成的编辑并清理状态

## 11.7 事件合同（Material Action Contract）

物料 designerComponent 与框架之间通过**单一通用事件**通信：

```typescript
// 物料 emit 事件
emit('material:action', { type: string, payload: unknown })
```

### 核心 Action 类型（封闭集合）

```typescript
/** 框架必须处理的核心 action 类型 */
type CoreMaterialAction =
  | { type: 'enter-edit' }
  | { type: 'exit-edit' }
  | { type: 'update-prop', payload: { key: string, value: unknown } }
  | { type: 'sub-select', payload: { area: string, index?: number, data?: unknown } }
  | { type: 'commit-change', payload: { description: string, changes: unknown } }

// 示例：Table 物料的 action 使用
emit('material:action', { type: 'enter-edit' })
emit('material:action', { type: 'sub-select', payload: { area: 'column', index: 2 } })
emit('material:action', { type: 'update-prop', payload: { key: 'columns[2].width', value: 30 } })
emit('material:action', { type: 'exit-edit' })
```

### 开放扩展

物料可 emit 自定义 action（框架忽略不识别的 action，但插件可以监听）：

```typescript
// 物料自定义 action（框架忽略，插件可监听）
emit('material:action', { type: 'custom:column-sort', payload: { column: 'name', direction: 'asc' } })
```

## 11.8 物料上下文 API（Material Context）

框架通过 Vue 的 provide/inject 向 designerComponent 和自定义 overlay 组件注入完整上下文：

### designerComponent Props

```typescript
/** 框架向 designerComponent 传递的 Props（精简） */
interface MaterialComponentProps {
  element: ElementNode         // 当前元素节点
  isSelected: boolean          // 是否被选中
  isEditing: boolean           // 是否处于编辑状态
  scale: number                // 当前画布缩放比
}
```

### 注入上下文

```typescript
/** 通过 provide/inject 注入的完整上下文 */
interface MaterialContext {
  /** 当前元素节点（reactive ref） */
  element: Ref<ElementNode>
  /** 是否选中 */
  isSelected: Ref<boolean>
  /** 是否编辑中 */
  isEditing: Ref<boolean>
  /** 画布缩放比 */
  scale: Ref<number>
  /** emit material:action 的快捷方法 */
  emitAction: (type: string, payload?: unknown) => void
  /** 属性面板控制器 */
  panelController: PropertyPanelController
  /** Command 管理器（用于 Undo/Redo） */
  commandManager: CommandManager
  /** Schema 引擎（用于读取/修改 Schema） */
  schemaEngine: SchemaEngine
}

// 物料 designerComponent 中使用
const ctx = useMaterialContext()
ctx.emitAction('enter-edit')
ctx.panelController.setActiveGroup('border')
ctx.commandManager.execute(new UpdateColumnWidthCommand(...))
```

### PropertyPanelController 接口

```typescript
interface PropertyPanelController {
  /** 激活指定属性分组 */
  setActiveGroup(groupName: string): void
  /** 设置子级选择上下文（如选中某列） */
  setSubSelection(data: unknown): void
  /** 清除子级选择 */
  clearSubSelection(): void
  /** 滚动到指定分组 */
  scrollToGroup(groupName: string): void
  /** 折叠所有分组 */
  collapseAll(): void
  /** 展开所有分组 */
  expandAll(): void
  /** 动态注册属性分组（物料可在运行时添加分组） */
  registerDynamicGroup(group: PropGroup): void
}
```

## 11.9 Overlay 分层架构

### 三层结构

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Framework SelectionOverlay（最上层）           │
│  - 缩放 handle（8 个角点/边中点）                        │
│  - 旋转 handle                                          │
│  - 选中边框                                             │
│  - pointer-events: 仅 handle 区域响应，其余 none         │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Material Overlay（物料自定义，元素边界内）      │
│  - 列宽拖拽 handle（列与列之间）                         │
│  - 单元格高亮                                           │
│  - 行/列选中指示器                                      │
│  - 跟随选中状态创建/销毁                                │
├─────────────────────────────────────────────────────────┤
│  Layer 1: designerComponent（最底层）                   │
│  - 表格/元素的实际渲染内容                               │
│  - 占位符显示                                           │
└─────────────────────────────────────────────────────────┘
```

### 事件穿透规则

1. **框架 SelectionOverlay** 在 handle 区域（缩放/旋转手柄）捕获事件，非 handle 区域设置 `pointer-events: none`
2. **物料 Overlay** 接收穿透的事件，在其交互区域（列宽 handle、单元格等）响应
3. **designerComponent** 接收未被上层拦截的事件

### 物料 Overlay 组件注册

物料在 `MaterialDesignerExport` 中提供自定义 overlay 组件：

```typescript
interface MaterialDesignerExport {
  designerComponent: Component
  behavior: DesignerBehavior
  editors?: Record<string, Component>
  /** 自定义 overlay 组件（选中时渲染，取消选中时销毁） */
  overlay?: Component
}
```

### Overlay 上下文

overlay 组件通过 `useOverlayContext()` 获取上下文信息：

```typescript
/** overlay 组件的注入上下文 */
interface OverlayContext extends MaterialContext {
  /** 元素在画布中的边界矩形 */
  bounds: Ref<DOMRect>
}

// 物料 overlay 组件中使用
const { element, scale, bounds, emitAction } = useOverlayContext()
```

### 多选行为

当多个元素被选中时，所有物料的自定义 overlay **隐藏**，仅显示框架的多选 bounding box + 对齐/分布操作。

### Overlay 生命周期

- **创建**：元素被单选时创建 overlay 组件实例
- **销毁**：元素取消选中（包括多选、ESC、点击外部）时销毁
- 不使用 v-show 常驻，避免不必要的组件实例

## 11.10 键盘事件路由

框架全局监听所有键盘事件，根据当前交互状态决定路由：

```
┌────────────────────────────────────┐
│  全局键盘事件                       │
│                                    │
│  状态 = idle?                      │
│    → 框架处理（如 Ctrl+Z 撤销）     │
│                                    │
│  状态 = selected?                  │
│    → 框架处理（Delete 删除元素、    │
│       方向键移动、Ctrl+C 复制等）   │
│                                    │
│  状态 = editing?                   │
│    → 转发给物料 designerComponent   │
│    → Delete/Backspace 不删除元素    │
│    → Tab/Enter/方向键由物料决定     │
│    → ESC 退出编辑（框架处理）       │
│    → Ctrl+Z 仍由框架处理 Undo      │
└────────────────────────────────────┘
```

### editing 状态下的快捷键规则

| 按键 | 处理者 | 行为 |
|------|--------|------|
| ESC | 框架 | 退出编辑，回到 unselected |
| Ctrl+Z / Ctrl+Y | 框架 | Undo / Redo（始终由框架处理） |
| Delete / Backspace | 物料 | 交给物料处理（如删除单元格内容） |
| Tab | 物料 | 交给物料处理（如在单元格间跳转） |
| Enter | 物料 | 交给物料处理（如确认编辑、换行） |
| 方向键 | 物料 | 交给物料处理（如在单元格间导航） |
| 其他输入键 | 物料 | 交给物料处理 |

## 11.11 复杂物料交互参考：Table

以下展示 Table（静态表格）物料如何利用上述架构实现完整交互：

### 交互矩阵

| 操作 | 触发 | 处理者 | 行为 |
|------|------|--------|------|
| 单击表头单元格 | 点击 | designerComponent | 选中该列，emit sub-select |
| 单击数据单元格 | 点击 | designerComponent | 选中该单元格，emit sub-select |
| 单击行侧边 | 点击 | designerComponent | 选中该行，emit sub-select |
| 双击表头单元格 | 双击 | designerComponent | 进入表头文字编辑（contenteditable），emit enter-edit |
| 双击数据单元格 | 双击 | designerComponent | 进入单元格文字编辑（contenteditable），emit enter-edit |
| 拖拽列宽 handle | 拖拽 | overlay 组件 | 视觉更新列宽，mouseup 时 emit commit-change |
| 右键 | 右键 | designerComponent | 显示行列增删菜单 |
| Shift+点击 | 点击 | designerComponent | 多选行/列/单元格 |
| 选中列 -> 属性面板 | sub-select | 框架 | panelController.setActiveGroup 展开列属性 |

### Undo 策略

- 列宽拖拽：拖拽过程仅更新视觉，mouseup 时提交一个 `UpdateColumnWidthCommand`
- 单元格编辑：blur 或 Enter 确认时提交一个 `UpdateCellContentCommand`
- 行列增删：每次操作提交一个 `InsertRow` / `DeleteColumn` 等 Command

### Border 数据结构

```typescript
interface TableBorderConfig {
  /** 是否启用边框 */
  enabled: boolean
  /** 边框线型 */
  style: 'solid' | 'dashed' | 'dotted'
  /** 边框颜色 */
  color: string
  /** 边框宽度 */
  width: number
}

interface TableProps {
  columns: StaticTableColumn[]
  rowCount: number
  cells: StaticTableCell[]
  /** 全局 border 配置 */
  border?: TableBorderConfig
  /** 行级 border 覆盖（稀疏，index 为行号） */
  rowBorders?: Record<number, Partial<TableBorderConfig>>
  /** 列级 border 覆盖（稀疏，index 为列号） */
  columnBorders?: Record<number, Partial<TableBorderConfig>>
}
```

**覆盖优先级**：列级 > 行级 > 全局。未设置的属性 fallback 到上一级。
