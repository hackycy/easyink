# 12. 物料体系（Material System）

> **重要变更**：元素体系从「内置定义 + 插件扩展」重构为「全物料化架构」。所有元素类型（含基础 text/image/rect/line）均为独立物料包，core 层仅保留注册机制和类型接口。内置物料由 `@easyink/renderer` 和 `@easyink/designer` 自动引入并注册，消费方无需手动安装或注册。

## 12.1 物料概念

**物料（Material）** 是 EasyInk 中一个完整的元素单元，包含从数据定义到设计器交互的全部能力。每个物料（如 Text、DataTable、Barcode）是一个独立的 npm 包，**两层导出**：

```
物料包 (e.g. @easyink/material-text)
├── /headless    → ElementTypeDefinition + 渲染函数（无框架依赖）
└── /designer    → 设计器 Vue 组件 + DesignerBehavior 声明 + 属性面板扩展
```

**内置物料 vs 第三方物料：**
- 内置物料：作为 `@easyink/renderer` / `@easyink/designer` 的 `dependencies`，初始化时**自动注册**，消费方零配置
- 第三方物料：独立 npm 包，消费方安装后通过 `useMaterial()` 手动注册

> **与插件（Plugin）的区别**：物料专注于「一个元素类型的全部实现」，使用专用的 `engine.useMaterial()` API 注册；插件（EasyInkPlugin）用于跨元素的全局扩展（钩子、面板、工具栏按钮等）。

## 12.2 物料包结构

### 包组织

每个物料一个独立 npm 包，位于 monorepo 的 `packages/materials/` 目录下：

```
easyink/
├── packages/
│   ├── core/                      # @easyink/core
│   ├── renderer/                  # @easyink/renderer（自动注册所有内置物料 headless 层）
│   ├── designer/                  # @easyink/designer（自动注册所有内置物料完整层）
│   ├── shared/                    # @easyink/shared
│   └── materials/                 # 内置物料包集合
│       ├── text/                  # @easyink/material-text
│       ├── rich-text/             # @easyink/material-rich-text
│       ├── image/                 # @easyink/material-image
│       ├── rect/                  # @easyink/material-rect
│       ├── line/                  # @easyink/material-line
│       ├── barcode/               # @easyink/material-barcode
│       ├── data-table/            # @easyink/material-data-table
│       └── table/                 # @easyink/material-table
```

### 子导出路径（Subpath Exports）-- 两层结构

每个物料包通过 `package.json` 的 `exports` 字段定义**两个**子路径：

```jsonc
// @easyink/material-text/package.json
{
  "name": "@easyink/material-text",
  "exports": {
    "./headless": "./dist/headless.js",    // definition + renderer（无 Vue 依赖）
    "./designer": "./dist/designer.js"     // Vue 组件 + Behavior + 编辑器
  },
  "dependencies": {
    "@easyink/core": "workspace:*",
    "@easyink/shared": "workspace:*"
  },
  "peerDependencies": {
    "vue": "^3"
  },
  "peerDependenciesMeta": {
    "vue": { "optional": true }            // 仅 /designer 子路径需要 Vue
  }
}
```

### 两层结构说明

| 层 | 子路径 | 内容 | Vue 依赖 | 引入方 |
|----|--------|------|----------|--------|
| **headless** | `./headless` | ElementTypeDefinition + Props 类型 + 渲染函数 | 无 | `@easyink/renderer` |
| **designer** | `./designer` | 设计器 Vue 组件 + DesignerBehavior + 自定义编辑器 | 是 | `@easyink/designer` |

> 原三层（core/renderer/designer）简化为两层：将 ElementTypeDefinition 和渲染函数合并到 headless 层，因为它们都不依赖 Vue，且总是一起使用。

## 12.3 自动注册机制

### renderer 自动注册

`@easyink/renderer` 初始化时自动导入并注册所有内置物料的 headless 层：

```typescript
// @easyink/renderer/src/index.ts（内部实现）
import { textHeadless } from '@easyink/material-text/headless'
import { imageHeadless } from '@easyink/material-image/headless'
import { rectHeadless } from '@easyink/material-rect/headless'
// ... 所有内置物料

/** 所有内置物料的 headless 定义 */
const builtinHeadlessMaterials = [
  textHeadless,
  imageHeadless,
  rectHeadless,
  // ...
]

// EasyInkEngine 初始化时自动注册
// 消费方无需手动调用 useMaterial()
```

### designer 自动注册

`@easyink/designer` 初始化时自动注册所有内置物料的完整层（headless + designer）：

```typescript
// @easyink/designer/src/index.ts（内部实现）
import { textHeadless } from '@easyink/material-text/headless'
import { textDesigner } from '@easyink/material-text/designer'
import { imageHeadless } from '@easyink/material-image/headless'
import { imageDesigner } from '@easyink/material-image/designer'
// ... 所有内置物料

/** 所有内置物料的完整定义 */
const builtinMaterials = [
  { ...textHeadless, ...textDesigner },
  { ...imageHeadless, ...imageDesigner },
  // ...
]

// useDesigner() 初始化时自动注册
// 消费方无需手动调用 useMaterial()
```

### 消费方体验

```typescript
// ─── 渲染场景：零配置，所有内置物料已自动注册 ───
import { EasyInkEngine } from '@easyink/renderer'

const engine = new EasyInkEngine({ schema })
// text/image/rect/line/barcode/table/data-table/rich-text 已自动可用
engine.setData(data)
engine.render(container)

// ─── 设计器场景：零配置，所有内置物料已自动注册 ───
import { useDesigner } from '@easyink/designer'

const designer = useDesigner({ schema: initialSchema })
// 所有内置物料的画布组件、行为声明、属性编辑器已自动可用

// ─── 第三方物料：手动注册 ───
import { myMaterial } from 'my-custom-material'
engine.useMaterial(myMaterial)
```

## 12.4 物料注册 API

### MaterialDefinition 接口

```typescript
interface MaterialDefinition {
  /** 元素类型定义 */
  definition: ElementTypeDefinition
  /** 渲染函数 */
  renderer?: ElementRenderFunction
  /** 设计器组件（仅设计器场景需要） */
  designerComponent?: Component
  /** 设计器行为声明 */
  behavior?: DesignerBehavior
  /** 属性面板扩展 -- 自定义编辑器组件 */
  editors?: Record<string, Component>
  /** 自定义 overlay 组件（选中时渲染，取消选中时销毁） */
  overlay?: Component
}

/**
 * 渲染函数签名
 */
type ElementRenderFunction = (
  node: ElementNode,
  context: ElementRenderContext,
) => HTMLElement | string
```

### Headless 导出结构

每个物料的 `/headless` 子路径导出一个包含 definition + renderer 的对象：

```typescript
/** headless 层导出结构 */
interface MaterialHeadless {
  definition: ElementTypeDefinition
  renderer: ElementRenderFunction
}
```

### Designer 导出结构

每个物料的 `/designer` 子路径导出设计器相关部分：

```typescript
/** designer 层导出结构 */
interface MaterialDesignerExport {
  designerComponent: Component
  behavior: DesignerBehavior
  editors?: Record<string, Component>
  /** 自定义 overlay 组件（选中时渲染，取消选中时销毁） */
  overlay?: Component
}
```

### 注册入口

```typescript
class EasyInkEngine {
  /**
   * 注册物料（主要用于第三方物料）
   * 内置物料由 renderer/designer 自动注册，无需手动调用。
   */
  useMaterial(material: MaterialDefinition): void

  /** 批量注册物料 */
  useMaterials(materials: MaterialDefinition[]): void
}
```

## 12.4 ElementTypeDefinition（core 层）

core 层保留 `ElementTypeDefinition` 接口和 `ElementRegistry`，但**不再包含任何内置元素定义**（原 `builtins.ts` 清空）。

```typescript
interface ElementTypeDefinition {
  /** 元素类型标识（全局唯一） */
  type: string
  /** 显示名称 */
  name: string
  /** 工具栏图标（图标名称或 URL） */
  icon: string
  /** 元素分类（用于工具栏分组展示） */
  category?: string
  /** 属性定义（驱动属性面板自动生成 + 自定义编辑器） */
  propDefinitions: PropDefinition[]
  /** 默认属性值 */
  defaultProps: Record<string, unknown>
  /** 默认布局 */
  defaultLayout: Partial<ElementLayout>
  /** 默认样式 */
  defaultStyle?: Partial<ElementStyle>
  /** 该元素类型是否支持子元素 */
  isContainer?: boolean
  /** 该元素类型是否支持数据循环 */
  supportsRepeat?: boolean
}
```

### PropDefinition 扩展：自定义编辑器

在原有 `PropDefinition` 基础上，新增 `editor: 'custom'` 类型支持，允许物料提供 Vue 组件作为属性编辑器：

```typescript
interface PropDefinition {
  key: string
  label: string
  /**
   * 编辑器类型
   * 内置：'text' | 'number' | 'color' | 'select' | 'font' | 'switch'
   * 自定义：'custom'（需在物料的 editors 中注册对应组件）
   */
  editor: string
  editorOptions?: Record<string, unknown>
  defaultValue?: unknown
  group?: string
  visible?: (props: Record<string, unknown>) => boolean
}

// ─── 示例：data-table 的列管理用自定义编辑器 ───
const dataTableDefinition: ElementTypeDefinition = {
  type: 'data-table',
  propDefinitions: [
    {
      key: 'columns',
      label: '列配置',
      editor: 'custom',  // 使用自定义 Vue 组件
      group: '表格',
    },
    { key: 'bordered', label: '显示边框', editor: 'switch', group: '表格' },
    // ...
  ],
  // ...
}
```

## 12.5 DesignerBehavior（设计器行为声明）

### 声明式配置 + 解释器模式

每个物料可声明其在设计器中的交互行为。行为通过**内置原语**（字符串标识）声明，由设计器框架的解释器统一执行。原语集合**严格封闭**，不允许物料自定义。

> **定位说明**：行为原语适用于**简单物料**（text / image / barcode / rect / line 等），提供声明式入口开关。**复杂物料**（table / data-table / rich-text 等）的交互逻辑由其 designerComponent + 自定义 overlay + 事件合同完整自行实现，行为原语仅描述入口级行为。详见 [11. 设计器交互层](11-designer-interaction.md) 的 11.6-11.11 节。

```typescript
/**
 * 设计器行为声明 -- 声明式配置
 *
 * 所有字段可选，未声明的行为使用默认处理（noop 或框架默认行为）。
 * 行为原语为内置封闭集合，物料只能从中选择。
 */
interface DesignerBehavior {
  /** 双击行为 */
  doubleClick?: DesignerBehaviorPrimitive
  /** 接收数据源字段拖入的行为 */
  dataSourceDrop?: DesignerBehaviorPrimitive
  /** 选中时的行为（如显示特殊 handle） */
  onSelect?: DesignerBehaviorPrimitive
  /** 右键菜单扩展项 */
  contextMenu?: DesignerBehaviorPrimitive
}
```

### 内置行为原语

```typescript
/**
 * 内置行为原语 -- 严格封闭集合
 *
 * 每个原语由设计器框架实现，物料只做声明引用。
 * 新增原语需要修改框架代码并更新此类型。
 */
type DesignerBehaviorPrimitive =
  // ── 双击行为 ──
  | 'inline-edit'        // 进入行内文本编辑模式（text / rich-text 使用）
  | 'cell-edit'          // 进入单元格编辑模式（table 使用）
  // ── 数据源拖入行为 ──
  | 'bind-default-prop'  // 绑定到元素的默认 prop（text→content, image→src, barcode→value）
  | 'bind-column'        // 绑定为表格列（data-table 使用）
  // ── 选中行为 ──
  | 'column-resize'      // 显示列宽调整手柄（data-table / table 使用）
  // ── 右键菜单 ──
  | 'table-row-col-ops'  // 添加行列增删菜单项（table 使用）
  // ── 通用 ──
  | 'noop'               // 无操作
```

### 各物料行为声明示例

```typescript
// ─── text ───
const textBehavior: DesignerBehavior = {
  doubleClick: 'inline-edit',
  dataSourceDrop: 'bind-default-prop',
}

// ─── image ───
const imageBehavior: DesignerBehavior = {
  dataSourceDrop: 'bind-default-prop',
}

// ─── data-table（复杂物料：交互由 designerComponent + overlay 自行实现） ───
const dataTableBehavior: DesignerBehavior = {
  dataSourceDrop: 'bind-column',
  // 列宽拖拽、表头编辑等复杂交互由自定义 overlay 和 designerComponent 内部处理
}

// ─── table（复杂物料：交互由 designerComponent + overlay 自行实现） ───
const tableBehavior: DesignerBehavior = {
  // 双击编辑、列宽拖拽、右键增删等复杂交互由 designerComponent + overlay 内部处理
  contextMenu: 'table-row-col-ops',
}

// ─── rect ───
const rectBehavior: DesignerBehavior = {
  // 无特殊交互，全部使用默认行为
}

// ─── barcode ───
const barcodeBehavior: DesignerBehavior = {
  dataSourceDrop: 'bind-default-prop',
}
```

## 12.6 设计器与渲染器双套渲染

设计器画布和渲染器使用**独立的渲染实现**，各自由物料包提供：

```
┌─────────────────────────────────────────────┐
│ 物料包 (e.g. @easyink/material-text)         │
│                                              │
│  /headless → textRenderer()                  │
│    用于：打印预览、PDF 生成、图片导出          │
│    特点：数据填充后的最终渲染                  │
│                                              │
│  /designer → <TextDesigner />                │
│    用于：设计器画布内的预览                    │
│    特点：占位符显示、交互响应、编辑状态         │
└─────────────────────────────────────────────┘
```

**为什么分开？**
- 设计器画布需要占位符显示（`{{path}}`）、交互状态（编辑中/选中）、拖拽 handle 等，逻辑与最终渲染完全不同
- 渲染器只关心数据填充后的最终 DOM 输出
- 分开后各自职责清晰，不需要在单一组件中混合渲染/设计两种模式

## 12.7 内置物料类型定义

以下为各内置物料的 Props 类型定义。这些类型从各物料包的 `/headless` 子路径导出。

### 文本（text）

```typescript
interface TextProps {
  content: string          // 静态文本或包含 {{ }} 的模板文本
  verticalAlign?: 'top' | 'middle' | 'bottom'
  wordBreak?: 'normal' | 'break-all' | 'break-word'
  overflow?: 'visible' | 'hidden' | 'ellipsis'
}
```

### 富文本（rich-text）

```typescript
interface RichTextProps {
  /** Delta 格式的富文本内容（类似 Quill Delta） */
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
  /** custom 方向时的终点坐标偏移 */
  endX?: number
  endY?: number
}
```

### 条形码/二维码（barcode）

```typescript
interface BarcodeProps {
  /** 编码格式 */
  format: 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'QR'
  /** 编码内容（可绑定数据） */
  value: string
  /** 是否在条形码下方显示文字 */
  displayValue?: boolean
  /** 条形码线条宽度 */
  barWidth?: number
  /** QR 码纠错级别 */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
}
```

### 数据表格（data-table）

```typescript
/** 表格边框配置（data-table 和 table 共用） */
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

interface DataTableProps {
  /** 列定义（静态声明，不支持动态列） */
  columns: DataTableColumn[]
  /** 全局 border 配置 */
  border?: TableBorderConfig
  /** 行级 border 覆盖（稀疏，key 为行号） */
  rowBorders?: Record<number, Partial<TableBorderConfig>>
  /** 列级 border 覆盖（稀疏，key 为列号） */
  columnBorders?: Record<number, Partial<TableBorderConfig>>
  /** 表头样式 */
  headerStyle?: Partial<ElementStyle>
  /** 行高 */
  rowHeight?: number | 'auto'
  /** 斑马纹 */
  striped?: boolean
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
  /** 单元格渲染元素类型（默认 text） */
  cellType?: string
  /** 单元格渲染元素属性 */
  cellProps?: Record<string, unknown>
  /** 数据绑定（每列独立绑定，同源约束） */
  binding?: DataBinding
  /** 格式化器 */
  formatter?: FormatterConfig
}
```

### 静态表格（table）

```typescript
interface StaticTableProps {
  /** 列定义 */
  columns: StaticTableColumn[]
  /** 行数 */
  rowCount: number
  /** 单元格数据（稀疏表示） */
  cells: StaticTableCell[]
  /** 全局 border 配置 */
  border?: TableBorderConfig
  /** 行级 border 覆盖（稀疏，key 为行号） */
  rowBorders?: Record<number, Partial<TableBorderConfig>>
  /** 列级 border 覆盖（稀疏，key 为列号） */
  columnBorders?: Record<number, Partial<TableBorderConfig>>
}

interface StaticTableColumn {
  key: string
  width: number  // 百分比
}

interface StaticTableCell {
  row: number    // 0-based
  col: number    // 0-based
  content: string
}
```

### 两种表格对比

| 特性 | data-table（数据表格） | table（静态表格） |
|------|----------------------|------------------|
| 数据来源 | 绑定对象数组数据源 | 用户手动填写 |
| 行数 | 运行时由数据决定 | 设计时固定 |
| 单元格内容 | 数据源字段值 | 纯文本 |
| 数据绑定 | 每列独立绑定 binding.path | 不支持 |
| 设计器预览 | 列标题 + N 行占位（显示 {{path}}） | 直接显示填写内容 |
| 设计器双击 | 表头：编辑列名；数据行：仅选中 | 进入单元格编辑 |
| 数据源拖入 | 绑定为新列 | - |
| 行列增删 | 属性面板增删列 | 右键菜单插入/删除行列 |
| 列宽 | 百分比，overlay 拖拽调整 | 百分比，overlay 拖拽调整 |
| 边框 | 全局 + 行列级覆盖（TableBorderConfig） | 全局 + 行列级覆盖（TableBorderConfig） |

## 12.8 物料开发规范

### 物料包基本结构

**简单物料**（text / image / rect / line / barcode）：

```
packages/materials/text/
├── package.json
├── tsdown.config.ts
└── src/
    ├── headless/
    │   ├── definition.ts     # ElementTypeDefinition
    │   ├── render.ts         # ElementRenderFunction（Schema -> DOM）
    │   ├── types.ts          # TextProps 等类型
    │   └── index.ts          # 导出 textDefinition, textRenderer, TextProps
    ├── designer/
    │   ├── TextDesigner.vue  # 设计器画布组件
    │   ├── behavior.ts       # DesignerBehavior 声明
    │   ├── editors/          # 自定义属性编辑器组件
    │   └── index.ts          # 导出 TextDesigner, textBehavior, textEditors
    └── index.ts              # 便捷全量导出（可选）
```

**复杂物料**（table / data-table）-- 含自定义 overlay：

```
packages/materials/table/
├── package.json
├── tsdown.config.ts
└── src/
    ├── headless/
    │   ├── definition.ts     # ElementTypeDefinition
    │   ├── render.ts         # ElementRenderFunction
    │   ├── types.ts          # StaticTableProps, TableBorderConfig 等
    │   └── index.ts
    ├── designer/
    │   ├── TableDesigner.vue    # 设计器画布组件（内部管理交互子状态）
    │   ├── TableOverlay.vue     # 自定义 overlay（列宽 handle、单元格高亮）
    │   ├── behavior.ts          # DesignerBehavior 声明
    │   ├── editors/             # 自定义属性编辑器（border 配置等）
    │   └── index.ts             # 导出含 overlay 字段
    └── index.ts
```

### 物料层共享包

表格类物料共享组件和类型放在 `packages/materials/shared/`：

```
packages/materials/shared/          # @easyink/material-shared
├── package.json
└── src/
    ├── components/
    │   └── ColumnResizeOverlay.vue  # 共用列宽拖拽 overlay
    ├── types/
    │   └── border.ts               # TableBorderConfig 等共享类型
    ├── utils/
    │   ├── column-width.ts          # 列宽百分比计算、联动调整
    │   └── border-merge.ts          # border 覆盖合并逻辑（列级 > 行级 > 全局）
    └── index.ts
```

### package.json subpath exports

```jsonc
{
  "name": "@easyink/material-text",
  "exports": {
    "./headless": "./src/headless/index.ts",
    "./designer": "./src/designer/index.ts"
  },
  "peerDependencies": {
    "vue": "^3.0.0"  // 仅 /designer 子路径需要
  },
  "peerDependenciesMeta": {
    "vue": { "optional": true }
  }
}
```

### 第三方物料开发

第三方开发者可创建自定义物料包，遵循相同的两层导出规范，通过 `useMaterial()` 手动注册：

```typescript
// my-custom-material/src/headless/definition.ts
export const myElementDefinition: ElementTypeDefinition = {
  type: 'my-element',
  name: '自定义元素',
  icon: 'my-icon',
  category: 'custom',
  propDefinitions: [/* ... */],
  defaultProps: {/* ... */},
  defaultLayout: { position: 'absolute', width: 100, height: 100 },
}

// my-custom-material/src/headless/render.ts
export const myElementRenderer: ElementRenderFunction = (node, ctx) => {
  // Schema -> DOM 渲染逻辑
}

// my-custom-material/src/designer/behavior.ts
export const myElementBehavior: DesignerBehavior = {
  doubleClick: 'inline-edit',
  dataSourceDrop: 'bind-default-prop',
}
```
