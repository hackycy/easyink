# 8. 数据源系统

EasyInk 的数据源系统是 Designer 专属的设计时基础设施，负责字段树展示、命名空间管理和拖拽绑定。Viewer 不依赖数据源系统，只消费 `schema + data`。

## 8.1 目标

数据源系统满足以下用途：

- 字段树展示与搜索
- 拖拽创建和拖拽绑定
- 批量投放和多参数绑定
- 推荐物料
- **外部数据源注册（运行时动态注册）**
- **MCP 数据源集成**

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

interface DataFieldDisplayFormatConfig {
  customTemplates?: DataFieldCustomFormatTemplate[]
  defaultCustomTemplateId?: string
}

interface DataFieldCustomFormatTemplate {
  id: string
  label: string
  source: string
  hint?: string
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
  format?: BindingDisplayFormat
  displayFormat?: DataFieldDisplayFormatConfig
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
  format?: BindingDisplayFormat
}
```

## 8.3 运行时数据源注册

### 8.3.1 Provider Factory 模式

数据源系统支持通过 `DataSourceProviderFactory` 接口在运行时动态注册外部数据源：

```typescript
// @easyink/datasource

interface DataSourceProviderFactory {
  readonly id: string           // 数据源唯一标识
  readonly namespace: string   // 命名空间（如 '__ai__'）
  resolve(): Promise<DataSourceDescriptor>
}
```

### 8.3.2 DataSourceRegistry 扩展

`DataSourceRegistry` 真实提供的方法如下：

```typescript
class DataSourceRegistry {
  registerSource(source: DataSourceDescriptor): void
  unregisterSource(id: string): void
  registerProviderFactory(factory: DataSourceProviderFactory): void
  registerAsync(id: string, sourceOrFactory: DataSourceDescriptor | DataSourceProviderFactory, namespace?: string): Promise<void>
  getSource(id: string): Promise<DataSourceDescriptor | undefined>
  getSourceSync(id: string): DataSourceDescriptor | undefined
  getSources(): DataSourceDescriptor[]
  getAllSources(): DataSourceDescriptor[]
  getSourcesByNamespace(namespace: string): DataSourceDescriptor[]
  findSourceByName(name: string): DataSourceDescriptor | undefined
  getProviderFactories(): DataSourceProviderFactory[]
  clear(): void
  onSourcesChange(callback: DataSourceChangeCallback): () => void
}
```

### 8.3.3 命名空间隔离

数据源系统支持命名空间隔离，通过 `namespace` 字段区分不同来源的数据源：

```typescript
// @easyink/datasource

// AI 驱动数据源隐式使用 '__ai__' 命名空间
export const AI_NAMESPACE = '__ai__'
export const DEFAULT_NAMESPACE = 'default'

// 工具函数
export function isMcpNamespace(ns?: string): boolean
export function getNamespacedId(id: string, namespace?: string): string
export function parseNamespacedId(fullId: string): { namespace: string, id: string } | null
```

命名空间隔离规则：

| 命名空间 | 来源 | 说明 |
|---|---|---|
| `default` | 用户手动注册 | 默认命名空间 |
| `__ai__` | AI / contribution 生成 | 隐式分配，不可指定 |

### 8.3.4 注册流程

```typescript
// 方式一：直接注册（同步）
registry.registerSource({
  id: 'my-datasource',
  name: 'My Data Source',
  fields: [...]
})

// 方式二：Provider Factory 注册（异步）
registry.registerProviderFactory({
  id: 'mcp-datasource-1',
  namespace: '__ai__',
  async resolve() {
    // 动态获取数据源
    const response = await fetch('https://api.example.com/fields')
    return response.json()
  }
})

// 方式三：混合注册
await registry.registerAsync('dynamic-ds', {
  id: 'dynamic-ds',
  name: 'Dynamic Source',
  fields: [...]
})
```

## 8.4 对标输入与规范化

对标产品输入里，字段节点既可能只有 `name + key`，也可能额外带：

- `use`
- `props`
- `union`
- `bindIndex`
- `title`
- `id`
- `tag`

EasyInk 的做法应是：

- 用 `normalizeDataSource()` 统一把输入归一化到 `DataSourceDescriptor`
- 保留原始字段到 `meta` 或兼容态，而不是静默丢掉
- 对仅有 `key` 的节点，规范路径默认取 `key`

## 8.5 字段语义

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
| `format` | 字段默认显示格式 | 拖拽绑定时复制到 `BindingRef.format` |
| `displayFormat` | 字段级显示格式模板配置 | 为该字段的绑定格式编辑器提供自定义函数示例 |
| `union` | 一拖多投放方案 | 批量生成 |
| `bindIndex` | 多参数绑定位次 | BWIP、函数、公式等 |
| `expand` | 默认展开状态 | 字段树 UI |
| `headless` | 不作为独立显示根节点 | UI/兼容 |
| `namespace` | 数据源命名空间 | AI / 外部适配器隔离、权限控制 |

## 8.6 `use` 不是注释，而是物料推荐协议

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
  | string
```

说明：

- EasyInk 内部要支持明确的 use registry
- 对标产品里的历史 token 可以原样导入，但必须通过 registry 映射到 EasyInk 物料定义
- 不能把 `use` 当成一段任意脚本或任意组件路径

## 8.7 批量投放 `union`

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
- `format` 是字段建议，不是动态引用；拖拽后固化到绑定，保证模板在数据源字段配置变化后仍可稳定回放
- `displayFormat` 是字段级设计时能力，只影响 Designer 创建或编辑该字段绑定显示格式时的模板候选，不进入 Viewer 运行时依赖

## 8.8 显示格式默认值

字段节点可以声明默认显示格式，用于减少重复配置：

```typescript
const amountField: DataFieldNode = {
  name: 'amount',
  title: '金额',
  path: 'amount',
  use: 'text',
  format: {
    prefix: '￥',
    fallback: '--',
    mode: 'preset',
    preset: { type: 'number', minimumFractionDigits: 2, maximumFractionDigits: 2 },
  },
}
```

拖拽规则：

- 普通元素绑定复制到 `element.binding.format`
- `table-data` repeat-template 单元格复制到 `cell.binding.format`
- `table-static` 或非 repeat 行单元格复制到 `cell.staticBinding.format`
- 后续用户在属性面板修改绑定格式，只修改模板绑定，不反写数据源字段树

### 8.8.1 字段级自定义格式模板

字段级 `format` 解决的是“这个字段拖出去时直接带什么显示格式”。但有些字段更适合提供一组自定义函数示例，让用户在属性面板里按需采用，例如发票金额、业务状态码、行业日期码等。此时应由具体字段声明 `displayFormat.customTemplates`，供 Designer 的绑定格式编辑器采用：

```typescript
const invoiceSource: DataSourceDescriptor = {
  id: 'invoice',
  name: '发票数据',
  fields: [
    {
      name: 'grandTotal',
      path: 'grandTotal',
      title: '合计金额',
      use: 'text',
      displayFormat: {
        defaultCustomTemplateId: 'invoice-money',
        customTemplates: [
          {
            id: 'invoice-money',
            label: '发票金额',
            hint: '金额转人民币展示',
            source: `(value) => {
  var num = Number(value)
  if (isNaN(num)) return ''
  return num.toFixed(2)
}`,
          },
          {
            id: 'invoice-money-total',
            label: '合计金额',
            source: `(value) => {
  var num = Number(value)
  if (isNaN(num)) return ''
  return '合计 ' + num.toFixed(2)
}`,
          },
        ],
      },
    },
    {
      name: 'date',
      path: 'invoice/date',
      title: '开票日期',
      use: 'text',
      displayFormat: {
        defaultCustomTemplateId: 'invoice-date-cn',
        customTemplates: [
          {
            id: 'invoice-date-cn',
            label: '中文开票日期',
            source: `(value) => String(value ?? '')`,
          },
        ],
      },
    },
  ],
}
```

Designer 的采用规则：

1. 打开某个绑定的显示格式配置时，根据 `BindingRef.sourceId + fieldPath/fieldKey` 从 `DataSourceRegistry` 同步定位具体 `DataFieldNode`。
2. 如果该字段存在可用的 `displayFormat.customTemplates`，自定义函数编辑器用字段模板替换内置“默认转换函数”入口，同时保留其余内置示例。
3. 用户从“预设”切换到“自定义”且当前绑定还没有 `format.custom.source` 时，优先使用 `defaultCustomTemplateId` 对应的模板；若默认模板不存在，则使用第一个可用模板。
4. 如果字段没有模板配置，回退到 Designer 内置默认模板。
5. 用户保存后，最终写入 Schema 的仍是 `BindingRef.format.custom.source`，而不是模板 ID。

设计约束：

- `customTemplates` 是“模板种子”和“编辑器示例”，不是运行时动态引用。保存后的模板必须能脱离 `DataSourceDescriptor` 和 `DataFieldNode` 独立回放。
- `source` 的语义与 `BindingDisplayFormat.custom.source` 完全一致：可信、同步、当前值转换函数，不应依赖 DOM、网络、异步副作用或完整数据源描述符。
- Designer 不按字段类型自动猜测应该采用哪个模板。字段级默认值仍使用 `DataFieldNode.format`；字段级模板只改变用户编辑自定义函数时可选和默认的函数来源。
- 字段配置变化不会自动重写既有 `BindingRef.format`。如需批量迁移，必须通过显式命令或宿主侧迁移流程完成。

## 8.9 多参数绑定 `bindIndex`

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

- `bindIndex` 只解决"同一个物料有多个数据输入"的问题
- 绑定顺序必须稳定，不能依赖字段树视觉顺序推断
- 属性面板需要能可视化当前槽位的绑定关系

## 8.10 绑定引用与字段树分离

字段树不整体写入 Schema，但绑定会保存引用元数据：

- `sourceId`
- `sourceName`（稳定命名，用于 datasource 替换后的重匹配）
- `sourceTag`
- `fieldPath`
- `fieldLabel`
- `bindIndex`
- `format`

也就是说：

- Designer 通过字段树帮助绑定
- 模板通过绑定引用保持可回放性；显示格式最终固化在 `BindingRef.format`
- Viewer 通过 `fieldPath` 直接从运行时 `data` 根对象解析值，不依赖数据源系统
- `sourceId / sourceName / sourceTag` 是设计时重匹配、诊断和模板可读性元数据，不是 Viewer 的运行时数据选择器
- Viewer 不接受 `dataSources`，不根据数据源描述符评分、匹配、分包、重构 `data`，也不读取字段级 `displayFormat.customTemplates`

## 8.11 绑定解析函数

绑定解析是通用能力，位于 `@easyink/core` 包，供 Viewer 和物料包使用：

```typescript
// @easyink/core

function resolveBindingValue(
  binding: BindingRef,
  data: Record<string, unknown>
): unknown

function resolveNodeBindings(
  bindings: BindingRef | BindingRef[],
  data: Record<string, unknown>
): Map<number, unknown>
```

Viewer 不做异步数据加载，宿主负责在调用 `viewer.open({ schema, data })` 前准备好数据。

如果宿主确实有多个业务接口，宿主必须在调用 Viewer 前自行合并为模板 `fieldPath` 可直接命中的数据结构，或先转换 Schema 绑定路径。Viewer 不猜测哪个接口对应哪个 `sourceId`。

## 8.12 路径与格式规则

### 路径规则

- 规范路径分隔符使用 `/`
- 导入层兼容 `.` 路径和仅 `key` 的老格式
- 对数组字段，集合节点路径指向集合本身，子字段路径指向集合内的叶子字段
- 容器、对象、数组都可以通过嵌套路径表达
- **所有 fieldPath 均为绝对路径**，从 Viewer 收到的运行时 `data` 根对象开始。repeat-template 行内 cell 的 fieldPath 也是绝对路径（如 `items/name`），不再存在相对路径语义
- 集合前缀在运行时由 `extractCollectionPath()` 从同行 cell 的 fieldPath 中提取公共部分，再通过 `Array.isArray` 确认

### `resolveBindingValue` 接口

`resolveBindingValue`（位于 `@easyink/core`）统一按绝对路径从数据根解析，不再接受 `scope` 参数：

```typescript
function resolveBindingValue(
  binding: BindingRef,
  data: Record<string, unknown>
): unknown
```

- `fieldPath` 始终从 `data` 根开始遍历（绝对路径语义）
- `sourceId` 与 `sourceTag` 不参与运行时查找
- repeat-template 行的叶子字段值通过专用函数 `resolveFieldFromRecord(leafField, record)` 从集合项中解析，leafField 为 fieldPath 去掉集合前缀后的剩余部分

### 集合路径推导工具函数

`@easyink/core` 包提供两个运行时工具函数：

```typescript
/** 从一组绝对路径中提取公共集合前缀。
 *  例如 ['items/name', 'items/price'] -> 'items'
 *  若路径无公共前缀或仅有一个路径，返回该路径去掉末段的结果。 */
function extractCollectionPath(fieldPaths: string[]): string

/** 从集合数据项中解析叶子字段值。
 *  leafField 为去掉集合前缀后的相对字段名（如 'name'、'detail/sku'）。
 *  record 为集合数组中的单个数据项。 */
function resolveFieldFromRecord(leafField: string, record: Record<string, unknown>): unknown
```

### 格式规则

- 当前不支持格式化能力，后续独立设计
- 不支持模板内直接写任意脚本

## 8.13 data-table 绑定模型

`data-table` 采用 cell 级绝对路径绑定 + 同行同集合约束的模型。不再持有表级 `source` 字段，集合路径由 Viewer 在运行时从 repeat-template 行各 cell 的 fieldPath 公共前缀推导。

### repeat-template 行 cell 绑定

```typescript
// repeat-template 行内 cell 绑定示例（绝对路径）
const cell: TableCellSchema = {
  content: { text: '' },
  binding: {
    sourceId: 'receipt',
    sourceTag: 'apis/receipt.json',
    fieldPath: 'items/name',     // 绝对路径，从数据源根开始
    fieldLabel: '商品名称',
  },
}
```

- `fieldPath` 为绝对路径（如 `items/name`、`items/price`），从数据源根开始
- 同一 repeat-template 行内所有 cell 的 fieldPath 必须共享相同的集合前缀（如 `items`），Designer 在拖拽时通过 `getFieldCollectionPrefix()` 逐 cell 校验此约束
- 每个 cell 各自持有 sourceId/sourceTag，不存在表级 source 的自动继承

### header / footer / normal 行 cell 绑定

header、footer 和 normal 行的单元格使用 `staticBinding`（与 table-static 共用同一机制），不使用 `binding` 字段：

```typescript
// header 行内 cell 绑定示例
const headerCell: TableCellSchema = {
  content: { text: '' },
  staticBinding: {
    sourceId: 'order',
    fieldPath: 'customer/name',
    fieldLabel: '客户姓名',
  },
}
```

- `staticBinding.fieldPath` 为绝对路径，从数据源根解析
- 无集合展开，单值解析
- 每个 cell 可绑定不同 source 的字段，无表级 source 约束
- 与手动编辑互斥：有 staticBinding 时文本由数据源填充，清除后恢复手动编辑

### 集合路径运行时推导

Viewer 不再从 `table.source` 读取集合路径，而是在运行时推导：

1. 收集 repeat-template 行内所有 cell 的 `binding.fieldPath`
2. 调用 `extractCollectionPath(fieldPaths)` 提取公共集合前缀（如从 `['items/name', 'items/price']` 提取 `items`）
3. 用该路径从数据中取值，通过 `Array.isArray` 确认其为集合数组
4. 遍历集合数组，对每个数据项使用 `resolveFieldFromRecord(leafField, record)` 解析叶子字段值

### 同行同集合约束

- 同一 repeat-template 行内所有 cell 的 fieldPath 必须属于同一集合（共享集合前缀）
- 此约束由 Designer 在拖拽时强制：`getFieldCollectionPrefix()` 检查新拖入字段的集合前缀是否与已有 cell 一致，不一致则拒绝拖入并提示
- Viewer 运行时不做额外校验，直接从 `extractCollectionPath()` 结果工作

### 拖拽绑定交互

- repeat-template 行的单元格：拖入字段时通过 `context.tx.run()` 设置 `cell.binding`
- header / footer / normal 行的单元格：拖入字段时通过 `context.tx.run()` 设置 `cell.staticBinding`
- 不存在首次拖入自动设置 source 的流程，每个 cell 独立绑定

### 解除绑定

- repeat-template 行 cell：通过 `tx.run()` 清除 `cell.binding`
- header / footer / normal 行 cell：通过 `tx.run()` 清除 `cell.staticBinding`
- 不存在解除 table.source 的整表清除流程

## 8.14 table-static 独立绑定模型

table-static 支持单元格级独立绑定。table-data 的 header/footer/normal 行也复用同一机制。

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

### 与 table-data repeat-template binding 的差异

| | staticBinding (table-static + table-data header/footer) | table-data repeat-template binding |
|---|---|---|
| 约束 | 无集合前缀约束，每 cell 可绑不同 sourceId | 同一行内所有 cell 的 fieldPath 必须共享相同的集合前缀 |
| 路径语义 | 绝对路径，从数据源根解析 | 绝对路径，从数据源根解析（运行时由 extractCollectionPath 提取集合前缀） |
| 集合展开 | 不展开，单值解析 | repeat-template 行按集合数据逐项展开 |
| 与 content 关系 | 互斥。有 staticBinding 时文本由数据源填充，清除后恢复手动编辑 | repeat-template 行不允许手动编辑 |

### Viewer 解析

Viewer 的 `resolveAllBindings` 阶段检测到 table-static 节点时：

1. 遍历所有行的所有 cell，查找 `staticBinding` 字段
2. 对每个有 `staticBinding` 的 cell，调用 `resolveBindingValue(staticBinding, data)`（来自 `@easyink/core`，绝对路径）
3. 结果存入 `ResolvedCellBindings`，key 格式 `${nodeId}:${rowIndex}:${colIndex}`

### Designer 交互

- 拖拽字段到 table-static cell 时，直接写入 `cell.staticBinding`，无需检查表级 source
- 拖拽字段到 table-data 的 header/footer cell 时，同样写入 `cell.staticBinding`
- 属性面板显示当前 cell 的绑定字段标签，提供"清除绑定"操作
- 设计态渲染：有 staticBinding 的 cell 显示 `{#fieldLabel}`，无 staticBinding 的 cell 显示手动编辑的 content.text

### 命令

所有表格绑定操作均通过 `TransactionAPI.run()` 实现，自动产生 `PatchCommand` 进入历史栈（见 [22 章](./22-editing-behavior.md)）。

## 8.15 Designer 与 Viewer 的边界

核心原则：

- `@easyink/datasource` 是 Designer 专属包，Viewer 不依赖它
- Viewer 只消费 `schema + data`，通过 `@easyink/core` 的绑定解析函数从数据中取值
- 绑定解析函数（`resolveBindingValue`、`extractCollectionPath`、`resolveFieldFromRecord`）位于 `@easyink/core`，Designer 和 Viewer 均可使用
- 字段级显示格式模板只服务 Designer 的格式编辑体验；Viewer 只执行已经固化到 `BindingRef.format` 的格式规则

这样保证：

- 设计时看到的字段树与预览时加载的数据是一致的
- 模板在脱离 Designer 后仍能独立回放
- Viewer 无需理解数据源协议，只需理解 BindingRef + 数据对象
