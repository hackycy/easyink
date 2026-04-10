# 8. 数据源系统

EasyInk 的数据源系统是一条独立主线，不是 Designer 的字段树配件。第一轮文档已经把它从 UI 附属物里抽出来了，第二轮修订要解决的是协议深度不够的问题。

## 8.1 目标

数据源系统要同时满足五种用途：

- 字段树展示与搜索
- 拖拽创建和拖拽绑定
- 运行时取数与预览回放
- 批量投放和多参数绑定
- 显示格式、聚合规则和推荐物料

## 8.2 规范协议

```typescript
interface DataSourceDescriptor {
  id: string
  name: string
  tag?: string
  title?: string
  icon?: string
  expand?: boolean
  headless?: boolean
  fields: DataFieldNode[]
  meta?: Record<string, unknown>
}

interface DataFieldNode {
  name: string
  key?: string
  path?: string
  title?: string
  id?: string
  tag?: string
  use?: string
  props?: Record<string, unknown>
  bindIndex?: number
  union?: DataUnionBinding[]
  expand?: boolean
  fields?: DataFieldNode[]
  meta?: Record<string, unknown>
}

interface DataUnionBinding {
  name?: string
  key?: string
  path?: string
  title?: string
  id?: string
  tag?: string
  use?: string
  offsetX?: number
  offsetY?: number
  props?: Record<string, unknown>
}
```

为什么补充 `title / id / tag`：

- 对标产品公开数据里已经出现这些字段
- 这类字段不能被当成“偶然噪音”删除，否则导入导出会丢信息
- 它们既服务字段树展示，也服务后续推荐创建和调试信息

## 8.3 对标输入与规范化

对标产品输入里，字段节点既可能只有 `name + key`，也可能额外带：

- `use`
- `props`
- `union`
- `bindIndex`
- `title`
- `id`
- `tag`

EasyInk 的做法应是：

- 用 `normalizeDataSource()` 统一把 `key` 转成规范 `path`
- 保留原始字段到 `meta` 或兼容态，而不是静默丢掉
- 对仅有 `key` 的节点，规范路径默认取 `key`

## 8.4 字段语义

| 字段 | 语义 | 用途 |
| --- | --- | --- |
| `id` | 数据源或字段的稳定标识 | 绑定、诊断、缓存 |
| `name` | 主要展示名称 | 字段树、属性面板 |
| `title` | 备选展示名或分组标题 | 字段树说明、批量投放标题 |
| `tag` | 数据接口或数据源类别标识 | 运行时适配器匹配 |
| `key` | 原始字段 key | 导入兼容 |
| `path` | 规范路径 | 绑定、运行时解析 |
| `use` | 推荐物料或物料模板 token | 拖拽创建 |
| `props` | 创建默认属性 | 拖拽创建 |
| `union` | 一拖多投放方案 | 批量生成 |
| `bindIndex` | 多参数绑定位次 | BWIP、函数、公式等 |
| `expand` | 默认展开状态 | 字段树 UI |
| `headless` | 不作为独立显示根节点 | UI/兼容 |

## 8.5 `use` 不是注释，而是物料推荐协议

`use` 的职责是告诉 Designer：当用户拖拽这个字段到画布或空白区时，优先创建什么物料。

推荐做法：

```typescript
type MaterialUseToken =
  | 'text'
  | 'image'
  | 'barcode'
  | 'qrcode'
  | 'rich-text'
  | 'chart/*'
  | 'svg/*'
  | 'relation/*'
  | string
```

说明：

- EasyInk 内部要支持明确的 use registry
- 对标产品里的历史 token 可以原样导入，但必须通过 registry 映射到 EasyInk 物料定义
- 不能把 `use` 当成一段任意脚本或任意组件路径

## 8.6 批量投放 `union`

参考对标产品的 `receipt` 示例，字段节点可声明 `union`：

- 主字段拖拽时先创建主元素
- `union` 子项按相对偏移继续创建附属元素
- 每个子项可带自己的推荐物料和默认 props

```typescript
const receiptField: DataFieldNode = {
  name: '基础数据批量添加',
  path: 'base/name',
  use: 'text',
  props: { width: 240, height: 30, size: 18 },
  union: [
    {
      name: '创建时间',
      path: 'base/time',
      use: 'text',
      offsetX: 0,
      offsetY: 40,
      props: { width: 150, height: 20 },
    },
    {
      name: '收银员',
      path: 'base/cashier',
      use: 'text',
      offsetX: 160,
      offsetY: 40,
      props: { width: 80, height: 20 },
    },
  ],
}
```

设计约束：

- `union` 是数据源协议的一部分，不是某个物料包的私有技巧
- 偏移量以主元素左上角为参照坐标系
- 默认 props 只提供创建初值，不覆盖用户后续编辑结果

## 8.7 多参数绑定 `bindIndex`

参考 BWIP 示例，一个字段组可服务同一个物料的多个输入槽位：

- 内容
- 格式
- 参数

```typescript
const bwipFields: DataFieldNode[] = [
  { name: 'BWIP内容', path: 'text', use: 'barcode', bindIndex: 0 },
  { name: 'BWIP格式', path: 'format', use: 'barcode', bindIndex: 1 },
  { name: 'BWIP参数', path: 'params', use: 'barcode', bindIndex: 2 },
]
```

设计约束：

- `bindIndex` 只解决“同一个物料有多个数据输入”的问题
- 绑定顺序必须稳定，不能依赖字段树视觉顺序推断
- 属性面板需要能可视化当前槽位的绑定关系

## 8.8 绑定引用与字段树分离

字段树不整体写入 Schema，但绑定会保存引用元数据：

- `sourceId`
- `sourceTag`
- `fieldPath`
- `fieldLabel`
- `usage`
- `bindIndex`

也就是说：

- Designer 通过字段树帮助绑定
- 模板通过绑定引用保持可回放性
- Viewer 通过 `sourceId / sourceTag` 找到实际数据适配器

## 8.9 数据适配器

Viewer 不应该假设数据一定是一个已经预处理好的扁平对象。它应该允许宿主接入适配器：

```typescript
interface DataAdapter {
  id: string
  match(source: DataSourceDescriptor): boolean
  load(source: DataSourceDescriptor, context: DataLoadContext): Promise<unknown>
}
```

这让 EasyInk 可以支持：

- 本地 mock 数据
- HTTP 请求
- 业务端传入内存对象
- 模板库样例数据
- 预览器 iframe 中的独立数据加载

## 8.10 路径与格式规则

### 路径规则

- 规范路径分隔符使用 `/`
- 导入层兼容 `.` 路径和仅 `key` 的老格式
- 对数组字段，集合节点路径指向集合本身，子字段路径指向相对字段
- 容器、对象、数组都可以通过嵌套路径表达
- 路径的相对/绝对语义由上下文隐式决定：repeat-template 行内单元格的 fieldPath 为相对路径，其他行内单元格为绝对路径。不在路径字符串本身添加前缀标记

### `resolveBindingValue` 的 scope 参数

`resolveBindingValue` 支持可选的 `scope` 参数，用于相对路径解析：

```typescript
function resolveBindingValue(
  binding: BindingRef,
  data: Record<string, unknown>,
  scope?: Record<string, unknown>
): unknown
```

- 当 `scope` 存在时，`fieldPath` 从 `scope` 对象开始遍历（相对路径语义）
- 当 `scope` 不存在时，`fieldPath` 从 `data` 根开始遍历（绝对路径语义）
- 调用方（ViewerRuntime）根据行 role 决定是否传入 scope

### 格式规则

- `usage` 表达数字格式化、前后缀、日期格式、聚合等安全声明式能力
- 不支持模板内直接写任意脚本

## 8.11 data-table 绑定模型

`data-table` 采用表级主数据源 + cell 相对绑定的模型。`TableDataSchema.source` 是整个表格的唯一数据入口，指向集合字段。

### 主数据源

```typescript
// table.source: BindingRef 指向集合字段
const tableSource: BindingRef = {
  sourceId: 'receipt',
  sourceTag: 'apis/receipt.json',
  fieldPath: 'orders/items',  // 集合字段路径
  fieldLabel: '订单明细',
}
```

- `source.fieldPath` 指向数据源中的数组节点，Viewer 从此路径取出集合数据
- 整表严格单源：所有 cell 的 `binding.sourceId` 必须与 `source.sourceId` 一致
- 每个表格只支持一个集合数据源，不支持多组 repeat-template 绑定不同集合

### cell 绑定约束

绑定路径按行角色区分语义：

- **repeat-template 行内的单元格**：`fieldPath` 使用相对路径，相对于 `table.source.fieldPath` 集合项解析。例如 `source.fieldPath` 为 `orders/items`，单元格的 `fieldPath` 为 `name`，Viewer 展开时解析为 `orders/items[i]/name`
- **header / footer / normal 行内的单元格**：`fieldPath` 使用绝对路径，从数据源根解析。例如 footer 行汇总单元格绑定 `orders/totalAmount`
- 路径的相对/绝对语义由所在行的 `role` 隐式决定，不在 `BindingRef` 上添加额外字段。`resolveBindingValue` 接收可选的 `scope` 参数：当 scope 存在时按相对路径解析，否则按绝对路径从根解析
- 聚合规则通过 `binding.usage` 声明（如求和、计数），不通过 fieldPath 本身表达

### cell binding 存储策略

- cell.binding 使用完整 BindingRef 类型，但 sourceId 自动从 table.source 填充
- 拖入字段时 Designer 自动设置 sourceId/sourceTag，用户只需关心字段名（fieldPath）
- cell.binding 为单值 BindingRef，不支持数组（cell 为纯文本，无多参数绑定场景）

### 首次拖入自动设置 source

- 向空表格（无 source）拖入第一个字段时，Designer 自动将该字段所属数据源设为 table.source
- 后续拖入的字段如果不属于当前 source 的 sourceId，拒绝拖入并显示提示
- source.fieldPath 的设置逻辑：
  - 如果拖入的字段是集合节点的子字段（例如从 `orders/items` 下拖入 `name`），自动将集合节点路径设为 source.fieldPath
  - 如果拖入的字段不在集合节点下，source.fieldPath 留空，表格不产生 repeat 行为

### 解除绑定

- 解除 table.source 时，清除所有 cell 的 binding，通过 CompositeCommand 打包实现，支持整体 undo
- 更换 source 等价于先解除再重新绑定

## 8.12 table-static 独立绑定模型

> **v2 新增**：详见 [23-table-v2-redesign](./23-table-v2-redesign.md)

table-static 原本不支持数据源绑定（`bindable=false`）。v2 重设计后，table-static 支持单元格级独立绑定，与 table-data 的表级严格单源模型完全不同。

### 绑定字段

table-static 使用 `cell.staticBinding`（而非 `cell.binding`），类型复用 `BindingRef`：

```typescript
// table-static cell 绑定示例
const cell: TableCellSchema = {
  content: { text: '' },
  staticBinding: {
    sourceId: 'order',
    fieldPath: 'customer/name',
    fieldLabel: '客户姓名',
  },
}
```

### 与 table-data binding 的差异

| | table-static staticBinding | table-data binding |
|---|---|---|
| 约束 | 无表级 source 约束，每 cell 可绑不同 sourceId | 严格单源，所有 cell 的 sourceId 必须与 table.source 一致 |
| 路径语义 | 绝对路径，从数据源根解析 | repeat-template 行相对路径，其他行绝对路径 |
| 集合展开 | 不展开，单值解析 | repeat-template 行按集合数据逐项展开 |
| 与 content 关系 | 互斥。有 staticBinding 时文本由数据源填充，清除后恢复手动编辑 | repeat-template 行不允许手动编辑，header/footer 行互斥 |

### Viewer 解析

Viewer 的 `resolveAllBindings` 阶段检测到 table-static 节点时：

1. 遍历所有行的所有 cell，查找 `staticBinding` 字段
2. 对每个有 `staticBinding` 的 cell，调用 `resolveBindingValue(staticBinding, data)`（绝对路径，无 scope）
3. 结果存入 `ResolvedCellBindings`，key 格式 `${nodeId}:${rowIndex}:${colIndex}`

### Designer 交互

- 拖拽字段到 table-static cell 时，直接写入 `cell.staticBinding`，无需检查表级 source
- 属性面板显示当前 cell 的绑定字段标签，提供"清除绑定"操作
- 设计态渲染：有 staticBinding 的 cell 显示 `{#fieldLabel}`，无 staticBinding 的 cell 显示手动编辑的 content.text

### 命令

- `BindStaticCellCommand`：设置 `cell.staticBinding`，同时清除 `cell.content.text`
- `ClearStaticCellBindingCommand`：清除 `cell.staticBinding`，恢复 cell 为可手动编辑状态

## 8.13 Designer 与 Viewer 共享协议

新的原则是：

- Designer 不独占数据源协议
- Viewer 不绕开数据源协议

这样才能保证：

- 设计时看到的字段树与预览时加载的数据是一致的
- 模板在脱离 Designer 后仍能独立回放
- `union`、`bindIndex`、`use` 不会只在设计态存在、运行态失真
