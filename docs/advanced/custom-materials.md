---
description: 自定义物料开发：用一份共享 model 和两个宿主声明接入 Designer、Viewer、绑定、属性、目录和 AI。
---

# 自定义物料开发 {#custom-materials}

EasyInk 的物料以 `model` 为共享契约。应用在创建宿主时选择完整物料声明：Designer 选择包含编辑器渲染器和 UI 能力的 `DesignerMaterial`，Viewer 选择包含输出渲染器的 `ViewerMaterial`。物料集合在宿主创建时完成装配。更换集合时，先销毁宿主，再使用新的集合创建宿主。

## 什么时候做成物料 {#when-to-use}

下面这些能力适合放在物料声明里：

- 节点类型、默认节点、绑定定义和条件行为；
- Designer 画布渲染、属性编辑器、调色板预设、文案和 AI 描述；
- Viewer 的测量、分页、DOM 渲染和资源生命周期；
- 只属于该物料的协议适配、数据解析和诊断。

页面级工具栏、数据源 provider、保存流程和打印驱动属于宿主扩展，不要复制到物料里。

## 共享 model {#shared-model}

先定义两端共用的 model。`type` 必须稳定，保存到 Schema 的节点只引用这个值。

```ts
import type { MaterialModel } from '@easyink/plugin-api/material'

export const priceTagModel: MaterialModel = {
  type: 'company/price-tag',
  binding: {
    kind: 'ordinary',
    primaryProp: 'price',
    formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
  },
  capabilities: { resizable: true, rotatable: true },
  createDefaultNode(input) {
    return {
      id: input?.id ?? `price-tag-${crypto.randomUUID()}`,
      type: 'company/price-tag',
      x: input?.x ?? 0,
      y: input?.y ?? 0,
      width: input?.width ?? 50,
      height: input?.height ?? 20,
      rotation: input?.rotation ?? 0,
      props: { label: 'Price', price: 0, ...input?.props },
      binding: input?.binding,
    }
  },
}
```

`createDefaultNode()` 应只返回可序列化节点。不要把 DOM、Vue 组件、Host 或运行时对象写入 `props`。

## Designer 声明 {#designer-material}

Designer 声明包含编辑器渲染器、属性 schema、目录预设、locale 和可选 AI 描述。以下示例使用最小的 DOM 内容；真实项目可以在 `renderContent` 中挂载自己的编辑器组件。

```ts
import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { priceTagModel } from './model'

export const priceTagDesigner: DesignerMaterial = {
  model: priceTagModel,
  renderer: context => ({
    renderContent(signal, container) {
      const update = () => {
        const node = signal.get()
        container.textContent = `${context.t('company.priceTag.name')}: ${String(node.props.price ?? '')}`
      }
      update()
      const unsubscribe = signal.subscribe(update)
      return () => {
        unsubscribe()
        container.replaceChildren()
      }
    },
  }),
  properties: [
    { key: 'label', label: 'company.priceTag.label', type: 'string' },
    { key: 'price', label: 'company.priceTag.price', type: 'number' },
  ],
  locale: {
    messages: {
      company: { priceTag: { name: 'Price tag', label: 'Label', price: 'Price', group: 'Company' } },
    },
  },
  ai: {
    type: priceTagModel.type,
    description: 'A price tag with a label and numeric price.',
    properties: ['label', 'price'],
    binding: 'single',
  },
  ui: {
    palette: [{
      id: 'price-tag',
      label: 'company.priceTag.name',
      icon: { render: () => null },
      group: { id: 'company', label: 'company.priceTag.group' },
      order: 1,
    }],
  },
}
```

把完整声明传给 `EasyInkDesigner` 或 `DesignerStore.create()`：

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :materials="[priceTagDesigner]"
  :locale="zhCN"
  :extensions="assistantExtensions"
/>
```

内置物料使用相同的入口，例如 `@easyink/builtin/all/designer` 的 `materials`。如果要同时使用内置和企业物料，直接组合数组：

```ts
import { materials as builtin } from '@easyink/builtin/all/designer'

const designerMaterials = [...builtin, priceTagDesigner]
```

`ui.palette[].group` 决定目录分组，`order` 决定同组顺序。目录、属性、locale 和 AI 信息都跟随物料声明，不需要额外的 catalog registry。

## Viewer 声明 {#viewer-material}

Viewer 使用同一个 model，但需要独立的输出 renderer。renderer 可以直接提供，也可以用 `loadRenderer` 延迟加载；两者都属于完整 `ViewerMaterial`。

```ts
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import { priceTagModel } from './model'

export const priceTagViewer: ViewerMaterial = {
  model: priceTagModel,
  renderer: {
    render(node, context) {
      const element = context.document.createElement('span')
      element.textContent = `${String(context.resolvedProps.label ?? '')} ${String(context.resolvedProps.price ?? '')}`
      element.style.display = 'inline-block'
      return { element }
    },
  },
}
```

创建 Viewer 时一次性选择完整声明：

```ts
import { materials as builtin } from '@easyink/builtin/all/viewer'
import { createViewer } from '@easyink/viewer'

const viewer = await createViewer({
  container,
  materials: [...builtin, priceTagViewer],
})

await viewer.open({ schema, data })
await viewer.destroy()
```

Viewer 不提供创建后的物料注册入口。这样 Designer 和 Viewer 的 model 身份、绑定和条件行为始终来自同一份声明，物料能力也不会因为宿主启动顺序而漂移。

## 属性值输入增强 {#prop-value-input}

`properties` 声明如何编辑 `node.props`。属性值来自宿主资产库或本地文件时，在 `editorOptions.valueInput` 声明输入通道：

```ts
import type { PropSchema } from '@easyink/plugin-api/designer'

const properties: PropSchema[] = [{
  key: 'content',
  label: 'company.logo.content',
  type: 'code',
  editorOptions: {
    language: 'html',
    valueInput: {
      kind: 'text-file',
      id: 'company.logo.importFile',
      source: 'logo-svg-content',
      accept: ['.svg', 'image/svg+xml'],
      maxBytes: 262144,
    },
  },
}]
```

图片 URL 属性使用 `kind: 'asset-url'`。宿主通过 `<EasyInkDesigner :interaction-provider>` 提供 `pickFileText(request)` 或 `pickAsset(request)`；选择结果作为普通属性值提交，Schema 只保存最终文本或 URL，不保存 `File`、DOM 或本地文件路径。

## 异步 renderer 与资源 {#lazy-renderer}

重型 Viewer renderer 可以通过 `loadRenderer` 延迟加载。加载器只接收框架提供的 `ResourceContext`，并在资源获得或 Viewer 销毁时释放自己持有的资源。

```ts
export const chartViewer: ViewerMaterial = {
  model: chartModel,
  loadRenderer: async resources => {
    const { renderChart } = await import('./viewer-renderer')
    resources.onDispose(() => {
      // 释放 renderer 创建的引擎、事件和缓存。
    })
    return { render: renderChart }
  },
}
```

取消或销毁只影响当前宿主。异步结果迟到时，框架会清理该物料的资源；应用不需要维护第二个 registry。

## 数据绑定 {#binding}

在 `model.binding` 中声明物料支持的绑定方式。renderer 从 `context.resolvedProps` 读取已经解析的值，不要在 DOM renderer 里自行读取业务数据。

```ts
const model: MaterialModel = {
  ...priceTagModel,
  binding: {
    kind: 'ordinary',
    primaryProp: 'price',
    formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
  },
}
```

绑定失败会由 Viewer 诊断并继续使用节点原始属性；物料 renderer 只负责渲染收到的 resolved props。

## 结构化数据物料 {#data-contract}

表格、图表或其它多行物料可以在自己的 renderer 中消费结构化数据契约。解析、分页和诊断逻辑应保持在物料包内，输出仍然是完整 `ViewerMaterial`。

```ts
const tableViewer: ViewerMaterial = {
  model: tableModel,
  renderer: {
    createSession(resources) {
      return {
        async prepare(node, context) {
          // 读取 context.resolvedProps 中的 records，准备当前文档的会话状态。
        },
        render(node, context) {
          return renderTable(node, context)
        },
      }
    },
  },
}
```

`createSession()` 的私有状态属于当前渲染任务，prepare、measure、分页和 render 共用它；计算结束即清理。输出仍需持有的资源在 render 的 `context.onDispose` 登记，直到预览替换、打印/导出结束或销毁才释放。`destroy()` 会等待异步清理完成。

## measure、分页与 page-aware {#layout}

只有布局确实需要运行时尺寸时才实现 `measure` 或 `getRenderSize`。分页物料可以在 Viewer renderer 上提供 `fragmentPaginator`；需要跨页复制的元素在 model 中声明 `pageAware`。这些能力必须与 model 的默认值和现有 Schema 行为一致。

不要通过 `node.type` 在框架外另建分支来替代物料声明。布局、条件和 binding 都应从当前完整材料集合取得。

## 检查清单 {#checklist}

发布自定义物料前，至少检查：

- Designer 和 Viewer 使用同一个 `model` 身份；两端 renderer 都在创建时传入；
- `createDefaultNode()` 只生成可序列化默认节点，默认值与单位稳定；
- properties、palette、locale、AI 描述和 binding 都来自物料本身；
- Viewer 输出只使用 `context.document`，不捕获宿主页面的 document；
- 异步 renderer、图表引擎、字体和事件都通过 `ResourceContext.onDispose` 清理；
- 绑定、条件、measure、分页和未知物料诊断有真实宿主测试；
- 更换物料集合时先 `await viewer.destroy()` 或 `await store.destroy()`；
- 内置集合从 `@easyink/builtin/all/designer` 和 `@easyink/builtin/all/viewer` 分别选择。
