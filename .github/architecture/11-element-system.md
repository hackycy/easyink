# 11. 物料体系

## 11.1 概述

EasyInk 采用「物料（Material）」作为核心概念，取代传统的「元素」。物料是可注册、可扩展的画布构件单元，每种物料拥有：

- **通用属性**：类型、位置（x/y）、尺寸（宽/高）、透明度、旋转角度等
- **专有属性**：通过 Schema 驱动的属性定义（PropSchema）声明，自动生成属性面板
- **交互策略**：每种物料在设计器中可注册独立的 InteractionStrategy，定义画布内的特定交互行为
- **渲染函数**：由 renderer/designer 包提供，core 层不包含

物料面板位于顶部工具栏区域，以卡片网格形式展示已注册的物料，支持从面板拖拽进画布。

## 11.2 物料类型定义（Core 层）

> **设计决策**：`@easyink/core` 是框架无关的 headless 层，仅提供 `MaterialTypeDefinition` 接口定义、`PropSchema` 类型和 `MaterialRegistry` 注册中心，**不包含任何内置物料定义**。内置物料定义在各自的独立包中（如 `@easyink/material-text`）。`icon` 为 Iconify 图标名称字符串。渲染函数由 `@easyink/renderer` 侧的物料包子路径 `/render` 提供。交互策略由物料包子路径 `/designer` 提供，注册到 `@easyink/designer` 的 `InteractionStrategyRegistry`。

> **v1 补充边界**：`isContainer` 和 `children` 目前仅为未来受控容器预留。v1 不正式支持通用容器物料，也不承诺任意嵌套后的坐标系、交互和布局行为。

```typescript
interface MaterialTypeDefinition {
  /** 物料类型标识（全局唯一） */
  type: string
  /** 显示名称 */
  name: string
  /** 图标（Iconify 图标名称，如 'lucide:type'、'lucide:image'） */
  icon: string
  /**
   * 物料分类（用于物料面板分组展示）
   * 支持自定义分类字符串，面板自动按 category 分组
   */
  category?: string
  /**
   * 属性 Schema 定义（驱动属性面板自动生成）
   * 采用受 JSON Schema 启发的自定义规范
   */
  propSchemas: PropSchema[]
  /** 默认属性值 */
  defaultProps: Record<string, unknown>
  /** 默认布局 */
  defaultLayout: Partial<MaterialLayout>
  /** 默认样式 */
  defaultStyle?: Partial<MaterialStyle>
  /** 该物料类型是否支持子元素 */
  isContainer?: boolean
}

/**
 * 渲染函数由 renderer/designer 包提供，core 不定义
 * renderer 包可扩展为：
 *
 * type MaterialRenderFunction = (
 *   node: MaterialNode,
 *   context: MaterialRenderContext,
 * ) => HTMLElement | string
 */
```

## 11.3 属性 Schema 定义（PropSchema）

> **设计决策**：采用受 JSON Schema 启发的自定义轻量规范，聚焦属性编辑器渲染、嵌套结构和字段联动，不引入外部校验库，也不承载异步校验、草稿和提交态。

> **合同定位补充**：`PropSchema` 是内部代码契约，不是远程可序列化的公共表单协议。`visible`、`disabled`、`onChange` 等函数能力默认依赖本地物料定义代码，短期不提供第三方稳定兼容承诺。

```typescript
/**
 * 属性 Schema -- 驱动动态表单的声明式描述
 *
 * 受 JSON Schema 启发但更轻量，专为属性面板场景设计。
 * 支持类型约束、枚举、范围、嵌套对象/数组、条件显隐和属性联动。
 */
interface PropSchema {
  /** 属性键名（支持点路径访问嵌套，如 'header.height'） */
  key: string
  /** 显示标签 */
  label: string
  /**
   * 属性值类型
   * 决定属性面板使用哪种编辑器组件
   */
  type: PropSchemaType
  /** 默认值 */
  default?: unknown
  /** 分组名称（属性面板按分组折叠显示） */
  group?: string
  /** 属性描述（tooltip 提示） */
  description?: string

  // ─── 类型约束 ───

  /** 枚举选项（type 为 'string' 或 'number' 时有效） */
  enum?: Array<{ label: string, value: unknown }>
  /** 数值最小值 */
  min?: number
  /** 数值最大值 */
  max?: number
  /** 数值步进 */
  step?: number
  /** 字符串最大长度 */
  maxLength?: number
  /** 字符串匹配模式 */
  pattern?: string

  // ─── 嵌套结构 ───

  /**
   * 子属性 Schema（type 为 'object' 时有效）
   * 渲染为嵌套的属性编辑表单
   */
  properties?: PropSchema[]
  /**
   * 数组项 Schema（type 为 'array' 时有效）
   * 渲染为可增删排序的列表编辑器
   */
  items?: PropSchema

  // ─── 条件与联动 ───

  /**
   * 显示条件 -- 根据当前物料的 props 决定是否显示该编辑器
   * @param props - 当前物料的 props
   * @returns true 时显示
   */
  visible?: (props: Record<string, unknown>) => boolean
  /**
   * 是否禁用（只读）
   * @param props - 当前物料的 props
   * @returns true 时禁用
   */
  disabled?: (props: Record<string, unknown>) => boolean
  /**
   * 值变更时的联动处理
   * 返回需要同步更新的其他属性键值对
   */
  onChange?: (value: unknown, props: Record<string, unknown>) => Record<string, unknown> | void

  // ─── 自定义编辑器 ───

  /**
   * 自定义编辑器名称（覆盖 type 推断的默认编辑器）
   * 由插件通过 ctx.editors.register() 注册
   */
  editor?: string
  /** 自定义编辑器配置（传递给编辑器组件的 props） */
  editorOptions?: Record<string, unknown>
}

/**
 * 属性值类型 -- 决定默认编辑器组件
 */
type PropSchemaType =
  | 'string'    // → TextInput
  | 'number'    // → NumberInput
  | 'boolean'   // → Switch
  | 'color'     // → ColorPicker
  | 'select'    // → Select（需配合 enum）
  | 'font'      // → FontSelector
  | 'object'    // → 嵌套表单（需配合 properties）
  | 'array'     // → 列表编辑器（需配合 items）
  | 'custom'    // → 使用 editor 字段指定的自定义编辑器
```

### PropSchema 编辑器映射规则

| type | 默认编辑器 | 有 enum 时 | 说明 |
|------|-----------|-----------|------|
| `string` | TextInput | Select | 无 enum 渲染文本输入框，有 enum 渲染下拉选择 |
| `number` | NumberInput | Select | 支持 min/max/step |
| `boolean` | Switch | - | 开关切换 |
| `color` | ColorPicker | - | 颜色选择器 |
| `select` | Select | 必须有 enum | 下拉选择 |
| `font` | FontSelector | - | 字体选择器（集成 FontManager） |
| `object` | 嵌套 PropSchema 表单 | - | 递归渲染 properties |
| `array` | 列表编辑器 | - | 可增删排序的项列表，每项按 items schema 渲染 |
| `custom` | 由 editor 字段指定 | - | 插件注册的自定义编辑器组件 |

### PropSchema 输入与退化策略

- 文本和数值类控件允许在编辑器内部保留临时草稿值，失焦时再做规范化写入。
- 数组排序、颜色拖拽、连续步进等手势在命令栈中按“一次手势一个命令”合并。
- `custom` 编辑器缺失时显示只读占位，不自动回退到默认编辑器。

### PropSchema 示例

```typescript
// 条形码物料属性 Schema
const barcodePropSchemas: PropSchema[] = [
  {
    key: 'format',
    label: '编码格式',
    type: 'select',
    group: '条形码',
    enum: [
      { label: 'CODE128', value: 'CODE128' },
      { label: 'EAN-13', value: 'EAN13' },
      { label: 'QR Code', value: 'QR' },
    ],
    default: 'CODE128',
  },
  {
    key: 'value',
    label: '内容',
    type: 'string',
    group: '条形码',
  },
  {
    key: 'displayValue',
    label: '显示文字',
    type: 'boolean',
    group: '条形码',
    default: true,
  },
  {
    key: 'barWidth',
    label: '线条宽度',
    type: 'number',
    group: '条形码',
    min: 1,
    max: 5,
    step: 0.5,
  },
  {
    key: 'errorCorrectionLevel',
    label: '纠错级别',
    type: 'select',
    group: '条形码',
    enum: [
      { label: '低 (7%)', value: 'L' },
      { label: '中 (15%)', value: 'M' },
      { label: '较高 (25%)', value: 'Q' },
      { label: '高 (30%)', value: 'H' },
    ],
    default: 'M',
    visible: (props) => props.format === 'QR',
  },
]
```

## 11.4 物料注册中心

```typescript
/**
 * 物料类型注册中心 -- 管理所有物料类型定义
 *
 * 支持内置物料和插件扩展物料。同名注册时后者覆盖前者。
 */
class MaterialRegistry {
  /** 注册物料类型定义 */
  register(definition: MaterialTypeDefinition): void
  /** 批量注册 */
  registerAll(definitions: MaterialTypeDefinition[]): void
  /** 注销 */
  unregister(type: string): boolean
  /** 获取 */
  get(type: string): MaterialTypeDefinition | undefined
  /** 检查是否已注册 */
  has(type: string): boolean
  /** 获取所有已注册物料 */
  list(): MaterialTypeDefinition[]
  /** 按分类获取 */
  listByCategory(): Map<string, MaterialTypeDefinition[]>
  /** 获取所有分类名 */
  categories(): string[]
  /** 清空 */
  clear(): void
}
```

## 11.4.1 未识别物料的保留策略

- 旧模板中若存在当前 `MaterialRegistry` 未注册的 `material.type`，Schema 加载不应直接丢弃该节点。
- 设计器中使用 unknown material 占位块展示其位置和尺寸，并限制为只读状态。
- 导入后重新导出 Schema 时，应尽量原样保留该节点的原始数据，等待后续补装物料包或迁移。

## 11.5 交互策略（Designer 层）

> **设计决策**：交互策略由 `@easyink/designer` 独立注册，core 层不感知设计器交互。策略采用两级状态机模型：`selected` 级（选中显示物料浮层）和 `editing` 级（双击进入深度编辑）。

```typescript
/**
 * 交互策略接口 -- 每种物料可注册独立的交互行为
 *
 * 生命周期：
 * - 物料被选中时 → activate(node, context) 进入 selected 级
 * - 双击物料时 → enterEditing(node, context) 进入 editing 级
 * - 点击物料外部时 → exitEditing() 退出编辑级，回到 selected 级
 * - 物料取消选中时 → deactivate() 完全退出
 */
interface InteractionStrategy {
  /** 策略标识（对应物料 type） */
  type: string

  /**
   * 激活策略（物料被选中时调用）
   * 进入 selected 级，可在此阶段渲染物料专属浮层（如表格列宽手柄）
   */
  activate(node: MaterialNode, context: InteractionContext): void

  /**
   * 停用策略（物料取消选中时调用）
   * 清理所有状态和 DOM
   */
  deactivate(): void

  /**
   * 进入编辑级（双击物料时调用）
   * 如：文本进入行内编辑、表格进入单元格编辑
   * 返回 false 表示该物料不支持编辑级
   */
  enterEditing?(node: MaterialNode, context: InteractionContext): boolean | void

  /**
   * 退出编辑级（点击物料外部时调用）
   * 回到 selected 级
   */
  exitEditing?(): void

  /**
   * 处理画布事件（在策略激活期间拦截的事件）
   * 返回 true 阻止事件继续冒泡
   */
  handleEvent?(event: CanvasEvent): boolean

  /**
   * 渲染物料专属交互图层
   * 返回 VNode 或 null，在通用 SelectionOverlay 之上渲染
   * selected 和 editing 两级可渲染不同内容
   */
  renderOverlay?(state: 'selected' | 'editing'): VNode | null
}

/**
 * 交互上下文 -- 提供策略所需的画布和物料操作能力
 */
interface InteractionContext {
  /** 当前物料节点 */
  node: MaterialNode
  /** Schema 操作 */
  schema: SchemaOperations
  /** 命令执行（支持 undo/redo） */
  commands: CommandExecutor
  /** 画布信息（缩放、滚动、坐标转换） */
  canvas: CanvasInfo
  /** 通用 Overlay 控制 */
  overlay: OverlayControl
  /** 国际化 */
  locale: LocaleContext
}

/**
 * 画布事件 -- 统一的交互事件封装
 */
interface CanvasEvent {
  /** 事件类型 */
  type: 'click' | 'dblclick' | 'mousedown' | 'mousemove' | 'mouseup'
    | 'dragover' | 'dragenter' | 'dragleave' | 'drop' | 'keydown' | 'keyup'
  /** 原生事件 */
  nativeEvent: Event
  /** 画布坐标（已转换缩放和滚动） */
  canvasX: number
  canvasY: number
  /** 目标物料节点 */
  target?: MaterialNode
}
```

### 交互策略注册

```typescript
/**
 * InteractionStrategyRegistry -- Designer 层管理交互策略
 */
class InteractionStrategyRegistry {
  /** 注册物料交互策略 */
  register(strategy: InteractionStrategy): void
  /** 获取指定物料类型的交互策略 */
  get(type: string): InteractionStrategy | undefined
  /** 默认策略（无专属策略时使用，只支持通用的移动/缩放） */
  readonly defaultStrategy: InteractionStrategy
}
```

## 11.6 物料面板与拖拽

### 物料面板

物料面板位于顶部区域（与工具栏并列），以卡片网格形式展示已注册的物料：

- 按 `category` 自动分组显示
- 每个物料卡片展示 Iconify 图标 + 物料名称
- 支持从卡片拖拽出画布
- 拖拽时显示 ghost 预览（半透明卡片跟随鼠标）

### 拖拽进画布

采用浏览器原生 HTML5 Drag & Drop API 实现：

```typescript
/**
 * 物料拖拽进画布的定位策略（智能定位）
 *
 * 1. 所有物料都以鼠标释放点作为基础坐标
 * 2. 释放时自动吸附到最近的参考线/网格
 * 3. 拖拽进入画布区域时显示虚线定位框 + 吸附线
 */
```

## 11.7 数据源绑定交互

数据源字段绑定作为一种独立的交互图层覆盖在物料之上：

```typescript
/**
 * 数据源绑定图层
 *
 * 当数据源字段被绑定到物料后：
 * - 物料上方显示绑定标签（如 "{{customerName}}"），样式为灰色标签
 * - 绑定标签遮盖物料内容区域，物料处于「绑定模式」
 * - 绑定模式下双击不会进入行内编辑（需先删除绑定）
 * - 绑定标签提供删除按钮，点击后移除绑定，恢复物料原有 static content
 *
 * 绑定交互流程：
 * 1. 用户从 DataSourcePanel 拖拽字段到物料上
 * 2. 物料识别 drop 事件，设置 binding.path = field.fullPath || field.key
 * 3. 物料进入绑定模式，显示绑定标签
 * 4. 再次拖入新字段 → 替换 binding.path（静态 content 保留，但运行时不作为绑定缺失时的 fallback）
 * 5. 删除绑定 → 移除 binding，恢复显示静态 content
 *
 * data-table 列绑定：
 * - 拖拽字段到交互行的某个单元格 → 设置该列的 binding.path
 * - 同源约束实时校验
 */
```

## 11.8 内置物料类型

> **注意**：以下每种内置物料均为独立的 npm 包（`@easyink/material-*`），下文仅列出各物料的属性和交互策略规格。物料包的文件组织和导出规范参见 [03-monorepo-structure](./03-monorepo-structure.md)。

### 内置物料包清单

| 包名 | 类型标识 | 分类 | 说明 |
|------|---------|------|------|
| `@easyink/material-text` | `text` | basic | 纯文本 |
| `@easyink/material-rich-text` | `rich-text` | basic | 富文本（Delta 格式） |
| `@easyink/material-image` | `image` | basic | 图片 |
| `@easyink/material-rect` | `rect` | shape | 矩形 |
| `@easyink/material-line` | `line` | shape | 线条 |
| `@easyink/material-barcode` | `barcode` | basic | 条形码/二维码 |
| `@easyink/material-data-table` | `data-table` | table | 数据表格（绑定数据源） |
| `@easyink/material-table` | `table` | table | 静态表格（手动填写） |

### 文本（text）

```typescript
interface TextProps {
  content: string          // 静态文本内容
  verticalAlign?: 'top' | 'middle' | 'bottom'
  wordBreak?: 'normal' | 'break-all' | 'break-word'
  overflow?: 'visible' | 'hidden' | 'ellipsis'
}
```

**交互策略：**
- selected 级：通用选中框 + 移动/缩放
- editing 级（双击）：行内文本编辑（contenteditable），光标定位，支持基础文本编辑
- 绑定模式：数据源拖入后显示绑定标签，覆盖 content 显示；删除绑定恢复原 content

### 富文本（rich-text）

```typescript
interface RichTextProps {
  /** Delta 格式的富文本内容 */
  content: RichTextDelta[]
  /** 是否在设计器中启用行内编辑 */
  editableInDesigner?: boolean
}

interface RichTextDelta {
  insert: string
  attributes?: {
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
    fontSize?: number
    fontFamily?: string
    color?: string
    link?: string
    superscript?: boolean
    subscript?: boolean
  }
}
```

### 图片（image）

```typescript
interface ImageProps {
  src: string              // URL 或 base64
  fit: 'contain' | 'cover' | 'fill' | 'none'
  alt?: string
}
```

### 矩形（rect）

```typescript
interface RectProps {
  borderRadius?: number | [number, number, number, number]
  fill?: string
}
```

### 线条（line）

```typescript
interface LineProps {
  direction: 'horizontal' | 'vertical' | 'custom'
  strokeWidth: number
  strokeColor: string
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  endX?: number
  endY?: number
}
```

### 条形码/二维码（barcode）

```typescript
interface BarcodeProps {
  format: 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'QR'
  value: string
  displayValue?: boolean
  barWidth?: number
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
}
```

### 数据表格（data-table）

> 绑定对象数组数据源、行数由运行时数据决定的动态表格。

```typescript
interface DataTableProps {
  /** 列定义（静态声明，不支持动态列） */
  columns: DataTableColumn[]
  /** 是否显示边框 */
  bordered?: boolean
  /** 边框线型 */
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  /** 表头样式 */
  headerStyle?: Partial<MaterialStyle>
  /** 行高 */
  rowHeight?: number | 'auto'
  /** 斑马纹 */
  striped?: boolean
  /** 是否显示表头 */
  showHeader?: boolean
}

interface DataTableColumn {
  /** 列标识 */
  key: string
  /** 列标题 */
  title: string
  /** 列宽（百分比，所有列宽之和 = 100%） */
  width: number
  /** 单元格对齐方式 */
  align?: 'left' | 'center' | 'right'
  /** 单元格渲染物料类型（默认 text） */
  cellType?: string
  /** 单元格渲染物料属性 */
  cellProps?: Record<string, unknown>
  /** 数据绑定（每列独立绑定） */
  binding?: DataBinding
}
```

**交互策略（三区域模型）：**

设计器中 data-table 显示三个区域：

```
┌─────────────────────────────────────────────┐
│ 表头行（1行）                                │ ← 列标题可双击编辑
│  商品名称  |  数量  |  单价  |  金额          │
├─────────────────────────────────────────────┤
│ 交互行（1行）                                │ ← 可拖入数据源字段绑定
│  {{itemName}} | {{itemQty}} | {{itemPrice}} │    拖到单元格=设置该列 binding.path
├─────────────────────────────────────────────┤
│ 样式行（1行）                                │ ← 纯视觉预览
│  ────────── | ────── | ──────── | ──────    │    预览斑马纹/cellType 等样式效果
└─────────────────────────────────────────────┘
```

- **表头行**：显示列标题，可双击编辑标题文本
- **交互行**：显示数据源绑定占位符（`{{path}}`），支持拖入字段绑定列
- **样式行**：纯视觉预览区域，展示斑马纹、cellType 渲染效果等样式

selected 级：显示列宽拖拽手柄（表格 DOM 上的列边界竖线），可拖拽调整列宽（联动相邻列）
editing 级（双击）：进入单元格编辑模式（编辑列标题 / 配置列属性）

### 静态表格（table）

> 行列数固定、在设计时手动填写单元格纯文本内容的静态表格。

```typescript
interface StaticTableProps {
  /** 列定义 */
  columns: StaticTableColumn[]
  /** 行数 */
  rowCount: number
  /** 单元格数据（稀疏表示） */
  cells: StaticTableCell[]
  /** 是否显示边框 */
  bordered?: boolean
  /** 边框线型 */
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  /** 是否显示表头 */
  showHeader?: boolean
}

interface StaticTableColumn {
  /** 列标识 */
  key: string
  /** 列标题 */
  title: string
  /** 列宽（百分比） */
  width: number
}

interface StaticTableCell {
  row: number
  col: number
  content: string
}
```

**表头处理：**
- 表头为独立区域（`columns` 定义 `title`），与数据行分离
- `showHeader` 控制显隐，默认 `true`
- 隐藏时表头完全不渲染，数据行上移
- 隐藏时不可双击编辑表头文本

**交互策略：**
- selected 级：列宽拖拽手柄
- editing 级（双击）：进入单元格编辑（表头文本 + 数据单元格文本，Excel/Word 风格）
- 行列增删通过右键菜单

### 两种表格对比

| 特性 | data-table（数据表格） | table（静态表格） |
|------|----------------------|------------------|
| 数据来源 | 绑定对象数组数据源 | 用户手动填写 |
| 行数 | 运行时由数据决定 | 设计时固定 |
| 单元格内容 | 数据源字段值 | 纯文本 |
| 数据绑定 | 每列独立绑定 binding.path | 不支持 |
| 表头 | 独立表头行，可隐藏 | 独立表头区域，可隐藏 |
| 设计器预览 | 表头+交互行+样式行（3行） | 直接显示填写内容 |
| 表头编辑 | 双击编辑列标题 | 双击编辑表头文本 |
| 单元格编辑 | 交互行拖入数据源绑定 | 画布上直接双击编辑 |
| 行列增删 | 属性面板增删列 | 右键菜单插入/删除行列 |
| 列宽 | 百分比 + 拖拽联动 | 百分比 + 拖拽联动 |
| 列宽手柄 | 表格 DOM 上 | 表格 DOM 上 |
| 布局模式 | 坐标驱动 + 整体下推 | 坐标驱动 + 整体下推 |
| 物料分类 | table 分组 | table 分组 |

## 11.9 物料分层架构

每种物料独立成包（`@easyink/material-*`），包内按三层子路径导出，与基础设施包（core/renderer/designer）解耦：

```
┌────────────────────────────────────────────────────────────────┐
│  基础设施层                                                     │
│                                                                │
│  @easyink/core                                                 │
│    MaterialTypeDefinition — 类型接口                            │
│    PropSchema — 属性 Schema 类型                                │
│    MaterialRegistry — 注册中心（空，不含内置物料）                │
│    （框架无关，无 DOM/Vue 依赖）                                 │
│                                                                │
│  @easyink/renderer                                             │
│    MaterialRendererRegistry — 渲染函数注册中心                   │
│    将 MaterialNode → HTML DOM 树（查注册表调用渲染函数）          │
│                                                                │
│  @easyink/designer                                             │
│    InteractionStrategyRegistry — 策略注册中心                   │
│    MaterialPanel — 物料面板（从 MaterialRegistry 读取列表）       │
│    PropertyPanel — PropSchema 驱动的属性面板                     │
│    DataBindingLayer — 数据源绑定交互图层                         │
│                                                                │
│  @easyink/ui                                                   │
│    表单编辑器组件（TextInput/NumberInput/ColorPicker/             │
│    Select/Switch/Slider/FontSelector）                          │
│    统一视觉风格，内部使用不对外导出                               │
├────────────────────────────────────────────────────────────────┤
│  物料包层（每种物料一个独立包）                                   │
│                                                                │
│  @easyink/material-text                                        │
│    ├── index        → textDefinition + textPropSchemas          │
│    ├── /render      → textRender（DOM 渲染函数）                 │
│    └── /designer    → textInteraction（交互策略）                 │
│                                                                │
│  @easyink/material-image                                       │
│    ├── index        → imageDefinition + imagePropSchemas         │
│    ├── /render      → imageRender                                │
│    └── /designer    → imageInteraction                           │
│                                                                │
│  @easyink/material-data-table                                  │
│    ├── index        → dataTableDefinition + dataTablePropSchemas │
│    ├── /render      → dataTableRender                            │
│    └── /designer    → dataTableInteraction                       │
│                                                                │
│  ... 其他物料包（rect/line/barcode/table/rich-text）             │
└────────────────────────────────────────────────────────────────┘
```

### 依赖方向（单向，无循环）

```
基础设施包之间:  shared ← core ← renderer ← designer (+ ui)

物料包依赖基础设施包（基础设施包不依赖物料包）:
  material-*/index       → core + shared
  material-*/render      → core + shared + renderer (peer)
  material-*/designer    → core + shared + designer (peer)
```

### 物料注册流程

消费方在初始化时按需导入物料包并注册：

```typescript
import { MaterialRegistry } from '@easyink/core'
import { MaterialRendererRegistry } from '@easyink/renderer'
import { InteractionStrategyRegistry } from '@easyink/designer'

// 按需导入物料
import { textDefinition } from '@easyink/material-text'
import { textRender } from '@easyink/material-text/render'
import { textInteraction } from '@easyink/material-text/designer'

import { dataTableDefinition } from '@easyink/material-data-table'
import { dataTableRender } from '@easyink/material-data-table/render'
import { dataTableInteraction } from '@easyink/material-data-table/designer'

// 注册到各层注册中心
materialRegistry.register(textDefinition)
materialRegistry.register(dataTableDefinition)

rendererRegistry.register('text', textRender)
rendererRegistry.register('data-table', dataTableRender)

interactionRegistry.register(textInteraction)
interactionRegistry.register(dataTableInteraction)
```

### 第三方物料扩展

当前阶段不把第三方物料包定义为稳定公共契约。`@easyink/material-*` 先服务仓库内实现；未来若开放第三方物料，需要在版本、注册时机和设计器依赖上重新收敛 API。

```typescript
// 未来若开放第三方物料，预期仍会遵循 definition / render / designer 三层拆分，
// 但当前不对外承诺该结构已经稳定。
```
