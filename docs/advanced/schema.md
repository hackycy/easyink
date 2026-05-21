# Schema 参考

Schema 是 EasyInk 的核心数据结构，描述文档的完整结构。它是设计器和预览器之间的唯一桥梁。

对宿主应用而言，传入设计器的是 `DocumentSchemaInput`：所有顶层字段都可以省略，`page` 和 `guides` 的必填子字段也可以省略。框架会通过 `normalizeDocumentSchema()` 补齐默认值，进入 `DesignerStore`、Viewer、自动保存和导出链路后的内部模型始终是完整 `DocumentSchema`。

```ts
import { normalizeDocumentSchema } from '@easyink/schema'

const schema = normalizeDocumentSchema({
  page: { width: 80 },
})

// schema.page => { mode: 'fixed', width: 80, height: 297 }
// schema.guides => { x: [], y: [] }
// schema.elements => []
```

`validateSchemaIssues()` 仍用于判断一个对象是否已经是完整合法的内部 Schema；缺字段的输入不应直接交给画布或预览器消费，应先归一化。

## DocumentSchema

```ts
interface DocumentSchema {
  version: string                    // Schema 版本号
  meta?: DocumentMeta                // 文档元信息
  unit: UnitType                     // 全局单位：'mm' | 'pt' | 'px' | 'inch'
  page: PageSchema                   // 页面配置
  guides: GuideSchema                // 辅助线
  elements: MaterialNode[]           // 元素列表
  groups?: ElementGroupSchema[]      // 元素分组
  extensions?: Record<string, unknown> // 扩展数据（如 AI、自定义插件）
  compat?: BenchmarkCompatState      // 兼容层数据
}
```

## DocumentSchemaInput

`DocumentSchemaInput` 是给宿主传入设计器或调用归一化函数时使用的宽松输入类型：

```ts
type DocumentSchemaInput = Partial<Omit<DocumentSchema, 'page' | 'guides' | 'elements' | 'groups'>> & {
  page?: Partial<PageSchema>
  guides?: Partial<GuideSchema>
  elements?: MaterialNode[]
  groups?: ElementGroupSchema[]
}
```

默认值来自 `createDefaultSchema()`：A4、`mm`、`fixed`、空辅助线、空元素列表。已有合法字段会保留，缺失或非法的必需字段会回退到默认值。

## DocumentMeta

```ts
interface DocumentMeta {
  name?: string
  description?: string
  author?: string
  createdAt?: string
  updatedAt?: string
}
```

## PageSchema

页面配置定义纸张尺寸、页面介质、布局策略、分页策略和打印参数。

```ts
interface PageSchema {
  mode: PageMode            // 'fixed' | 'continuous' | 'label'
  width: number             // 页面宽度
  height: number            // 页面高度
  pages?: number            // 页数（fixed 模式）
  scale?: PageScale         // 缩放模式
  radius?: string           // 页面圆角
  offsetX?: number          // 水平偏移
  offsetY?: number          // 垂直偏移
  copies?: number           // 打印份数
  blankPolicy?: BlankPolicy // 空白页策略
  label?: LabelPageConfig   // 标签页配置
  grid?: GridConfig         // 网格配置
  font?: string             // 默认字体
  background?: PageBackground // 页面背景
  print?: PagePrintConfig   // 打印配置
  pageModel?: PageModelConfig
  layout?: DocumentLayoutConfig
  pagination?: PaginationConfig
  reflow?: ReflowConfig
  extensions?: Record<string, unknown>
}
```

### 页面介质与策略

`page.mode` 只表达页面介质类型，布局、重排和分页分别由 `layout / reflow / pagination` 表达。`normalizeDocumentSchema()` 会按 `mode` 补齐默认策略。

| `mode` | 默认页面模型 | 默认布局 | 默认重排 | 默认分页 |
|------|------|------|------|------|
| `fixed` | `paged-paper` | `absolute` | `measure-only` | `fixed-sheets` |
| `continuous` | `continuous-paper` | `stack-flow` | `flow-y` | `none` |
| `label` | `label-sheet` | `absolute` | `measure-only` | `label-sheets` |

历史输入中的 `stack` 会在兼容入口迁移为 `continuous + stack-flow + flow-y`，新模板不应再写入 `page.mode = 'stack'`。

### MaterialNode 布局行为

布局、分页和每页重复使用节点级字段表达，物料 `props` 只保存物料自己的内容和样式属性。

```ts
interface MaterialNode {
  placement?: {
    mode?: 'flow' | 'fixed'
  }
  break?: {
    keepTogether?: boolean
    before?: 'auto' | 'page'
    after?: 'auto' | 'page'
  }
  repeat?: {
    scope?: 'none' | 'every-output-page'
  }
}
```

- `placement.mode='flow'`：节点参与 `flow-y` 回流。
- `placement.mode='fixed'`：节点不被回流推移，跨页规则不生效。
- `break`：仅在 `pagination.strategy='auto-sheets'` 时影响切页。
- `repeat.scope='every-output-page'`：分页完成后复制到每个输出页，并注入页码上下文；不会影响页数。

旧模板中的 `props.layoutMode / keepTogether / pageBreakBefore / pageBreakAfter` 会作为兼容输入读取，新模板不应继续写入这些字段。

### LabelPageConfig

标签模式的网格配置：

```ts
interface LabelPageConfig {
  columns: number    // 列数
  gap: number        // 列间距
  rows?: number      // 行数
  rowGap?: number    // 行间距
}
```

### PageBackground

```ts
interface PageBackground {
  color?: string           // 背景颜色
  image?: string           // 背景图片 URL
  repeat?: BackgroundRepeat // 'full' | 'repeat' | 'repeat-x' | 'repeat-y' | 'none'
  width?: number
  height?: number
  offsetX?: number
  offsetY?: number
}
```

### PagePrintConfig

```ts
interface PagePrintConfig {
  orientation?: 'auto' | 'portrait' | 'landscape'
  horizontalOffset?: number  // 打印水平偏移
  verticalOffset?: number    // 打印垂直偏移
}
```

### GridConfig

```ts
interface GridConfig {
  enabled: boolean
  width: number   // 网格单元宽度
  height: number  // 网格单元高度
}
```

## MaterialNode

元素节点是文档中的可视对象。

```ts
interface MaterialNode<TProps = Record<string, unknown>> {
  id: string                   // 唯一标识
  type: string                 // 物料类型（如 'text'、'image'、'table-data'）
  name?: string                // 显示名称
  unit?: UnitType              // 坐标单位（覆盖全局 unit）
  x: number                    // X 坐标
  y: number                    // Y 坐标
  width: number                // 宽度
  height: number               // 高度
  rotation?: number            // 旋转角度
  alpha?: number               // 透明度（0-1）
  zIndex?: number              // 层级
  hidden?: boolean             // 是否隐藏
  locked?: boolean             // 是否锁定
  print?: PrintBehavior        // 打印行为
  placement?: NodePlacementConfig
  break?: NodeBreakConfig
  repeat?: NodeRepeatConfig
  props: TProps                // 物料属性（由物料类型决定）
  binding?: BindingRef | BindingRef[]  // 数据绑定
  animations?: AnimationSchema[]       // 动画
  children?: MaterialNode[]    // 子元素（容器类物料）
  diagnostics?: NodeDiagnosticState[]  // 节点级诊断
  extensions?: Record<string, unknown>
  compat?: BenchmarkElementCompatState
}
```

### 常见物料类型

| type | 说明 | 主要 props |
|------|------|-----------|
| `text` | 文本 | `content`, `fontSize`, `fontFamily`, `color`, `textAlign`, `fontWeight` |
| `image` | 图片 | `src`, `objectFit` |
| `barcode` | 条码 | `value`, `format` |
| `qrcode` | 二维码 | `value` |
| `line` | 线条 | `direction`, `strokeColor`, `strokeWidth` |
| `rect` | 矩形 | `fill`, `strokeColor`, `strokeWidth` |
| `ellipse` | 椭圆 | `fill`, `strokeColor` |
| `table-static` | 静态表格 | `table: TableSchema` |
| `table-data` | 数据表格 | `table: TableDataSchema` |
| `container` | 容器 | `children` |
| `flow-row` | 流式数据行 | 列定义、间距、排版样式 |
| `chart` | 图表 | 图表配置 |
| `svg-custom` | 自定义 SVG | SVG 内容 |
| `svg-star` | 星形 SVG | 星形参数 |
| `svg-heart` | 心形 SVG | 心形参数 |
| `page-number` | 页码 | 页码格式、页码上下文 |

## BindingRef

数据绑定引用。

```ts
interface BindingRef {
  sourceId: string           // 设计时数据源 ID，Viewer 不用它选择数据根
  sourceName?: string        // 设计时数据源名称
  sourceTag?: string         // 设计时数据源标签
  fieldPath: string          // 运行时 data 根路径，如 'customer/name' 或 'items/price'
  fieldKey?: string          // 字段 key
  fieldLabel?: string        // 字段标签
  format?: BindingDisplayFormat  // 格式化规则
  bindIndex?: number         // 绑定索引（多绑定时区分主/次）
  required?: boolean         // 是否必填
  extensions?: Record<string, unknown>
}
```

## AnimationSchema

```ts
interface AnimationSchema {
  trigger: string    // 触发条件
  type: string       // 动画类型
  duration?: number  // 持续时间（毫秒）
  delay?: number     // 延迟（毫秒）
  options?: Record<string, unknown>
}
```

## TableNode

表格元素扩展了 MaterialNode，增加了 `table` 属性。

```ts
interface TableNode extends MaterialNode {
  type: 'table-static' | 'table-data'
  table: TableSchema
}

interface TableSchema {
  kind: 'static' | 'data'
  topology: TableTopologySchema  // 行列拓扑
  layout: TableLayoutConfig      // 布局配置
  diagnostics?: LayoutDiagnostic[]
}

/** table-data 专用 Schema */
interface TableDataSchema extends TableSchema {
  kind: 'data'
  showHeader?: boolean  // 是否显示表头，默认 true
  showFooter?: boolean  // 是否显示表尾，默认 true
}

interface TableTopologySchema {
  columns: TableColumnSchema[]   // 列定义（ratio 为宽度比例）
  rows: TableRowSchema[]         // 行定义
}

interface TableRowSchema {
  height: number
  role: TableRowRole             // 'header' | 'body' | 'footer'
  cells: TableCellSchema[]
}

interface TableCellSchema {
  rowSpan?: number
  colSpan?: number
  border?: CellBorderSchema
  padding?: BoxSpacing
  content?: {
    text?: string
    elements?: MaterialNode[]    // 单元格内嵌元素
    editMode?: 'inline-text' | 'rich-text' | 'hosted'
  }
  typography?: CellTypography
  props?: Record<string, unknown>
  binding?: BindingRef            // table-data 单元格绑定
  staticBinding?: BindingRef      // table-static 独立单元格绑定
}
```

## 工具函数

```ts
// 类型守卫
isTableNode(node)      // 是否为表格节点
isTableDataNode(node)  // 是否为数据表格节点

// 属性访问
getNodeProps<T>(node)  // 获取类型化的 props

// 默认值与归一化
createDefaultSchema()       // 完整默认 Schema
createDefaultPage()         // 默认 page
createDefaultGuides()       // 默认 guides
normalizeDocumentSchema(input)

// 校验与序列化
validateSchema(schema)        // 返回字符串错误数组
validateSchemaIssues(schema)  // 返回 { path, message, code }[]
isValidSchema(schema)         // 类型守卫
serializeSchema(schema)
deserializeSchema(json)
isCompatibleVersion(version)
```

`validateSchemaIssues()` 校验的是完整内部 Schema。宿主传入的宽松输入应该先经过 `normalizeDocumentSchema()`，否则缺少 `version`、`unit`、`page`、`guides` 或 `elements` 都会被视为校验问题。

## 最小 Schema 示例

```json
{
  "version": "1.0.0",
  "unit": "mm",
  "page": {
    "mode": "fixed",
    "width": 210,
    "height": 297
  },
  "guides": { "x": [], "y": [] },
  "elements": [
    {
      "id": "text-1",
      "type": "text",
      "x": 20,
      "y": 20,
      "width": 170,
      "height": 10,
      "props": {
        "content": "Hello EasyInk",
        "fontSize": 24,
        "fontFamily": "sans-serif"
      }
    }
  ]
}
```
