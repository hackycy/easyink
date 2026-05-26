# 自定义物料开发 {#custom-materials}

当你需要一个新的模板元素，并且它要同时出现在 Designer 和 Viewer 里，就进入自定义物料这一层。

先看一版最小实现：

```ts
import type { DesignerStore, MaterialDesignerExtension } from '@easyink/designer'
import type { MaterialNode } from '@easyink/schema'
import type { ViewerRuntime } from '@easyink/viewer'
import { trustedViewerHtml } from '@easyink/core'
import { registerMaterialBundle } from '@easyink/designer'
import { IconText } from '@easyink/icons'

export const PRICE_TAG_TYPE = 'price-tag'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function createPriceTagNode(input: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: input.id ?? `price-tag-${Date.now()}`,
    type: PRICE_TAG_TYPE,
    x: input.x ?? 20,
    y: input.y ?? 20,
    width: input.width ?? 48,
    height: input.height ?? 18,
    props: {
      label: '价格',
      amount: '¥ 99.00',
      ...input.props,
    },
  } as MaterialNode
}

export function createPriceTagDesignerExtension(): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      const render = (node: MaterialNode) => {
        const props = node.props as Record<string, unknown>
        container.textContent = `${String(props.label ?? '')}: ${String(props.amount ?? '')}`
      }

      render(nodeSignal.get())
      return nodeSignal.subscribe(render)
    },
  }
}

export function registerPriceTagDesigner(store: DesignerStore) {
  registerMaterialBundle(store, {
    materials: [
      {
        type: PRICE_TAG_TYPE,
        name: '价格签',
        icon: IconText,
        category: 'basic',
        capabilities: {
          bindable: true,
          resizable: true,
          rotatable: true,
        },
        createDefaultNode: createPriceTagNode,
        factory: createPriceTagDesignerExtension,
        propSchemas: [
          { key: 'label', label: '标题', type: 'string', group: 'content' },
          { key: 'amount', label: '金额', type: 'string', group: 'content' },
        ],
      },
    ],
    quickMaterialTypes: [PRICE_TAG_TYPE],
    groupedCatalog: [{ type: PRICE_TAG_TYPE, group: 'utility' }],
  })
}

export function registerPriceTagViewer(viewer: ViewerRuntime) {
  viewer.registerMaterial(PRICE_TAG_TYPE, {
    render(_node, context) {
      const props = context.resolvedProps
      return {
        html: trustedViewerHtml(
          `<div>${escapeHtml(String(props.label ?? ''))}: ${escapeHtml(String(props.amount ?? ''))}</div>`,
        ),
      }
    },
  })
}
```

这段代码做了三件事：定义一个稳定的 `type`，把它注册到 Designer 的物料面板，再用同一个 `type` 注册 Viewer 渲染器。

如果这些概念看起来有点密，没关系。先记住一句话：Designer 负责拖入和编辑，Viewer 负责最终渲染，Schema 负责保存中间结果。

## 判断它是不是物料 {#when-to-use}

先用这个判断表分流：

```ts
// 需要新节点类型：自定义物料
node.type = 'price-tag'

// 只是给现有节点补属性：propSchemas
propSchemas.push({ key: 'label', label: '标题', type: 'string' })

// 只是加按钮、面板或命令：Contribution
ctx.registerToolbarAction(...)
```

三条路都能扩展 Designer，但它们解决的问题不同。

- 新节点类型、新设计态、新预览态：写自定义物料。
- 现有物料多几个属性：先用 `propSchemas`。
- 宿主要挂面板、按钮、命令：看 [贡献扩展开发](/advanced/contributions)。

## 注册到 Designer {#register-designer}

Designer 的入口是 `setupStore`。我们在初始化 store 后注册物料包：

```vue
<script setup lang="ts">
import { EasyInkDesigner } from '@easyink/designer'
import { registerPriceTagDesigner } from './price-tag'

function setupStore(store) {
  registerPriceTagDesigner(store)
}
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :setup-store="setupStore"
  />
</template>
```

`registerMaterialBundle()` 会同时处理三类信息：

- `materials`：物料定义、属性面板字段、设计态 factory。
- `quickMaterialTypes`：出现在物料面板的“基础”区域。
- `groupedCatalog`：出现在 `data`、`chart`、`svg`、`utility` 分组里。

:::tip 提示
物料面板里的图标来自 `MaterialCatalogEntry.icon`。如果你只在 `materials` 里传 `icon`，注册器会自动把它带到 quick 和 grouped catalog；如果 grouped catalog 想用另一个图标，也可以在 `groupedCatalog` 项里单独传 `icon`。
:::

## 渲染设计态 {#designer-extension}

设计态最小只需要实现 `renderContent()`：

```ts
export function createPriceTagDesignerExtension(): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      const render = (node: MaterialNode) => {
        const props = node.props as Record<string, unknown>
        container.innerHTML = ''
        const label = document.createElement('span')
        label.textContent = `${String(props.label ?? '')}: ${String(props.amount ?? '')}`
        container.appendChild(label)
      }

      render(nodeSignal.get())
      return nodeSignal.subscribe(render)
    },
  }
}
```

`nodeSignal` 是 Designer 给物料的响应式节点快照。节点变化时重新渲染，返回的函数负责取消订阅或清理 DOM。

关于 `geometry`、`behaviors`、`resize` 和 `datasourceDrop`，目前知道它们是高级能力就够了。第一次做自定义物料，先让画布上能稳定显示。

## 注册到 Viewer {#register-viewer}

Viewer 需要按同一个 `type` 再注册一次：

```ts
import { trustedViewerHtml } from '@easyink/core'
import { createViewer } from '@easyink/viewer'

const viewer = createViewer({ container })

viewer.registerMaterial(PRICE_TAG_TYPE, {
  render(_node, context) {
    const props = context.resolvedProps
    return {
      html: trustedViewerHtml(
        `<div class="price-tag">${escapeHtml(String(props.amount ?? ''))}</div>`,
      ),
    }
  },
})
```

这里最值得记住的是 `context.resolvedProps`。绑定、默认值和运行时属性会在 Viewer 渲染前合成好，你的渲染器直接消费它就行。

:::warning 注意
`html` 必须用 `trustedViewerHtml()` 包装。不要直接返回裸字符串。
:::

## 接入数据绑定 {#binding}

大多数物料不需要自己解析字段路径。让 Designer 保存绑定，让 Viewer 解析绑定：

```ts
viewer.open({
  schema,
  data: {
    product: {
      name: '热敏标签纸',
      price: '¥ 99.00',
    },
  },
})
```

当节点保存了 `binding` 后，Viewer 会把绑定结果写进 `context.resolvedProps`。你的物料渲染器继续读 `resolvedProps`，不用手写 `getByPath(context.data, fieldPath)`。

如果你的物料想接管数据源拖放，比如表格单元格那样落到内部区域，再实现 `datasourceDrop`。

## 何时实现 measure {#measure}

固定尺寸物料不需要 `measure()`。只有最终尺寸依赖运行时内容时才加：

```ts
viewer.registerMaterial(PRICE_TAG_TYPE, {
  render(_node, context) {
    return {
      html: trustedViewerHtml(`<div>${escapeHtml(String(context.resolvedProps.amount ?? ''))}</div>`),
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

上面只是接口形状。对于固定宽高的价格签，删掉 `measure()` 更合适。

适合实现 `measure()` 的场景通常是：

- 文本根据内容自动增高。
- 表格根据数据行数增高。
- 容器根据子项数量展开。

## 何时使用 pageAware {#page-aware}

`pageAware` 表示这个物料要复制到每一页：

```ts
viewer.registerMaterial('page-badge', {
  pageAware: true,
  render(_node, context) {
    const props = context.resolvedProps
    return {
      html: trustedViewerHtml(
        `<div>第 ${String(props.__pageNumber ?? '')} / ${String(props.__totalPages ?? '')} 页</div>`,
      ),
    }
  },
})
```

它适合页码、页眉、页脚、水印这类“每页都出现”的元素。它不负责重新分页，也不会替你改变 layout 或 reflow。

Viewer 会给复制后的节点注入 `__pageNumber` 和 `__totalPages`，所以页码类物料应该从 `context.resolvedProps` 读取它们。

## 完成前检查 {#checklist}

写完后按这个顺序验证：

```ts
// 1. Designer 能拖入
registerPriceTagDesigner(store)

// 2. Schema 里有稳定 type
schema.elements.some(node => node.type === PRICE_TAG_TYPE)

// 3. Viewer 能渲染同一个 type
viewer.registerMaterial(PRICE_TAG_TYPE, priceTagViewerExtension)
```

然后再检查这些结果：

- 从物料面板点击或拖入后，画布上能看到元素。
- 修改属性后，Schema 保存出稳定的 `type` 和 `props`。
- 同一份 Schema 交给 Viewer 后，不会出现 `[Unknown: price-tag]`。
- 绑定数据后，Viewer 能从 `context.resolvedProps` 读到结果。
- 打印和导出结果与 Viewer 预览一致。

关于物料，目前知道这些就够用了。接下来可以继续看 [贡献扩展开发](/advanced/contributions) 或 [Schema 参考](/advanced/schema)。
