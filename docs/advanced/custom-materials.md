---
description: EasyInk 自定义物料开发：同时覆盖 Schema、Designer 和 Viewer 三层的物料扩展机制。
---

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

export const priceTagLocaleMessages = {
  messages: {
    materials: {
      priceTag: {
        name: '价格签',
        property: {
          label: '标题',
          amount: '金额',
        },
        data: {
          category: '分类字段',
          value: '数值字段',
        },
      },
    },
  },
  locales: {
    'zh-CN': {
      materials: {
        priceTag: {
          name: '价格签',
          property: {
            label: '标题',
            amount: '金额',
          },
          data: {
            category: '分类字段',
            value: '数值字段',
          },
        },
      },
    },
    'en-US': {
      materials: {
        priceTag: {
          name: 'Price Tag',
          property: {
            label: 'Label',
            amount: 'Amount',
          },
          data: {
            category: 'Category Field',
            value: 'Value Field',
          },
        },
      },
    },
  },
}

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
        name: 'materials.priceTag.name',
        icon: IconText,
        category: 'basic',
        capabilities: {
          bindable: true,
          resizable: true,
          rotatable: true,
        },
        binding: {
          kind: 'ordinary',
          primaryProp: 'amount',
          formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' },
        },
        createDefaultNode: createPriceTagNode,
        factory: createPriceTagDesignerExtension,
        localeMessages: priceTagLocaleMessages,
        propSchemas: [
          { key: 'label', label: 'materials.priceTag.property.label', type: 'string', group: 'content' },
          { key: 'amount', label: 'materials.priceTag.property.amount', type: 'string', group: 'content' },
        ],
      },
    ],
    quickMaterialTypes: [PRICE_TAG_TYPE],
    groupedCatalog: [{ type: PRICE_TAG_TYPE, group: 'utility' }],
  })
}

export function registerPriceTagViewer(viewer: ViewerRuntime) {
  viewer.registerMaterial(PRICE_TAG_TYPE, {
    kind: 'ordinary',
    primaryProp: 'amount',
    formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' },
  }, {
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

`registerMaterialBundle()` 会同时处理四类信息：

- `materials`：物料定义、属性面板字段、设计态 factory。
- `localeMessages`：随物料注册的多语言文案，通常放在 material entry 上。
- `quickMaterialTypes`：出现在物料面板的“基础”区域。
- `groupedCatalog`：出现在 `data`、`chart`、`svg`、`utility` 分组里。

:::tip 提示
物料面板里的图标来自 `MaterialCatalogEntry.icon`。如果你只在 `materials` 里传 `icon`，注册器会自动把它带到 quick 和 grouped catalog；如果 grouped catalog 想用另一个图标，也可以在 `groupedCatalog` 项里单独传 `icon`。
:::

## 属性值输入增强 {#prop-value-input}

`propSchemas` 负责声明属性如何编辑。对于直接保存到 `node.props` 的属性，如果用户更常从宿主资产库或本地文件获得值，可以在 `editorOptions.valueInput` 上声明输入通道。

```ts
propSchemas: [
  {
    key: 'content',
    label: 'materials.logoSvg.property.content',
    type: 'code',
    group: 'content',
    editorOptions: {
      language: 'html',
      valueInput: {
        kind: 'text-file',
        id: 'designer.logoSvg.importFile',
        source: 'logo-svg-content',
        accept: ['.svg', 'image/svg+xml'],
        pickTitle: 'materials.logoSvg.action.importFile',
        maxBytes: 262144,
      },
    },
  },
]
```

图片 URL 字段使用同一套声明，只是 `kind` 为 `asset-url`：

```ts
editorOptions: {
  valueInput: {
    kind: 'asset-url',
    id: 'designer.logoImage.pickImage',
    source: 'logo-image',
    accept: ['image/*'],
    pickTitle: 'materials.logoImage.action.pick',
  },
}
```

选择成功后，PropertiesPanel 会把返回内容当作普通属性值提交。Schema 里仍然只保存最终值，例如 `props.content` 或 `props.src`，不要额外保存 `File`、本地路径、文件名或“来源类型”。如果宿主需要接自己的文件库，可以通过 `<EasyInkDesigner :interaction-provider>` 提供 `pickFileText(request)` 或 `pickAsset(request)`；不提供时，Designer shell 会使用浏览器能力作为 fallback。

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
  kind: 'ordinary',
  primaryProp: 'amount',
  formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' },
}, {
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

### 结构化数据物料 {#data-contract}

如果物料消费的不是单个字段，而是一组目标 records，例如柱状图、折线图、透视卡片，可以声明 `dataContract`。此时物料说清楚自己需要什么目标模型，binding 只保存用户从数据源拖来的映射。

```ts
import type { MaterialDataContract } from '@easyink/core'

export const SALES_CHART_CONTRACT = {
  version: 3,
  model: {
    kind: 'tabular',
    fields: {
      category: {
        labelKey: 'materials.salesChart.data.category',
        type: 'string',
        required: true,
        format: 'display',
      },
      value: {
        labelKey: 'materials.salesChart.data.value',
        type: 'number',
        required: true,
        format: 'raw',
      },
    },
  },
} satisfies MaterialDataContract
```

注册物料时把 contract 放到 `MaterialDefinition.binding`：

```ts
registerMaterialBundle(store, {
  materials: [{
    type: 'sales-chart',
    name: 'materials.salesChart.name',
    icon: IconChart,
    category: 'chart',
    capabilities: { bindable: true, resizable: true },
    binding: {
      kind: 'data-contract',
      contract: SALES_CHART_CONTRACT,
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    },
    propSchemas: [],
    localeMessages: salesChartLocaleMessages,
    createDefaultNode: createSalesChartNode,
    factory: createSalesChartDesignerExtension,
  }],
})
```

Viewer 渲染器里由物料自己消费 contract 解析结果：

```ts
import { resolveMaterialDataContract } from '@easyink/core'

viewer.registerMaterial('sales-chart', {
  kind: 'data-contract',
  contract: SALES_CHART_CONTRACT,
  formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
}, {
  render(node, context) {
    const resolution = resolveMaterialDataContract(
      SALES_CHART_CONTRACT,
      node.binding,
      context.data ?? {},
    )

    for (const diagnostic of resolution.diagnostics)
      context.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })

    const points = resolution.records.map(record => ({
      label: String(record.category ?? ''),
      value: Number(record.value ?? 0),
    }))

    return renderSalesChart(points)
  },
})
```

保持这几个边界会让物料更容易扩展：

- `props` 保存视觉设置，不保存运行时数据。
- `dataContract.model` 描述目标数据模型，不描述数据源长什么样。
- `DataContractBinding.mappings` 保存完整 source path，不截断集合内路径。
- 默认使用 `relation: { kind: 'auto' }` 交给 Resolver 推导 record/index 对齐关系。
- `formatEditor` 是物料注册能力声明，决定属性面板显示哪些格式 tab；Schema 里的 `BindingDisplayFormat` 只保存实际格式配置。
- svg、chart 这类非普通文本值投影的物料应优先声明 `formatEditor: { tabs: ['custom'], defaultTab: 'custom' }`，只在运行时确实消费预设格式时才开放 `preset`。

## 何时实现 measure {#measure}

固定尺寸物料不需要 `measure()`。只有最终尺寸依赖运行时内容时才加：

```ts
viewer.registerMaterial(PRICE_TAG_TYPE, {
  kind: 'ordinary',
  primaryProp: 'amount',
  formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' },
}, {
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
viewer.registerMaterial('page-badge', { kind: 'none' }, {
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

## 声明 AI 知识 {#ai-knowledge}

如果你希望 AI 助手能理解你的自定义物料并在生成模板时正确使用它，需要在 `aiDescriptor` 中声明 `knowledge` 字段：

```ts
import type { AIMaterialDescriptor } from '@easyink/shared'

export const priceTagAIMaterialDescriptor = {
  type: 'price-tag',
  description: 'Price tag for displaying product price with label.',
  properties: ['label', 'amount'],
  requiredProps: ['label', 'amount'],
  binding: 'single',
  usage: ['Use for product price display in retail labels.'],
  knowledge: {
    category: 'typography',
    composability: {
      canBeChildOf: ['container', '*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['barcode', 'image'],
    },
    bindingSpec: {
      mode: 'scalar',
      accepts: { types: ['number', 'string'] },
      produces: { kind: 'scalar-field', fieldCount: 'single' },
    },
    sizing: {
      minWidth: 20,
      minHeight: 10,
      defaultSize: { width: 48, height: 18 },
    },
    fitness: [
      { scenario: 'product-label', score: 0.95, reason: 'price display' },
      { scenario: 'retail-shelf', score: 0.9, reason: 'shelf price tag' },
    ],
  },
} satisfies AIMaterialDescriptor
```

然后在注册物料时传入：

```ts
registerMaterialBundle(store, {
  materials: [{
    type: PRICE_TAG_TYPE,
    name: 'materials.priceTag.name',
    icon: IconText,
    category: 'basic',
    capabilities: { bindable: true, resizable: true, rotatable: true },
    aiDescriptor: priceTagAIMaterialDescriptor,  // ← 传入 AI 描述
    localeMessages: priceTagLocaleMessages,
    createDefaultNode: createPriceTagNode,
    factory: createPriceTagDesignerExtension,
  }],
})
```

`knowledge` 是可选的。没有它 AI 仍然能使用你的物料，但有了它 AI 会更精确地选择物料、设置尺寸和绑定数据。
