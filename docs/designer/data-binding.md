# 数据绑定

数据绑定将 Schema 中的元素属性连接到运行时数据。用户通过拖拽数据源字段到元素上完成绑定，Viewer 渲染时按 `fieldPath` 从宿主传入的 `data` 根对象取值。

## 数据源定义

通过 `DataSourceDescriptor` 描述可用的数据字段树：

```ts
import type { DataSourceDescriptor } from '@easyink/designer'

const dataSources: DataSourceDescriptor[] = [{
  id: 'order',
  name: '订单数据',
  fields: [
    { name: 'orderNo', path: 'orderNo', title: '订单号' },
    { name: 'customer', path: 'customer', title: '客户', fields: [
      { name: 'name', path: 'customer/name', title: '客户名称' },
      { name: 'phone', path: 'customer/phone', title: '联系电话' },
    ]},
    { name: 'items', path: 'items', title: '商品列表', tag: 'collection', fields: [
      { name: 'name', path: 'items/name', title: '商品名称' },
      { name: 'qty', path: 'items/qty', title: '数量' },
      { name: 'price', path: 'items/price', title: '单价' },
    ]},
    { name: 'qrcode', path: 'qrcode', title: '二维码' },
  ],
}]
```

### DataFieldNode 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 字段内部名称 |
| `key` | `string` | 字段 key，可用于保留外部字段标识 |
| `path` | `string` | 数据路径，以 `/` 分隔，如 `customer/name` 或 `items/price` |
| `title` | `string` | 显示名称（在数据源面板中展示） |
| `id` | `string` | 字段节点 ID |
| `tag` | `string` | 字段标签，用于标记集合等语义 |
| `fields` | `DataFieldNode[]` | 子字段（用于嵌套对象或数组） |
| `use` | `MaterialUseToken` | 推荐使用的物料类型 |
| `props` | `Record<string, unknown>` | 拖放时附加到元素的默认属性 |
| `format` | `BindingDisplayFormat` | 格式化规则 |
| `bindIndex` | `number` | 绑定索引（多绑定时区分主/次绑定） |
| `union` | `DataUnionBinding[]` | 联合绑定（一次拖放绑定多个属性） |
| `expand` | `boolean` | 数据源面板中是否默认展开 |
| `meta` | `Record<string, unknown>` | 宿主或扩展保留的附加信息 |

## 传递数据源

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :data-sources="dataSources"
/>
```

Designer 会将数据源渲染到左侧数据源面板，用户可以展开字段树并拖拽到画布元素上。

## 绑定流程

1. 用户从数据源面板拖拽字段到画布元素
2. Designer 根据字段的 `use` 属性自动选择合适的物料类型（如有配置）
3. 元素的 `binding` 属性记录数据源 ID 和字段路径
4. 用户保存模板后，绑定信息持久化在 Schema 中

## 运行时解析

Viewer 渲染时，`projectBindings()` 函数解析每个元素的绑定：

- `binding.sourceId` 保留为设计时元数据，不参与 Viewer 的运行时数据查找
- 根据 `binding.fieldPath` 从运行时 `data` 根对象中提取值
- 主绑定（bindIndex 0）映射到物料的主属性（如 text -> `content`，image -> `src`）
- 多绑定时按 bindIndex 映射到不同属性

Designer 的 `dataSources` 只负责字段树、拖拽绑定和字段推荐；预览或打印时不要把 `dataSources` 传给 Viewer。

## JSON 自动生成数据源

如果你的数据是 JSON 对象，可以直接粘贴到下方，自动生成 `DataSourceDescriptor`：

<JsonToDatasource />

生成逻辑：递归遍历 JSON 对象，数组取首个元素推断子字段，字符串值自动推断 `use`（URL 类推断为 `image`，其余为 `text`）。完整实现见 `playground/src/utils/json-to-datasource.ts`。
