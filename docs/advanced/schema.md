# Schema 参考

Schema 是 EasyInk 的基础模型。Designer、Viewer、打印和导出最终都围绕它工作。

## 输入形态

对宿主来说，最常接触的是宽松输入；对运行时来说，最终都会落到完整 Schema。传入设计器的是 `DocumentSchemaInput`：所有顶层字段都可以省略，`page` 和 `guides` 的必填子字段也可以省略。

`version` 不属于宿主可指定输入，框架会通过 `normalizeDocumentSchema()` 补齐默认值并写入当前 Schema 版本。进入 `DesignerStore`、Viewer、自动保存和导出链路后的内部模型始终是完整 `DocumentSchema`。

最关键的规则是：先归一化，再校验和消费。

```ts
import { normalizeDocumentSchema, validateSchemaIssues } from '@easyink/schema'

const schema = normalizeDocumentSchema({
  page: { width: 80 },
})

const issues = validateSchemaIssues(schema)

// schema.page => { mode: 'fixed', width: 80, height: 297 }
// schema.guides => { x: [], y: [] }
// schema.elements => []
```

`normalizeDocumentSchema()` 会补默认值，`validateSchemaIssues()` 用来判断对象是否已经是完整合法的内部 Schema。

## `normalizeDocumentSchema()` 行为

从实现上看，它至少会保证这些默认值：

- `version` 写成当前 Schema 版本
- `unit` 默认 `mm`
- `guides` 默认 `{ x: [], y: [] }`
- `elements` 默认空数组
- `page` 会按 `mode` 补全对应的层级默认策略

## `page.mode` 配置

当前归一化逻辑里，`mode` 会决定整组页面层配置默认值：

| mode | pageModel | layout | pagination | reflow |
| --- | --- | --- | --- | --- |
| `fixed` | `paged-paper` | `absolute` | `fixed-sheets` | `measure-only` |
| `continuous` | `continuous-paper` | `stack-flow` | `none` | `flow-y` |

这也是为什么连续纸和固定页面模板不能只改一个宽高就算了。

## 校验能力

`@easyink/schema` 当前直接导出了这些常用能力：

- `validateSchema()`
- `validateSchemaIssues()`
- `isValidSchema()`
- `serializeSchema()`
- `deserializeSchema()`

如果你要做本地持久化、导入导出或服务端接收模板，这些入口比自己手写 JSON 检查更可靠。

## 兼容输入

Schema codec 里还包含对 benchmark 输入的解码逻辑。也就是说，兼容旧输入格式并不是靠文档约定，而是有明确代码路径去做字段映射。

如果你在做旧模板迁移，优先复用 codec，而不是在业务层自己手写转换。

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

`validateSchemaIssues()` 校验的是完整内部 Schema。宿主传入的宽松输入应该先经过 `normalizeDocumentSchema()`，否则缺少 `version`、`unit`、`page`、`guides` 或 `elements` 都会被视为校验问题。旧模板或外部持久化 JSON 应通过 `deserializeSchema()` 或 `MigrationRegistry` 处理，由这些入口读取并解释 `version`。

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
