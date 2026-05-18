# 自定义物料开发

这篇文档解决的不是“Viewer 怎么渲染一个 div”，而是一个完整问题：当业务需要新的可编辑元素时，代码应该分别落在哪一层，才能让 Designer、Viewer、导出和打印都保持一致。

这也是它被放到“进阶”而不是 “Viewer” 章节的原因。自定义物料天然跨越三层：Schema、Designer、Viewer。只看其中一层，最后一定会卡在另一层。

## 先判断是不是应该新建物料

先问自己三个问题：

- 只是现有物料缺少几个属性：优先补 `propSchemas` 或扩展属性面板。
- 只是想在设计器里多一个按钮或面板：那是 Contribution，不是物料。
- 需要新的 Schema 节点、新的设计态交互、新的预览态渲染：这才是自定义物料。

如果你的需求同时满足第三条，再继续往下做。

## 自定义物料的四个组成部分

一个完整物料最少有四部分职责：

1. `MaterialNode`：Schema 里的节点结构，决定模板保存什么。
2. `DesignerMaterialRegistration`：把物料注册进设计器目录、快捷栏和属性面板。
3. `MaterialDesignerExtension`：定义设计态渲染、拖放、编辑、缩放副作用。
4. `MaterialViewerExtension`：定义预览态渲染、测量、跨页复制。

把它理解成一条链路更准确：

```text
拖入 Designer
  -> createDefaultNode()
  -> schema.elements[]
  -> DesignerExtension.renderContent()
  -> viewer.open({ schema, data })
  -> viewer.registerMaterial().render()
  -> 打印 / 导出复用 Viewer 结果
```

如果其中一环缺失，表现会很直接：

- 少了 Designer 注册，画布里拖不进去。
- 少了 Viewer 注册，预览里只会看到 `[Unknown: type]`。
- 少了默认节点，模板能识别类型但没法稳定创建。

## 最短落地路径

不要一开始就做复杂交互。最快跑通的顺序是：

1. 先定义 `type`、默认节点和最小属性。
2. 先让 Designer 里能拖进去、能保存到 Schema。
3. 再让 Viewer 能正确渲染同一个节点。
4. 最后再补属性面板、数据绑定、深度编辑、缩放联动。

这样做的原因很简单：你先验证“这个物料在系统里存在”，再验证“它好不好用”。

## 第一步：定义共享常量和默认节点

先把物料的身份定义清楚。最关键的是 `type` 和 `createDefaultNode()`。

```ts
import type { MaterialNode } from '@easyink/schema'

export const PRICE_TAG_TYPE = 'price-tag'

export interface PriceTagProps {
  label: string
  price: string
  accentColor: string
}

export function createPriceTagNode(
  input: Partial<MaterialNode> = {},
): MaterialNode<PriceTagProps> {
  return {
    id: crypto.randomUUID(),
    type: PRICE_TAG_TYPE,
    x: 0,
    y: 0,
    width: 50,
    height: 24,
    props: {
      label: '商品名称',
      price: '99.00',
      accentColor: '#0f766e',
    },
    ...input,
  }
}
```

这里的要求只有一个：默认节点必须能独立渲染。不要让它依赖外部数据才能显示，否则拖进画布第一时间就是空白。

## 第二步：注册 Designer 侧物料

Designer 侧负责两件事：

- 让用户能把这个物料拖进模板。
- 让用户在画布里看见它、选中它、编辑它。

注册入口是 `registerMaterialBundle()`。

```ts
import type { MaterialExtensionFactory } from '@easyink/core'
import { registerMaterialBundle } from '@easyink/designer'
import { escapeHtml } from '@easyink/shared'

const createPriceTagExtension: MaterialExtensionFactory = () => ({
  renderContent(nodeSignal, container) {
    const render = () => {
      const node = nodeSignal.get()
      const props = node.props as PriceTagProps

      container.innerHTML = `
        <div style="
          width:100%;
          height:100%;
          box-sizing:border-box;
          border:1px solid ${escapeHtml(props.accentColor)};
          border-radius:4px;
          padding:4px 6px;
          display:flex;
          flex-direction:column;
          justify-content:center;
          background:#ffffff;
        ">
          <div style="font-size:10px;color:#666;line-height:1.2;">${escapeHtml(props.label)}</div>
          <div style="font-size:16px;font-weight:700;color:${escapeHtml(props.accentColor)};line-height:1.2;">${escapeHtml(props.price)}</div>
        </div>
      `
    }

    render()
    return nodeSignal.subscribe(render)
  },
})

registerMaterialBundle(store, {
  materials: [
    {
      type: PRICE_TAG_TYPE,
      name: '价格签',
      icon: 'text',
      category: 'basic',
      capabilities: {
        bindable: true,
        resizable: true,
        rotatable: true,
      },
      createDefaultNode: createPriceTagNode,
      factory: createPriceTagExtension,
      propSchemas: [
        { key: 'label', label: '标题', type: 'text' },
        { key: 'price', label: '价格', type: 'text' },
        { key: 'accentColor', label: '强调色', type: 'color' },
      ],
    },
  ],
  quickMaterialTypes: [PRICE_TAG_TYPE],
  groupedCatalog: [
    { type: PRICE_TAG_TYPE, group: 'utility' },
  ],
})
```

### `DesignerMaterialRegistration` 里最重要的字段

- `type`：Schema 里的稳定标识，发布后不要随意改。
- `createDefaultNode`：拖入画布和某些自动创建路径都会走这里。
- `factory`：返回 `MaterialDesignerExtension`，定义设计态内容。
- `propSchemas`：追加到设计器基础属性 Schema 后面，只适合那些直接落在 `node.props` 上的属性。
- `capabilities`：决定设计器是否显示绑定、旋转、缩放等能力。

如果一个属性不应该直接写入 `node.props`，就不要硬塞进 `propSchemas`，而应该用自定义 overlay 或命令去管理。

内置物料的基础属性 Schema 由 `@easyink/prop-schemas` 维护，设计器注册物料时会先读取这部分基础字段，再合并物料包自己通过 `propSchemas` 提供的扩展字段。自定义物料只需要在注册时传入自己的 `propSchemas`。

## 第三步：注册 Viewer 侧渲染器

同一个物料在 Viewer 里要再注册一次。原因不是重复，而是设计态和预览态本来就是两套职责。

```ts
import { trustedViewerHtml } from '@easyink/core'
import { escapeHtml } from '@easyink/shared'

viewer.registerMaterial(PRICE_TAG_TYPE, {
  render(node, context) {
    const props = context.resolvedProps as PriceTagProps

    return {
      html: trustedViewerHtml(`
        <div style="
          width:100%;
          height:100%;
          box-sizing:border-box;
          border:1px solid ${escapeHtml(props.accentColor)};
          border-radius:4px;
          padding:4px 6px;
          display:flex;
          flex-direction:column;
          justify-content:center;
          background:#ffffff;
        ">
          <div style="font-size:10px;color:#666;line-height:1.2;">${escapeHtml(props.label)}</div>
          <div style="font-size:16px;font-weight:700;color:${escapeHtml(props.accentColor)};line-height:1.2;">${escapeHtml(props.price)}</div>
        </div>
      `),
    }
  },
})
```

这里有两个容易踩错的点：

- `html` 不是普通字符串，而是 `trustedViewerHtml()` 包装后的结果。
- 绑定后的值应该从 `context.resolvedProps` 读。它是 Viewer 在渲染前已经合成好的属性结果。

Viewer 实际传给 `render()` 的 `node.props` 也已经是解析后的属性，但文档里推荐优先读 `context.resolvedProps`，因为它更能表达“这里用的是运行时结果”。

## 什么时候实现 `measure`

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

## 什么时候使用 `pageAware`

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

它不会在 `label` 模式下生效，这一点需要提前接受。

## 数据绑定应该怎么接

自定义物料最常见的误区，是把绑定逻辑写进 Viewer 里手动取数据。正确顺序应该是：

1. Designer 负责把绑定关系保存进 `node.binding`。
2. Viewer 在 `open({ schema, data })` 时统一解析绑定。
3. 你的渲染器只消费解析后的 `resolvedProps`。

这意味着大多数自定义物料根本不需要自己解析 `fieldPath`。

如果你发现自己在 Viewer 里手动写 `getByPath(context.data, ...)`，通常说明职责写错层了。

## 属性面板什么时候够用，什么时候要自定义 overlay

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

### Designer 里能看到，Viewer 里是 `[Unknown: type]`

根因通常只有一个：你只注册了 Designer，没有注册 Viewer。

### Viewer 里渲染出来，但绑定值始终不变

优先检查两点：

- `viewer.open()` 传入的 `data` 结构是否与 `fieldPath` 对齐。
- 渲染器是否错误地读了自己拼的默认值，而不是 `context.resolvedProps`。

### 属性面板能改，画布内容不刷新

通常是 `renderContent()` 只在挂载时渲染了一次，没有订阅 `nodeSignal`。

### 缩放后内部结构错位

如果物料内部有独立布局状态，光靠节点 `width/height` 改变还不够，需要实现 `resize` 适配器，把私有状态和外层几何一起更新。

## 一条更稳的工程边界

如果你的物料后面还会被多个业务复用，建议从第一天开始把它拆成三个文件：

- `schema.ts`：`type`、默认节点、能力声明
- `designer.ts`：DesignerExtension 和注册描述
- `viewer.ts`：ViewerExtension

不要把三层代码塞进一个组件文件里。短期快，长期一定会把职责搅乱。

## 相关文档

- Designer 接入入口见 [Designer / 概述](/designer/)
- Viewer 基础能力见 [Viewer / 概述](/viewer/)
- Schema 结构见 [Schema 参考](/advanced/schema)
