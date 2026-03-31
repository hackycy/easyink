# 12. 元素体系

## 12.1 元素类型定义

> **设计决策**：`@easyink/core` 是框架无关的 headless 层，`ElementTypeDefinition` 只包含声明性元信息（类型标识、属性定义、默认值等），不含 `render` 函数和 DOM/Vue 类型。`icon` 仅为 `string`（图标名称或 URL）。渲染函数由 `@easyink/renderer` 或 `@easyink/designer` 在注册时附加。

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
  /** 属性定义（驱动属性面板） */
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

/**
 * 渲染函数由 renderer/designer 包提供，core 不定义
 * renderer 包可扩展为：
 *
 * type ElementRenderFunction = (
 *   node: ElementNode,
 *   context: ElementRenderContext,
 * ) => HTMLElement | string
 */
```

## 12.2 内置元素类型

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

> 从原 `table` 拆分而来，专门用于绑定对象数组数据源、行数由运行时数据决定的动态表格场景。

```typescript
interface DataTableProps {
  /** 列定义（静态声明，不支持动态列） */
  columns: DataTableColumn[]
  /** 是否显示边框 */
  bordered?: boolean
  /** 边框线型 */
  borderStyle?: 'solid' | 'dashed' | 'dotted'
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
  /**
   * 列宽（百分比，所有列宽之和 = 100%）
   * 设计器中拖拽列宽时联动调整相邻列
   */
  width: number
  /** 单元格对齐方式 */
  align?: 'left' | 'center' | 'right'
  /** 单元格渲染元素类型（默认 text） */
  cellType?: string
  /** 单元格渲染元素属性（静态配置，如 barcode 的 format） */
  cellProps?: Record<string, unknown>
  /**
   * 数据绑定（每列独立绑定一个数据源字段）
   * binding.path 通常为点路径（如 'orderItems.itemName'），resolve 后得到数组
   * 同一 data-table 所有列的点路径前缀必须一致（同源约束，设计时 + 运行时双重校验）
   * 列间完全隔离，不能跨列引用同行值
   */
  binding?: DataBinding
  /** 格式化器 */
  formatter?: FormatterConfig
}

/**
 * data-table 不持有 binding，它只是列的容器。
 * 同一 data-table 所有列的 binding.path 必须来自同一对象数组（同源约束）。
 * 行数 = 源对象数组.length（同源保证各列等长）。
 * 元素缺失属性时该单元格为 undefined，由渲染层自定展示。
 * data-table 渲染器负责按行索引遍历各列数据。
 * 所有列为空数组时，渲染仅表头的空表格。
 */
```

### 静态表格（table）

> 新增元素类型。行列数固定、用户在设计时手动填写单元格纯文本内容的静态表格，适用于打印单据表头、固定格式的信息区块等场景。

```typescript
interface StaticTableProps {
  /** 列定义 */
  columns: StaticTableColumn[]
  /** 行数 */
  rowCount: number
  /**
   * 单元格数据（稀疏表示）
   * 未出现在 cells 中的位置视为空字符串。
   */
  cells: StaticTableCell[]
  /** 是否显示边框 */
  bordered?: boolean
  /** 边框线型 */
  borderStyle?: 'solid' | 'dashed' | 'dotted'
}

interface StaticTableColumn {
  /** 列标识 */
  key: string
  /**
   * 列宽（百分比，所有列宽之和 = 100%）
   */
  width: number
}

/**
 * 稀疏单元格 -- 仅存储有内容的单元格
 * 行/列索引从 0 开始
 */
interface StaticTableCell {
  /** 行索引（0-based） */
  row: number
  /** 列索引（0-based） */
  col: number
  /** 单元格纯文本内容 */
  content: string
}

/**
 * 静态表格关键设计决策：
 * - v1 单元格为纯文本，不支持数据绑定
 * - v1 不支持单元格合并（rowSpan/colSpan），后续版本扩展
 * - 全局统一样式，不支持单元格级别独立样式
 * - 行高 auto，由单元格文本内容撑开
 * - 默认创建时为 3 行 x 3 列
 * - 设计器中点击单元格可直接编辑文本（Excel/Word 风格体验）
 * - 添加/删除行列通过画布右键菜单操作
 * - 支持 absolute 和 flow 两种布局模式
 */
```

### 两种表格对比

| 特性 | data-table（数据表格） | table（静态表格） |
|------|----------------------|------------------|
| 数据来源 | 绑定对象数组数据源 | 用户手动填写 |
| 行数 | 运行时由数据决定 | 设计时固定 |
| 单元格内容 | 数据源字段值 | 纯文本 |
| 数据绑定 | 每列独立绑定 binding.path | 不支持 |
| 设计器预览 | 列标题 + N 行占位（显示 {{path}}） | 直接显示填写内容 |
| 单元格编辑 | 属性面板配置列 | 画布上直接点击编辑 |
| 行列增删 | 属性面板增删列 | 右键菜单插入/删除行列 |
| 列宽 | 百分比 | 百分比 |
| 边框 | 统一开关 + 线型 | 统一开关 + 线型 |
| 布局模式 | absolute / flow | absolute / flow |
| 工具栏分类 | table 分组 | table 分组 |
| auto-extend | 支持（数据行撑高） | 支持（同其他元素） |
