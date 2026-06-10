---
description: Designer 数据绑定机制：将模板属性连接到运行时数据路径，支持设计时字段树与运行时数据分离。
---

# 数据绑定 {#data-binding}

Designer 里的数据绑定，本质上是在做一件很朴素的事：把模板里的某个属性，连到运行时数据里的某条路径上。

如果你先把“设计时字段树”和“运行时数据”分开理解，这一层就不会绕。

## 字段树定义 {#field-tree}

Designer 接收的是 `DataSourceDescriptor[]`。它决定左侧数据源面板长什么样，也决定用户能拖哪些字段。

```ts
import type { DataSourceDescriptor } from '@easyink/designer'

const dataSources: DataSourceDescriptor[] = [
  {
    id: 'order',
    name: '订单数据',
    fields: [
      { name: 'orderNo', path: 'orderNo', title: '订单号', use: 'text' },
      {
        name: 'customer',
        path: 'customer',
        title: '客户',
        fields: [
          { name: 'name', path: 'customer/name', title: '客户名称', use: 'text' },
          { name: 'phone', path: 'customer/phone', title: '联系电话', use: 'text' },
        ],
      },
      {
        name: 'items',
        path: 'items',
        title: '商品列表',
        tag: 'collection',
        fields: [
          { name: 'name', path: 'items/name', title: '商品名称', use: 'text' },
          { name: 'qty', path: 'items/qty', title: '数量', use: 'text' },
        ],
      },
    ],
  },
]
```

再把它传给 Designer：

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :data-sources="dataSources"
/>
```

上面这一步只是把字段树交给 Designer。它还没有产生任何运行时值。

## 哪些字段能拖拽 {#draggable-fields}

当前 Designer 的字段树有一个明确规则：叶子字段可以拖拽；带 `union` 的分组字段也可以拖拽。

```ts
const dataSources: DataSourceDescriptor[] = [
  {
    id: 'order',
    name: '订单数据',
    fields: [
      {
        name: 'items',
        path: 'items',
        title: '商品列表',
        fields: [
          { name: 'name', path: 'items/name', title: '商品名称', use: 'text' },
        ],
      },
      {
        name: 'summary',
        path: 'summary',
        title: '摘要组合',
        fields: [
          { name: 'orderNo', path: 'orderNo', title: '订单号', use: 'text' },
          { name: 'grandTotal', path: 'grandTotal', title: '合计金额', use: 'text' },
        ],
        union: [
          { path: 'orderNo', title: '订单号', use: 'text' },
          { path: 'grandTotal', title: '合计金额', use: 'text', offsetY: 8 },
        ],
      },
    ],
  },
]
```

上面这个例子里，`items` 只是分组节点，默认负责展开子字段；`summary` 虽然也可以带子语义，但因为配置了 `union`，Designer 会允许它作为“一次拖拽生成多个绑定节点”的入口。

## 拖拽处理 {#drag-binding}

先别急着想 Viewer。用户在画布里拖一个字段时，Designer 做的其实是把绑定信息写进模板。

可以把过程理解成这样：

```text
字段树里的一个 field
  -> 拖到元素上
  -> Designer 把 binding 写进对应节点
  -> schema 持久化下来
```

这也是为什么绑定是模板的一部分，而不是运行时的一次性状态。

## 普通绑定与 Data Contract {#binding-kinds}

大多数基础物料继续使用普通 `BindingRef`：

```ts
const textNode = {
  type: 'text',
  props: { content: '' },
  binding: {
    sourceId: 'order',
    fieldPath: 'customer/name',
    fieldLabel: '客户名称',
  },
}
```

这类绑定适合“一个字段值投影到一个 props”的场景，例如文本、图片、条码、二维码。这个字段值不要求一定是标量；物料如果声明 `primaryProp: 'option'`，也可以让数据源直接返回对象或 JSON 字符串，并由物料在 Viewer 中解释为完整配置。普通 `BindingRef` schema 继续可用。

chart-bar 这类结构化物料使用 `data-contract`。它的重点不是“字段按第几个槽位绑定”，而是：

- 物料声明目标数据模型，例如柱状图需要 `category` 和 `value`。
- 用户拖拽字段时，只是在填写“目标字段从哪个 source path 来”。
- Viewer 运行时由 Resolver 判断这些字段如何组成 records。

柱状图的节点 binding 示例：

```ts
const chartNode = {
  type: 'chart-bar',
  props: {
    barColor: '#2563eb',
    backgroundColor: '#ffffff',
  },
  binding: {
    kind: 'data-contract',
    mappings: {
      category: {
        sourceId: 'report',
        select: { path: 'monthlySales/month', label: '月份' },
      },
      value: {
        sourceId: 'report',
        select: { path: 'monthlySales/revenue', label: '销售额' },
      },
    },
    relation: { kind: 'auto' },
  },
}
```

注意这里保存的是完整 `select.path`。即使 Resolver 后续要从 `monthlySales` 这个集合里读 `month`，schema 里也不会把 `monthlySales/month` 截成 `month`。

## Data Contract 的运行时解析 {#data-contract-runtime}

`data-contract` 的默认关系是 `relation: { kind: 'auto' }`。它不会把解析模式写进 binding，而是在 Viewer 中根据 runtime data 推导：

```ts
viewer.open({
  schema,
  data: {
    monthlySales: [
      { month: '1月', revenue: 98 },
      { month: '2月', revenue: 112 },
    ],
  },
})
```

当 `category` 指向 `monthlySales/month`，`value` 指向 `monthlySales/revenue` 时，Resolver 会发现它们共享 `monthlySales` 这个数组父级，于是按 record collection 解析。

如果源数据是两个顶层数组：

```ts
viewer.open({
  schema,
  data: {
    category: ['1月', '2月'],
    values: [98, 112],
  },
})
```

对应 binding 可以写成：

```ts
binding: {
  kind: 'data-contract',
  mappings: {
    category: { sourceId: 'report', select: { path: 'category' } },
    value: { sourceId: 'report', select: { path: 'values' } },
  },
  relation: { kind: 'auto' },
}
```

Resolver 会按 index 对齐，生成两条目标记录。

如果你的运行时数据按 sourceId 分包，也可以这样传：

```ts
viewer.open({
  schema,
  data: {
    report: {
      monthlySales: [
        { month: '1月', revenue: 98 },
        { month: '2月', revenue: 112 },
      ],
    },
  },
})
```

Resolver 会优先尝试 `data[sourceId]`。但只有当完整 path 或它的父级集合能在 `data[sourceId]` 下解析时，才会使用这个 source-scoped root；否则会回退到全局 `data` 根。这样既支持按 sourceId 分组的数据，也支持真实数据直接放在顶层的输入。

设计态不会把“同集合”“顶层数组”“不同集合”“record mode”“index mode”暴露给用户。拖拽只负责填 mapping，关系判断属于 Resolver。

## `fieldPath` 约定 {#field-path}

到了运行时，Viewer 会统一解析节点上的绑定。

这里最重要的结论是：Viewer 按 `fieldPath` 从传入的 `data` 根对象里取值，不会再去看 Designer 的字段树。

先看一个最小心智模型：

```ts
const data = {
  customer: {
    name: 'Ada',
  },
}
```

如果节点上的绑定路径是 `customer/name`，Viewer 就会去读这条路径对应的值。

你可能会注意到普通绑定里还有 `sourceId`、`sourceName` 之类的信息。它们有用，但作用主要在设计时元数据和界面提示，不参与普通 `BindingRef` 的运行时根数据选择。

`fieldPath` 使用 `/` 分隔。解析时会从运行时 `data` 根对象开始逐段读取，也会避开 `__proto__`、`constructor` 这类危险路径。

## 稳定绑定约定 {#stable-binding}

写模板时，Designer 关心的是：

- 字段树怎么展示
- 字段拖到哪里
- 绑定信息怎么写回 Schema

渲染模板时，Viewer 关心的是：

- 当前节点有哪些绑定
- 这些绑定的 `fieldPath` 指向哪里
- 运行时 `data` 里能不能取到值

这意味着一件很重要的事：预览、打印和导出时，不要再把 `dataSources` 传给 Viewer。

对于 `data-contract` 物料也是一样：Viewer 只消费 schema 里的 `DataContractBinding` 和运行时 `data`，不读取 Designer 的字段树。字段树只帮助用户在设计时找到字段。

## 常用字段 {#field-properties}

第一次接入时，最常用的是这些：

| 字段 | 作用 |
| --- | --- |
| `name` | 内部名称 |
| `path` | 绑定路径 |
| `title` | 面板显示名称 |
| `fields` | 子字段 |
| `use` | 推荐的物料用途 |
| `tag` | 集合等语义提示 |

你当然还能继续往里放 `format`、`bindIndex`、`union` 之类更细的能力，但如果你现在只是先把绑定跑通，这些基础字段就足够了。

## 默认显示格式 {#default-format}

如果某个字段每次拖出去都应该按同一种方式展示，可以直接在字段上写 `format`。

```ts
const dataSources: DataSourceDescriptor[] = [
  {
    id: 'invoice',
    name: '发票数据',
    fields: [
      {
        name: 'grandTotal',
        path: 'grandTotal',
        title: '合计金额',
        use: 'text',
        format: {
          prefix: '￥',
          mode: 'preset',
          preset: {
            type: 'number',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        },
      },
    ],
  },
]
```

用户把 `grandTotal` 拖到文本、表格单元格或其他可绑定物料上时，Designer 会把这份格式复制到绑定里。

这里的关键词是“复制”。后面用户在属性面板里改显示格式，改的是模板里的 `BindingRef.format`，不会反写你的字段树。

属性面板是否显示“预设”或“自定义”格式 tab，由物料注册时的 `binding.formatEditor` 决定，而不是由字段树决定。例如文本可以开放 `preset/custom`，自定义 SVG 和 chart 类物料通常只开放 `custom`：

```ts
const textBinding = {
  kind: 'ordinary',
  primaryProp: 'content',
  formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' },
}

const svgBinding = {
  kind: 'ordinary',
  primaryProp: 'content',
  formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
}

const chartBinding = {
  kind: 'data-contract',
  contract: CHART_BAR_DATA_CONTRACT,
  formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
}
```

`data-contract` 的 custom formatter 会在 Resolver 生成目标 records 前应用；预设格式只有在物料明确声明支持时才应开放。

## 字段函数模板 {#custom-format-templates}

有时你不想直接给字段写死 `format`，而是想改变“自定义函数”里的默认示例。比如金额字段默认给一个金额函数，日期字段默认给一个中文日期函数。

这时把模板函数放到具体字段的 `displayFormat.customTemplates` 里：

```ts
const dataSources: DataSourceDescriptor[] = [
  {
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
              hint: '金额保留两位小数并添加人民币符号',
              source: `function transform(value, data) {
  var num = Number(value)
  if (isNaN(num)) return ''
  return '￥' + num.toFixed(2)
}`,
            },
            {
              id: 'invoice-money-total',
              label: '合计金额',
              hint: '金额保留两位小数并加上合计前缀',
              source: `function transform(value, data) {
  var num = Number(value)
  if (isNaN(num)) return ''
  return '合计 ￥' + num.toFixed(2)
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
              source: `function transform(value, data) {
  if (value == null || value === '') return ''
  var text = String(value)
  var match = text.match(/^(\\d{4})-(\\d{2})-(\\d{2})/)
  if (!match) return text
  return match[1] + '年' + match[2] + '月' + match[3] + '日'
}`,
            },
          ],
        },
      },
    ],
  },
]
```

用户选中 `grandTotal` 这个字段产生的绑定，再打开“显示格式”，切到“自定义”时，默认示例会被字段自己的函数替换。字段可以只有一个模板，也可以有多个模板；有多个时，Designer 会优先采用 `defaultCustomTemplateId` 指向的那一个。自定义函数接收两个参数：`value` 是当前字段值，`data` 是当前 Viewer 正在消费的完整运行时数据。

原来的内置示例不会全部消失。字段模板只替换“默认转换函数”这一类入口，后面的“原始值转字符串”“数值格式化为货币”“日期格式化 YYYY-MM-DD”等示例仍然保留，用户随时可以切回去。

你可能会有个疑问：为什么保存的是函数内容，而不是模板 ID？

原因是模板要能脱离 Designer 和字段树独立渲染。用户点确定后，最终写进 Schema 的仍然是 `BindingRef.format.custom.source`。之后字段树里的模板函数变了，已经保存的模板不会被悄悄改写。

:::tip 在线试一下
Playground 默认示例里的“流式发票”已经给发票金额、开票日期、税率这些字段加了各自的函数模板。打开示例后选中对应绑定字段，在属性面板里进入“显示格式”并切到“自定义”，就能看到字段自己的默认示例，同时还能看到其余内置示例。
:::

## 绑定判断标准 {#debugging}

当你调试绑定问题时，可以按这个顺序查：

1. Designer 里字段树是不是正确展示了。
2. 拖拽之后，Schema 里是不是写进了绑定信息。
3. 运行时传给 Viewer 的 `data`，是不是能命中相同的 `fieldPath`。

如果第三步对不上，再怎么改 Designer 侧字段树都不会生效。

关于数据绑定，目前先知道这些就够用了。接下来你可以继续看 [Viewer 概述](/viewer/) 或 [自动保存](./auto-save)。
