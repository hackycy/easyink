# 数据绑定

Designer 里的数据绑定，本质上是在做一件很朴素的事：把模板里的某个属性，连到运行时数据里的某条路径上。

如果你先把“设计时字段树”和“运行时数据”分开理解，这一层就不会绕。

## 先定义一棵字段树

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

## 用户拖拽时，Designer 实际做了什么

先别急着想 Viewer。用户在画布里拖一个字段时，Designer 做的其实是把绑定信息写进模板。

可以把过程理解成这样：

```text
字段树里的一个 field
  -> 拖到元素上
  -> Designer 把 binding 写进对应节点
  -> schema 持久化下来
```

这也是为什么绑定是模板的一部分，而不是运行时的一次性状态。

## Viewer 只认 `fieldPath`

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

你可能会注意到绑定里还有 `sourceId`、`sourceName` 之类的信息。它们有用，但作用主要在设计时元数据和界面提示，不参与运行时根数据选择。

## 所以真正稳定的约定是什么

写模板时，Designer 关心的是：

- 字段树怎么展示
- 字段拖到哪里
- 绑定信息怎么写回 Schema

渲染模板时，Viewer 关心的是：

- 当前节点有哪些绑定
- 这些绑定的 `fieldPath` 指向哪里
- 运行时 `data` 里能不能取到值

这意味着一件很重要的事：预览、打印和导出时，不要再把 `dataSources` 传给 Viewer。

## 字段树里哪些字段最值得先用

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

## 一个很实用的判断标准

当你调试绑定问题时，可以按这个顺序查：

1. Designer 里字段树是不是正确展示了。
2. 拖拽之后，Schema 里是不是写进了绑定信息。
3. 运行时传给 Viewer 的 `data`，是不是能命中相同的 `fieldPath`。

如果第三步对不上，再怎么改 Designer 侧字段树都不会生效。

关于数据绑定，目前先知道这些就够用了。接下来你可以继续看 [Viewer 概述](/viewer/) 或 [自动保存](./auto-save)。
