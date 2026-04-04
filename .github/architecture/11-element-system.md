# 11. 物料体系

EasyInk 的物料体系要覆盖报表设计器里的“内容元素”和“结构元素”两类对象，而不是只围绕文本、图片这种基础块。

## 11.1 物料定义

每个物料都由三部分组成：

- Schema 定义
- Designer 交互定义
- Viewer 渲染定义

```typescript
interface MaterialDefinition {
  type: string
  name: string
  icon: string
  category: string
  capabilities: MaterialCapabilities
  props: PropSchema[]
  createDefaultNode(input?: Partial<MaterialNode>): MaterialNode
}

interface MaterialCapabilities {
  bindable?: boolean
  rotatable?: boolean
  resizable?: boolean
  supportsChildren?: boolean
  supportsAnimation?: boolean
  supportsUnionDrop?: boolean
  pageAware?: boolean
}
```

## 11.2 物料分类

### 基础内容物料

- `text`
- `rich-text`
- `image`
- `barcode`
- `qrcode`

### 基础图形物料

- `line`
- `rect`
- `ellipse`
- `svg`

### 结构物料

- `container`
- `table-static`
- `table-data`
- `relation`

### 数据可视化物料

- `chart`

## 11.3 一等公民物料

以下物料必须按一级系统建设，而不是当成普通盒子补丁处理。

### `table-data`

它需要：

- 集合字段绑定
- 单元格绑定
- 表头编辑
- 分页切片
- 重复头
- 合计区
- 空行填充

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

## 11.4 MaterialNode

```typescript
interface MaterialNode {
  id: string
  type: string
  name?: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  alpha?: number
  zIndex?: number
  locked?: boolean
  hidden?: boolean
  props: Record<string, unknown>
  binding?: BindingRef | BindingRef[]
  animations?: AnimationSchema[]
  children?: MaterialNode[]
  extensions?: Record<string, unknown>
}
```

说明：

- 文档顶层字段名当前保留为 `elements`
- 运行时对象模型仍统一使用 `MaterialNode`
- 受控容器物料可持有 `children`

## 11.5 属性系统

属性系统通过 `PropSchema` 驱动，但要支持物料专属模型。

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

原则：

- 属性系统负责编辑器渲染，不是远程表单协议
- 函数式显隐和联动是内部代码契约
- 自定义编辑器缺失时显示只读占位

## 11.6 绑定能力

物料的绑定能力按类型划分：

### 单值绑定

- text
- image
- barcode
- qrcode

### 结构绑定

- table-data
- chart
- relation

### 非绑定物料

- rect
- line
- ellipse

## 11.7 Designer 扩展面

每个物料包可提供 Designer 扩展：

```typescript
interface MaterialDesignerExtension {
  getToolbarActions?(node: MaterialNode): ToolbarAction[]
  getContextActions?(node: MaterialNode): ContextAction[]
  renderOverlay?(node: MaterialNode, state: DesignerMaterialState): unknown
  enterEditMode?(node: MaterialNode): boolean
}
```

## 11.8 Viewer 扩展面

每个物料包可提供 Viewer 渲染扩展：

```typescript
interface MaterialViewerExtension {
  render(node: MaterialNode, context: ViewerRenderContext): ViewerRenderOutput
  measure?(node: MaterialNode, context: ViewerMeasureContext): ViewerMeasureResult
}
```

## 11.9 未知物料策略

当模板中出现未知物料时：

- Designer 不直接删除
- 画布显示占位块
- 属性面板显示只读基础信息
- Viewer 输出诊断和明显占位
- 导入导出时尽量保留原始节点

## 11.10 v1 内置物料范围

v1 以“复刻目标产品核心主路径”为准，优先级如下：

1. `text`、`image`、`barcode`、`qrcode`
2. `table-data`、`table-static`
3. `container`
4. `svg`、`chart`、`relation`

这意味着物料体系要优先保证报表、票据、标签、多区域模板的主路径可用，而不是追求长尾装饰物料的数量。
