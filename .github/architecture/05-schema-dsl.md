# 5. Schema DSL 设计

EasyInk 的 Schema 不再只是“给渲染器吃的 JSON”，而是完整的文档模型。它既要让设计器可编辑，也要让 Viewer 可回放。

## 5.1 顶层结构

```typescript
interface DocumentSchema {
  version: string
  meta: DocumentMeta
  unit: 'mm' | 'pt' | 'px'
  page: PageSchema
  guides: GuideSchema
  elements: MaterialNode[]
  extensions?: Record<string, unknown>
}

interface GuideSchema {
  x: number[]
  y: number[]
  groups?: GuideGroup[]
}
```

设计约束：

- `DocumentSchema` 是持久化格式，不是工作台缓存格式
- 未识别字段应保留，避免导入导出丢失信息
- 旧版本模板必须可迁移或 best-effort 打开

## 5.2 页面模型

```typescript
interface PageSchema {
  mode: 'fixed' | 'stack' | 'label'
  width: number
  height: number
  pages?: number
  scale?: 'auto' | 'fit-width' | 'fit-height' | number
  copies?: number
  blankPolicy?: 'keep' | 'remove'
  offsetX?: number
  offsetY?: number
  grid?: {
    enabled: boolean
    width: number
    height: number
  }
  label?: {
    columns: number
    gap: number
  }
  font?: string
  background?: PageBackground
}
```

说明：

- `mode` 决定 Viewer 的页面计划方式
- `fixed` 对齐多页固定分页文档
- `stack` 对齐连续流式文档或长纸张场景
- `label` 对齐标签纸、多栏批量打印

## 5.3 元素模型

顶层采用平铺元素数组，受控容器内部可持有子元素。

```typescript
interface MaterialNode {
  id: string
  type: string
  name?: string
  unit?: 'mm' | 'pt' | 'px'
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

设计要点：

- 平铺数组更适合结构树、层级排序和画布选区
- `children` 只用于明确声明为容器的物料
- `binding` 允许单一绑定，也允许结构性物料使用多绑定数组

## 5.4 绑定模型

当前绑定不再是只有 `path` 的最小对象。

```typescript
interface BindingRef {
  sourceId: string
  sourceTag?: string
  fieldPath: string
  fieldLabel?: string
  usage?: UsageRule
  bindIndex?: number
  union?: UnionBinding[]
}

interface UnionBinding {
  fieldPath: string
  offsetX?: number
  offsetY?: number
  defaultProps?: Record<string, unknown>
}

type UsageRule =
  | string
  | {
      id: string
      options?: Record<string, unknown>
    }
```

说明：

- `sourceId` 标识绑定来自哪个数据源
- `fieldPath` 是字段路径，推荐以 `/` 作为规范分隔符
- `usage` 表示安全声明式格式规则或聚合规则，不执行任意脚本
- `bindIndex` 用于二维码、BWIP 等多参数型物料
- `union` 用于一拖多生成场景

## 5.5 表格类 Schema 不是普通 props

数据表格和静态表格要有独立内部结构，而不是只靠一个 `props.columns` 顶过去。

```typescript
interface DataTableProps {
  sections: Array<'title' | 'header' | 'data' | 'total' | 'footer'>
  rows: TableRowSchema[]
  hideHeader?: boolean
  hideTotal?: boolean
  hideFooter?: boolean
  repeatHeaderOnEachPage?: boolean
  padRows?: boolean
  dynamicColumns?: boolean
  singleRowScale?: boolean
  rowsPerPage?: number
  horizontalGap?: number
}

interface TableRowSchema {
  kind?: 'title' | 'header' | 'data' | 'total' | 'footer'
  cells: TableCellSchema[]
}

interface TableCellSchema {
  type: string
  rowSpan?: number
  colSpan?: number
  width: number
  height: number
  padding?: BoxSpacing
  border?: CellBorderSchema
  props?: Record<string, unknown>
  binding?: BindingRef
}
```

这类结构的目标是：

- 让设计器支持单元格选区与局部属性编辑
- 让 Viewer 支持分页、重复头、合计区和空行填充

## 5.6 动画与扩展

`animations` 是元素级声明，Viewer 决定是否执行。它们应是声明式配置，不允许直接注入脚本。

`extensions` 仅用于受控扩展，导入导出时必须保留。
