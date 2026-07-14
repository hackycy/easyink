---
description: EasyInk 自定义物料开发：同时覆盖 Schema、Designer 和 Viewer 三层的物料扩展机制。
---

# 自定义物料开发 {#custom-materials}

当你需要一个新的模板元素，并且它要同时出现在 Designer 和 Viewer 里，就进入自定义物料这一层。

先看一版最小实现：

```ts
import type { DesignerMaterialBundle, DesignerStore, MaterialDesignerExtension } from '@easyink/designer'
import type { MaterialNode } from '@easyink/schema'
import type { MaterialViewerExtension } from '@easyink/core'
import { viewerElement, viewerText } from '@easyink/core'
import { registerMaterialBundle } from '@easyink/designer'
import { IconText } from '@easyink/icons'

export const PRICE_TAG_TYPE = 'price-tag'

export const priceTagLocaleMessages = {
  messages: {
    materials: {
      catalog: {
        enterprise: '企业物料',
      },
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
        catalog: {
          enterprise: '企业物料',
        },
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
        catalog: {
          enterprise: 'Enterprise',
        },
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

export const priceTagDesignerBundle = {
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
  catalogs: [
    {
      id: 'enterprise',
      label: 'materials.catalog.enterprise',
      items: [{ type: PRICE_TAG_TYPE }],
    },
  ],
} satisfies DesignerMaterialBundle

export function registerPriceTagDesigner(store: DesignerStore) {
  registerMaterialBundle(store, priceTagDesignerBundle)
}

export const priceTagViewerExtension: MaterialViewerExtension = {
  render(_node, context) {
    const props = context.resolvedModel
    return {
      tree: viewerElement('div', {}, [viewerText(`${String(props.label ?? '')}: ${String(props.amount ?? '')}`)]),
    }
  },
}
```

这段代码定义稳定的 `type`、Designer bundle 和 Viewer extension。发布时把它们组装进同一个 material manifest，再由宿主在初始化阶段编译 profile。

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

Designer 接收的是 `DesignerMaterialBundle`。你可以把这个 bundle 直接交给 `runtimeConfig.materials.bundles`：

```vue
<script setup lang="ts">
import { builtinDesignerMaterialBundle } from '@easyink/builtin/basic'
import { EasyInkDesigner } from '@easyink/designer'
import { priceTagDesignerBundle } from './price-tag'

const runtimeConfig = {
  materials: {
    bundles: [builtinDesignerMaterialBundle, priceTagDesignerBundle],
  },
}
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :runtime-config="runtimeConfig"
  />
</template>
```

这段代码保留了内置基础物料，同时追加你的 `price-tag` 物料。如果你想保留全部内置物料，把导入路径换成 `@easyink/builtin/all`。

如果你已经在项目里用 `setupStore` 注册物料，也不用改 bundle 结构。`setupStore` 仍然适合需要直接操作 store 的初始化逻辑：

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

两种方式都注册同一份 `priceTagDesignerBundle`，区别只在接入位置：

- `runtimeConfig.materials.bundles`：更适合声明“这个 Designer 要有哪些物料”。
- `setupStore`：更适合同时做其它 store 初始化，比如注册纸张、读取宿主状态或挂接调试逻辑。

`registerMaterialBundle()` 会同时处理四类信息：

- `materials`：物料定义、属性面板字段、设计态 factory。
- `localeMessages`：随物料注册的多语言文案，通常放在 material entry 上。
- `catalogs`：物料面板分类，包含分类 id、标题翻译 key、排序和分类内物料。

:::tip 提示
物料面板里的图标来自 `MaterialCatalogEntry.icon`。如果你只在 `materials` 里传 `icon`，注册器会自动把它带到 `catalogs` 项里；如果某个分类里的入口想用另一个图标，也可以在 `catalogs[].items` 项里单独传 `icon`。
:::

### 物料面板分类 {#material-catalogs}

`catalogs` 只负责物料面板怎么展示，不负责定义物料能力。

```ts
export const priceTagDesignerBundle = {
  materials: [
    // 这里注册 price-tag 的能力、属性、设计态渲染器
  ],
  catalogs: [
    {
      id: 'enterprise',
      label: 'materials.catalog.enterprise',
      order: 60,
      items: [
        { type: PRICE_TAG_TYPE },
      ],
    },
  ],
  localeMessages: {
    messages: {
      materials: {
        catalog: {
          enterprise: '企业物料',
        },
      },
    },
    locales: {
      'en-US': {
        materials: {
          catalog: {
            enterprise: 'Enterprise',
          },
        },
      },
    },
  },
} satisfies DesignerMaterialBundle
```

这段配置会新增一个“企业物料”分类，并把 `price-tag` 放进去。

`catalogs` 里几个字段的分工是固定的：

- `id`：分类稳定标识。相同 `id` 会合并到同一个分类，所以你可以把自定义物料追加到内置 `data`、`svg`、`utility` 分类里。
- `label`：分类标题的翻译 key。新增分类时，记得在 `localeMessages` 里一起注册翻译。
- `order`：分类排序。分类里的物料也可以在 `items` 上写 `order`。
- `items`：分类里的入口。最小只需要 `{ type }`，其它字段默认从 `materials` 里的物料定义继承。

如果你只是想把物料追加到已有分类，可以复用内置分类 id：

```ts
catalogs: [
  {
    id: 'utility',
    label: 'materials.catalog.utility',
    items: [{ type: PRICE_TAG_TYPE }],
  },
]
```

:::tip 提示
如果你没有注册内置物料包，`materials.catalog.utility` 这类分类翻译也不会自动注册。复用内置分类 id 时，如果页面仍要显示这个分类标题，请在自己的 bundle `localeMessages` 里一起注册对应翻译。
:::

关于分类，目前知道这些就够了。物料能不能被拖入、默认节点怎么创建，仍然由 `materials` 里的注册信息决定。

### 懒加载设计态渲染器 {#lazy-designer-extension}

如果物料的设计态依赖很重，例如完整 ECharts 包、复杂代码编辑器或大型交互内核，可以在 Designer 注册里使用 `lazyFactory`：

```ts
registerMaterialBundle(store, {
  materials: [
    {
      type: 'sales-echarts',
      name: 'materials.salesEcharts.name',
      icon: IconChart,
      category: 'chart',
      capabilities: { bindable: true, resizable: true },
      binding: {
        kind: 'ordinary',
        primaryProp: 'option',
        formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
      },
      createDefaultNode: createSalesEchartsNode,
      factory: () => ({ renderContent: () => () => {} }),
      lazyFactory: async () => (await import('./sales-echarts-designer')).createSalesEchartsExtension,
      propSchemas: salesEchartsPropSchemas,
      localeMessages: salesEchartsLocaleMessages,
    },
  ],
  catalogs: [
    {
      id: 'chart',
      label: 'materials.catalog.chart',
      items: [{ type: 'sales-echarts' }],
    },
  ],
})
```

`lazyFactory` 只延迟加载 `MaterialDesignerExtension`。物料面板、属性面板、绑定面板和 AI manifest 需要的元数据仍然同步注册，所以 `type`、`name`、`icon`、`category`、`capabilities`、`binding`、`createDefaultNode`、`propSchemas` 和 `localeMessages` 不要放到懒加载 chunk 里。

懒加载过程中，画布会先显示内置 loading 状态；加载完成后 Designer 会重新 mount 对应物料。Viewer facet 必须预先包含在 compiled profile 的 manifest 中；Designer 的懒加载不会改变已经编译的 Viewer profile。

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

选择成功后，PropertiesPanel 会把返回内容当作普通属性值提交。Schema 里仍然只保存最终值，例如 `props.content` 或 `props.src`，不要额外保存 `File`、本地路径、文件名或“来源类型”。如果宿主需要接自己的文件库，可以通过 `<EasyInkDesigner :interaction-provider>` 提供 `pickFileText(request)` 或 `pickAsset(request)`；不提供时，Designer shell 会使用浏览器内置选择能力。

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

## 编译 Viewer profile {#register-viewer}

Viewer 从不可变 compiled profile 激活物料 facet。把自定义 manifest 放入外部物料包，并在创建 Viewer 前编译：

```ts
import { compileMaterialProfile, EASYINK_ENGINE_VERSION } from '@easyink/core'
import { createViewer } from '@easyink/viewer'
import { priceTagMaterialManifest } from '@acme/easyink-material-price-tag'

const profile = compileMaterialProfile({
  id: 'acme-reporting',
  engineVersion: EASYINK_ENGINE_VERSION,
  packages: [{
    packageId: '@acme/easyink-material-price-tag',
    kind: 'external',
    required: true,
    manifests: [priceTagMaterialManifest],
  }],
})

const viewer = createViewer({ container, profile })
```

这里最值得记住的是 `context.resolvedModel`。绑定、默认值和运行时属性会在 Viewer 渲染前合成并冻结，你的渲染器直接消费它就行。

:::warning 注意
Viewer 不接受原始 HTML 字符串。普通输出必须构造成 `ViewerRenderTree`；markup 只能通过显式声明的 sanitized-markup capability。
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

当节点保存了 binding 后，Viewer 会按 compiled profile 的端口策略把结果投影进 `context.resolvedModel`。物料渲染器直接读取冻结的 runtime model，不用手写字段路径遍历。

普通绑定不只适合字符串或数字。只要物料的 `primaryProp` 指向某个 props 字段，Viewer 就会把绑定结果投影到这个字段。例如自定义 ECharts 物料可以声明 `primaryProp: 'option'`，运行时数据源直接返回完整 option 对象：

```ts
const node = {
  type: 'sales-echarts',
  props: {
    optionCode: 'return { series: [{ type: "bar", data: [1, 2, 3] }] }',
    option: null,
  },
  binding: {
    sourceId: 'report',
    fieldPath: 'echartsOption',
  },
}

viewer.open({
  schema,
  data: {
    echartsOption: {
      tooltip: {},
      xAxis: { type: 'category', data: ['A', 'B'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [12, 20] }],
    },
  },
})
```

如果数据源返回 JSON 字符串，物料可以在自己的 Viewer renderer 中解析它；如果要执行 JavaScript 代码生成 option，应明确把它作为可信模板代码处理，不要把它当成不可信脚本沙箱。

如果你的物料想接管数据源拖放，比如表格单元格那样落到内部区域，再实现 `datasourceDrop`。

### 结构化数据物料 {#data-contract}

如果物料消费的不是单个字段，而是一组目标 records，例如柱状图、折线图、透视卡片，可以在 `MaterialManifest.common.binding` 使用 `kind: 'ports'`，并设置 `dataContract`。此时物料说清楚自己需要什么目标模型，节点 binding 只保存用户从数据源拖来的映射。

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

把 contract 放到 `MaterialManifest.common.binding.dataContract`，并用语义端口声明节点 binding key：

```ts
import type { MaterialBindingDefinition } from '@easyink/core'

export const salesChartBinding = {
  kind: 'ports',
  dataContract: SALES_CHART_CONTRACT,
  ports: [{
    id: 'data',
    key: { kind: 'exact', value: 'value' },
    role: 'semantic',
    valueShape: 'record-array',
    formatEditor: false,
  }],
} satisfies MaterialBindingDefinition

// Use this object as the `binding` field when defining salesChartMaterialManifest.
```

Viewer 渲染器里由物料自己消费 contract 解析结果：

```ts
import type { MaterialViewerExtension } from '@easyink/core'
import { resolveMaterialDataContract } from '@easyink/core'

export const salesChartViewerExtension: MaterialViewerExtension = {
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
}
```

保持这几个边界会让物料更容易扩展：

- `props` 保存视觉设置，不保存运行时数据。
- `binding.contract.model` 描述目标数据模型，不描述数据源长什么样。
- `DataContractBinding.mappings` 保存完整 source path，不截断集合内路径。
- 默认使用 `relation: { kind: 'auto' }` 交给 Resolver 推导 record/index 对齐关系。
- `formatEditor` 是物料注册能力声明，决定属性面板显示哪些格式 tab；Schema 里的 `BindingDisplayFormat` 只保存实际格式配置。
- svg、chart 这类非普通文本值投影的物料应优先声明 `formatEditor: { tabs: ['custom'], defaultTab: 'custom' }`，只在运行时确实消费预设格式时才开放 `preset`。

## 何时实现 viewerLayout {#measure}

固定尺寸物料不需要自定义布局。只有最终尺寸依赖运行时内容时，才在 material manifest 的 `viewerLayout` 中实现异步 `MaterialViewerLayoutFacet.measure(request)`，并返回 `MaterialLayoutPlan`。文本测量使用 `request.measureText()`，嵌套物料使用 `request.measureSlot()`；分页断点通过 `breakOpportunities` 发布，由 core 统一选择。

适合实现 `viewerLayout` 的场景通常是：

- 文本根据内容自动增高。
- 表格根据数据行数增高。
- 容器根据子项数量展开。

`viewerExtension` 只负责从已提交的 runtime model 和 layout facts 生成 `ViewerRenderTree`，不承担同步测量或 render-size 推断。

## 何时使用每页重复 {#page-aware}

manifest 的 `common.layout.pageRepeat: 'every-output-page'` 表示这个物料要在 core 分页后复制到每一页。重复物料不参与内容 flow 或页数计算。

```ts
export const pageBadgeViewerExtension: MaterialViewerExtension = {
  render(_node, context) {
    const props = context.resolvedModel
    return {
      tree: viewerText(`第 ${String(props.__pageNumber ?? '')} / ${String(props.__totalPages ?? '')} 页`),
    }
  },
}
```

它适合页码、页眉、页脚、水印这类“每页都出现”的元素。它不负责重新分页，也不会替你改变 layout 或 reflow。

Viewer 会把 `__pageNumber` 和 `__totalPages` 投影进重复实例的 runtime model，所以页码类物料从 `context.resolvedModel` 读取它们。

## 完成前检查 {#checklist}

写完后按这个顺序验证：

```ts
// 1. Designer 能拖入
registerPriceTagDesigner(store)

// 2. Schema 里有稳定 type
schema.elements.some(node => node.type === PRICE_TAG_TYPE)

// 3. compiled profile 包含同一个 type 的 Viewer facet
profile.getManifest(PRICE_TAG_TYPE)?.facets.viewer
```

然后再检查这些结果：

- 从物料面板点击或拖入后，画布上能看到元素。
- 修改属性后，Schema 保存出稳定的 `type` 和 `props`。
- 同一份 Schema 交给 Viewer 后，不会出现 `[Unknown: price-tag]`。
- 绑定数据后，Viewer 能从 `context.resolvedModel` 读到结果。
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
      canBeChildOf: ['*'],
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
  catalogs: [{
    id: 'enterprise',
    label: 'materials.catalog.enterprise',
    items: [{ type: PRICE_TAG_TYPE }],
  }],
})
```

`knowledge` 是可选的。没有它 AI 仍然能使用你的物料，但有了它 AI 会更精确地选择物料、设置尺寸和绑定数据。
