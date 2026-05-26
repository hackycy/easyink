# 自定义物料开发

当你需要一个新的模板元素，而且这个元素既要能在 Designer 里编辑，又要能在 Viewer 里渲染，这一层才值得进入。

## 需求判断

下面三种需求不要混在一起：

- 只是想给现有物料补几个属性：先看 `propSchemas`
- 只是想加按钮、面板或命令：那是 Contribution
- 需要新的节点类型、新的设计态表现和新的预览态表现：这才是自定义物料

## 物料分层

真实链路至少有三段：

1. Schema 里要有稳定的 `type` 和默认节点
2. Designer 里要能注册、拖入、编辑
3. Viewer 里要能按同一个 `type` 渲染

少任意一段，物料都不完整。

## Designer 侧契约

Designer 的注册入口是 `registerMaterialBundle(store, bundle)`。

当前 bundle 结构就是这三个字段：

```ts
interface DesignerMaterialBundle {
  materials: DesignerMaterialRegistration[]
  quickMaterialTypes: string[]
  groupedCatalog: DesignerCatalogRegistration[]
}
```

其中单个物料注册最关键的是这些字段：

- `type`
- `name`
- `icon`
- `category`
- `capabilities`
- `createDefaultNode`
- `factory`
- `propSchemas`

最小注册形态可以长这样：

```ts
registerMaterialBundle(store, {
  materials: [
    {
      type: 'price-tag',
      name: '价格签',
      icon: IconText,
      category: 'basic',
      capabilities: {
        bindable: true,
        resizable: true,
        rotatable: true,
      },
      createDefaultNode,
      factory: () => designerExtension,
      propSchemas: [
        { key: 'label', label: '标题', type: 'string' },
      ],
    },
  ],
  quickMaterialTypes: ['price-tag'],
  groupedCatalog: [{ type: 'price-tag', group: 'utility' }],
})
```

这里有一个实现细节值得知道：Designer 注册时会先取 `@easyink/prop-schemas` 里的基础属性，再把你传入的 `propSchemas` 追加进去。

## 设计态实现

Designer 侧不是简单画一个 div。它依赖的是 `MaterialDesignerExtension`。

这个契约里最核心的入口是：

```ts
interface MaterialDesignerExtension {
  renderContent: (nodeSignal, container, renderContextSignal?) => () => void
  datasourceDrop?: DatasourceDropHandler
  geometry?: MaterialGeometry
  behaviors?: BehaviorRegistration[]
  resize?: MaterialResizeAdapter
  resolveControlPolicy?: (node, context) => MaterialControlPolicy
}
```

如果你第一次做自定义物料，不要一上来就实现全部能力。先只把 `renderContent` 跑通，让节点能在画布上稳定显示。

## Viewer 侧契约

同一个 `type` 在 Viewer 里还要再注册一次，因为设计态和预览态本来就不是同一层职责。

Viewer 侧依赖的是 `MaterialViewerExtension`：

```ts
interface MaterialViewerExtension {
  render: (node, context) => ViewerRenderOutput
  measure?: (node, context) => ViewerMeasureResult
  getRenderSize?: (node, context) => Partial<ViewerRenderSize>
  fragmentPaginator?: FragmentPaginator
  pageAware?: boolean
}
```

最短的接法通常是先实现 `render`：

```ts
viewer.registerMaterial('price-tag', {
  render(node, context) {
    return {
      html: trustedViewerHtml('<div>...</div>'),
    }
  },
})
```

只有当你的物料确实涉及运行时测量、跨页切分或每页重复渲染时，再继续补 `measure`、`fragmentPaginator` 或 `pageAware`。

## 开发顺序

最稳的顺序是：

1. 先定义 `type` 和默认节点
2. 再让 Designer 能拖进去
3. 再让 Viewer 能渲染同一个节点
4. 最后再补数据拖放、深度编辑、缩放副作用和分页能力

这样能先验证“这个物料在系统里存在”，再验证“它的高级行为是否正确”。

这里有两个容易踩错的点：

- `html` 不是普通字符串，而是 `trustedViewerHtml()` 包装后的结果。
- 绑定后的值应该从 `context.resolvedProps` 读。它是 Viewer 在渲染前已经合成好的属性结果。

Viewer 实际传给 `render()` 的 `node.props` 也已经是解析后的属性，但文档里推荐优先读 `context.resolvedProps`，因为它更能表达“这里用的是运行时结果”。

## `measure` 实现时机

只有一种情况值得写 `measure()`：物料的最终高度或宽度依赖运行时内容。

典型例子：

- 数据表格内容变长后高度变化
- 富文本根据字数自动扩高
- 某个容器按子项数量展开

如果你的物料尺寸就是用户在画布上拖出来的固定宽高，不要写 `measure()`。

```ts
viewer.registerMaterial(PRICE_TAG_TYPE, {
  render(node, context) {
    const props = context.resolvedProps as PriceTagProps
    return {
      html: trustedViewerHtml(`<div>${escapeHtml(props.label)}</div>`),
    }
  },
  measure(node) {
    return {
      width: node.width,
      height: node.height,
    }
  },
})
```

上面这个 `measure()` 只是示意接口形状。对于固定尺寸物料，直接省略更合适。

## `pageAware` 使用时机

`pageAware` 不是“这个物料知道页码”，而是“这个物料应该被复制到每一页”。

适用场景：

- 页码
- 页眉 / 页脚
- 每页都要重复出现的水印类元素

开启后，Viewer 会把元素从原始页抽出来，复制到每一页，并在解析后的 props 里注入：

- `__pageNumber`
- `__totalPages`

```ts
viewer.registerMaterial('my-page-badge', {
  pageAware: true,
  render(node, context) {
    const props = context.resolvedProps as Record<string, unknown>
    return {
      html: trustedViewerHtml(
        `<div>第 ${String(props.__pageNumber)} / ${String(props.__totalPages)} 页</div>`
      ),
    }
  },
})
```

它只在真实输出页语义下生效，不会影响 layout、reflow 或 pagination 输入。

## 数据绑定接入

自定义物料最常见的误区，是把绑定逻辑写进 Viewer 里手动取数据。正确顺序应该是：

1. Designer 负责把绑定关系保存进 `node.binding`。
2. Viewer 在 `open({ schema, data })` 时统一解析绑定。
3. 你的渲染器只消费解析后的 `resolvedProps`。

这意味着大多数自定义物料根本不需要自己解析 `fieldPath`。

如果你发现自己在 Viewer 里手动写 `getByPath(context.data, ...)`，通常说明职责写错层了。

## 属性面板与 Overlay

`propSchemas` 适合简单字段：

- 文本
- 数字
- 颜色
- 开关
- 枚举

下面这些情况更适合 `requestPropertyPanel()` 推送自定义 overlay：

- 一个操作同时改多个字段
- 属性实际不在 `node.props` 下
- 需要自定义编辑器
- 需要上下文感知的临时编辑面板

判断标准只有一个：如果属性面板操作已经不再是“改一个 key 的值”，就别假装它还是简单 `propSchemas`。

## 一个最小验收清单

物料开发完成后，至少自己过这五步：

1. 能从物料面板拖入画布。
2. 修改属性后，Schema 能保存出稳定的 `type + props`。
3. 同一份 Schema 交给 Viewer 后，预览结果和设计态核心信息一致。
4. 带绑定的数据在 `viewer.open({ data })` 后能正确显示。
5. 打印和导出结果与 Viewer 渲染一致，没有退回 `[Unknown: type]`。

## 常见失败信号与原因

### 类型未注册

根因通常只有一个：你只注册了 Designer，没有注册 Viewer。

### 绑定失效

优先检查两点：

- `viewer.open()` 传入的 `data` 结构是否与 `fieldPath` 对齐。
- 渲染器是否错误地读了自己拼的默认值，而不是 `context.resolvedProps`。

### 画布不刷新

通常是 `renderContent()` 只在挂载时渲染了一次，没有订阅 `nodeSignal`。

### 缩放错位

如果物料内部有独立布局状态，光靠节点 `width/height` 改变还不够，需要实现 `resize` 适配器，把私有状态和外层几何一起更新。

## 工程边界

如果你的物料后面还会被多个业务复用，建议从第一天开始把它拆成三个文件：

- `schema.ts`：`type`、默认节点、能力声明
- `designer.ts`：DesignerExtension 和注册描述
- `viewer.ts`：ViewerExtension

不要把三层代码塞进一个组件文件里。短期快，长期一定会把职责搅乱。

## 相关文档

- Designer 接入入口见 [Designer / 概述](/designer/)
- Viewer 基础能力见 [Viewer / 概述](/viewer/)
- Schema 结构见 [Schema 参考](/advanced/schema)
