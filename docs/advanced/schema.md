# Schema 参考 {#schema}

Schema 是 EasyInk 的模板模型。Designer、Viewer、打印和导出最终都围绕同一份 Schema 工作。

先看一个最小输入：

```ts
import { normalizeDocumentSchema, validateSchemaIssues } from '@easyink/schema'

const schema = normalizeDocumentSchema({
  page: { width: 80 },
  elements: [],
})

const issues = validateSchemaIssues(schema)
```

归一化后，运行时拿到的是完整 `DocumentSchema`。宿主可以传宽松输入，但内部消费前应该先归一化。

## 输入和内部模型 {#input-vs-schema}

宿主通常传 `DocumentSchemaInput`：

```ts
const input = {
  page: {
    mode: 'continuous',
    width: 80,
    height: 200,
  },
}

const schema = normalizeDocumentSchema(input)
```

`DocumentSchemaInput` 允许省略很多顶层字段。`normalizeDocumentSchema()` 会补齐：

- `version`
- `unit`
- `page`
- `guides`
- `elements`
- 页面模式相关的 `pageModel`、`layout`、`pagination`、`reflow`

:::warning 注意
`version` 不属于宿主可指定输入。归一化会写入当前 Schema 版本。
:::

## 页面模式默认值 {#page-mode-defaults}

`page.mode` 会决定一组页面层默认配置：

```ts
const fixed = normalizeDocumentSchema({
  page: { mode: 'fixed', width: 210, height: 297 },
})

const continuous = normalizeDocumentSchema({
  page: { mode: 'continuous', width: 80, height: 200 },
})
```

当前默认值是：

| `mode` | `pageModel` | `layout` | `pagination` | `reflow` |
| --- | --- | --- | --- | --- |
| `fixed` | `paged-paper` | `absolute` | `fixed-sheets` | `measure-only` |
| `continuous` | `continuous-paper` | `stack-flow` | `none` | `flow-y` |

这就是为什么连续纸不能只改宽高。它还会切换布局、分页和回流策略。

## 校验和序列化 {#validation}

本地保存、导入导出和服务端接收模板时，优先用 schema 包里的入口：

```ts
import {
  deserializeSchema,
  isValidSchema,
  serializeSchema,
  validateSchemaIssues,
} from '@easyink/schema'

const json = serializeSchema(schema)
const restored = deserializeSchema(json)

if (!isValidSchema(restored)) {
  console.warn(validateSchemaIssues(restored))
}
```

常用能力包括：

- `validateSchema()`：返回字符串错误数组。
- `validateSchemaIssues()`：返回结构化问题，包含 `path`、`message` 和 `code`。
- `isValidSchema()`：类型守卫。
- `serializeSchema()` / `deserializeSchema()`：处理持久化 JSON。
- `isCompatibleVersion()`：判断版本是否兼容。

## 旧格式兼容 {#compat}

旧模板或外部输入不要在业务层手写字段映射。先交给 codec：

```ts
import { decodeBenchmarkInput } from '@easyink/schema'

const schema = decodeBenchmarkInput(legacyInput)
```

Schema codec 里包含 benchmark 输入的解码逻辑。兼容旧格式是明确代码路径，不是文档约定。普通 EasyInk JSON 仍然用 `deserializeSchema(json)`。

## 元素节点 {#material-node}

最常见的元素节点长这样：

```json
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
```

`type` 决定用哪个物料渲染，`x/y/width/height` 决定画布几何，`props` 保存物料自己的属性。

自定义物料也走同一套结构：

```ts
const node = {
  id: 'price-tag-1',
  type: 'price-tag',
  x: 20,
  y: 20,
  width: 48,
  height: 18,
  props: {
    label: '价格',
    amount: '¥ 99.00',
  },
}
```

只要 Designer 和 Viewer 都注册了同一个 `type`，这份节点就能被两边识别。

## 数据绑定字段 {#binding}

元素可以保存绑定引用：

```json
{
  "id": "total-text",
  "type": "text",
  "x": 20,
  "y": 20,
  "width": 60,
  "height": 10,
  "props": { "content": "" },
  "binding": {
    "sourceId": "invoice",
    "fieldPath": "summary/total",
    "fieldLabel": "合计"
  }
}
```

Designer 负责把绑定写进节点。Viewer 在 `open({ schema, data })` 时解析绑定，然后把结果交给物料渲染器。

## 表格节点 {#table-node}

表格节点在 `MaterialNode` 外多了 `table` 属性：

```ts
interface TableNode extends MaterialNode {
  type: 'table-static' | 'table-data'
  table: TableSchema
}

interface TableSchema {
  kind: 'static' | 'data'
  topology: TableTopologySchema
  layout: TableLayoutConfig
  diagnostics?: LayoutDiagnostic[]
}
```

单元格绑定保存在 cell 上：

```ts
interface TableCellSchema {
  rowSpan?: number
  colSpan?: number
  content?: {
    text?: string
    elements?: MaterialNode[]
    editMode?: 'inline-text' | 'rich-text' | 'hosted'
  }
  props?: Record<string, unknown>
  binding?: BindingRef
  staticBinding?: BindingRef
}
```

`table-data` 通常用 `binding` 表示数据行字段。`table-static` 可以用 `staticBinding` 表示独立单元格绑定。

## 动画字段 {#animation}

动画挂在元素的可选字段里：

```ts
interface AnimationSchema {
  trigger: string
  type: string
  duration?: number
  delay?: number
  options?: Record<string, unknown>
}
```

目前先把它理解成“元素上的播放配置”就够了。不同运行时可以按自己的能力消费这份配置。

## 工具函数 {#helpers}

常用工具可以按用途记：

```ts
import {
  createDefaultGuides,
  createDefaultPage,
  createDefaultSchema,
  getNodeProps,
  isCompatibleVersion,
  isTableDataNode,
  isTableNode,
  normalizeDocumentSchema,
  validateSchemaIssues,
} from '@easyink/schema'
```

它们大致分三类：

- 默认值：`createDefaultSchema()`、`createDefaultPage()`、`createDefaultGuides()`。
- 类型和访问：`isTableNode()`、`isTableDataNode()`、`getNodeProps<T>()`。
- 校验和兼容：`validateSchemaIssues()`、`isCompatibleVersion()`、`normalizeDocumentSchema()`。

## 完整示例 {#full-example}

一份固定 A4 模板可以这样写：

```json
{
  "version": "1.0.0",
  "unit": "mm",
  "page": {
    "mode": "fixed",
    "width": 210,
    "height": 297,
    "pageModel": {
      "kind": "paged-paper",
      "paper": { "width": 210, "height": 297 }
    },
    "layout": { "strategy": "absolute" },
    "pagination": { "strategy": "fixed-sheets" },
    "reflow": { "strategy": "measure-only" }
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

如果你手写的是宽松输入，不必把所有默认层都写出来。交给 `normalizeDocumentSchema()` 补齐即可。

关于 Schema，目前知道这些就够用了。自定义物料如何保存自己的节点，可以继续看 [自定义物料开发](/advanced/custom-materials)。
