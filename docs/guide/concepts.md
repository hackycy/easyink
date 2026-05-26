# 核心概念

这页只回答一个问题：当你把 EasyInk 接进项目时，脑子里到底要先装哪几个概念。

如果你先把这几个概念分清楚，后面看 Designer、Viewer、打印和导出都会顺很多。

## Schema

Schema 就是模板本身。页面尺寸、元素、绑定、分页配置，最后都落在这一份对象里。

先看一个最小例子：

```ts
import { normalizeDocumentSchema } from '@easyink/schema'

const schema = normalizeDocumentSchema({
  page: { width: 80, height: 120 },
})
```

上面这段代码演示了两件事：

- 宿主输入可以是不完整的 `DocumentSchemaInput`。
- 进入 Designer、Viewer 和自动保存链路后，内部拿到的都是完整 `DocumentSchema`。

所以你可以把 Schema 理解成 EasyInk 的单一事实来源。Designer 编辑它，Viewer 消费它，导入导出也围着它转。

## 三类状态

你刚接入时最容易混的，其实不是 API，而是状态边界。

EasyInk 里至少有三种状态：

| 状态 | 例子 | 会不会进模板 |
| --- | --- | --- |
| 模板状态 | 页面、元素、绑定、分页配置 | 会 |
| 工作台状态 | 面板显隐、缩放、吸附设置 | 不会 |
| 运行时状态 | 当前页、缩略图、打印任务 | 不会 |

这三层分开以后，很多事情就不难理解了：

- 自动保存保存的是模板状态。
- `preferenceProvider` 保存的是工作台状态。
- Viewer 销毁后，运行时状态会一起消失。

如果你现在只记一条，也记这一条：不要把工作台状态塞进 Schema。

## 物料系统

物料就是模板里的元素类型，比如文本、图片、条码、表格。

先看它在系统里的位置：

```text
Designer 里拖入物料
  -> 生成一个 MaterialNode
  -> 写进 schema.elements
  -> Viewer 根据 node.type 找到对应渲染器
```

这意味着一个完整物料至少横跨三层：

- Schema 里有一个稳定的 `type`
- Designer 知道怎么创建和编辑它
- Viewer 知道怎么渲染它

如果你以后要做自定义物料，这个链路会反复用到。

## 数据源与运行时数据

这点值得单独说，因为很多人第一次接 EasyInk 都会在这里卡住。

Designer 里的 `dataSources` 是设计时字段树。它告诉用户“可以拖哪些字段”。

Viewer 里的 `data` 则是运行时数据。它告诉渲染器“这次真正要填什么值”。

先看两边各自的角色：

```ts
const dataSources = [
  {
    id: 'order',
    name: '订单',
    fields: [
      { name: 'orderNo', path: 'orderNo', title: '订单号' },
    ],
  },
]

const data = {
  orderNo: 'SO-2026-0001',
}
```

上面这两份数据长得像，但职责完全不同。Designer 只需要第一份，Viewer 只需要第二份。

## `page.mode` 与排版

很多文档系统会把页面模式和布局策略混在一起。EasyInk 把它们拆开了。

`page.mode` 只表示介质类型：

- `fixed`：固定纸张
- `continuous`：连续纸

真正控制布局和分页的，是 `page.layout`、`page.reflow` 和 `page.pagination`。

所以你可以这样理解：

- `fixed` 更像 A4、面单、卡片这类固定页文档。
- `continuous` 更像小票、长标签这类沿 Y 轴延展的文档。

这也是为什么同样是打印，固定页和连续纸的策略会不一样。

## 节点布局语义

不是所有布局规则都属于页面。节点自己也会声明一部分行为。

最常见的是这三个字段：

- `placement.mode`：节点参与回流，还是固定在当前位置。
- `break`：自动分页时能不能在这里切页。
- `repeat.scope`：分页完成后是否复制到每个输出页。

页码、页眉、页脚之类的元素，通常就会走 `repeat.scope='every-output-page'` 这一类语义。

## 两类扩展机制

如果你之后要做二次开发，先别急着写代码，先分清是改哪一层。

- 你要新增一种元素类型，走物料扩展。
- 你要新增一个面板、按钮或命令，走 Contribution 扩展。

这两个扩展点都是真实存在的公开能力，但职责完全不同。混在一起做，后面一定会越改越乱。

关于 EasyInk，目前先掌握这些就够用了。接下来你可以继续看：

- [包概览](/guide/packages)
- [Designer 概述](/designer/)
- [Viewer 概述](/viewer/)
