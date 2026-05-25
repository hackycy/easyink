# 快速上手

这页只做一件事：让你先把一份模板跑起来。

我们会先把 Designer 嵌进 Vue 页面，再用同一份 `schema` 交给 Viewer 预览。这样你很快就能建立起 EasyInk 最重要的心智模型：Designer 负责编辑，Viewer 负责消费，二者之间只传 `schema + data`。

## 先准备环境

- Node.js 18 或更高版本
- pnpm 9 或更高版本
- 一个 Vue 3 + TypeScript 项目

先安装两个最常用的包：

```bash
pnpm add @easyink/designer @easyink/viewer
```

上面这两个包已经覆盖了大多数业务的第一阶段接入。关于其它包怎么选，后面再看 [包概览](/guide/packages) 就行。

## 先把 Designer 跑起来

`EasyInkDesigner` 是一个 Vue 组件。你给它一个 `schema`，它负责把缺省字段补齐，并在编辑时通过 `v-model:schema` 把完整模板回传给你。

先看一个最小示例：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { EasyInkDesigner, createLocalStoragePreferenceProvider } from '@easyink/designer'
import { zhCN } from '@easyink/designer/locale'
import '@easyink/designer/index.css'

const schema = ref({
  unit: 'mm',
  page: {
    mode: 'fixed',
    width: 210,
    height: 297,
  },
  guides: { x: [], y: [] },
  elements: [],
})

const preferenceProvider = createLocalStoragePreferenceProvider()
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :locale="zhCN"
    :preference-provider="preferenceProvider"
  />
</template>
```

上面这段代码里，真正需要你先记住的只有两点：

- `schema` 是模板的唯一数据源。
- `preferenceProvider` 存的是工作台偏好，不是模板内容。

如果你现在只想先看到画布，这些就够了。

## 给 Designer 加一份数据源

接下来你通常会想做第二件事：把业务字段拖到画布上。

EasyInk 用 `DataSourceDescriptor` 描述一棵字段树。Designer 只消费这个字段树本身，不会替你请求业务数据。

```ts
import type { DataSourceDescriptor } from '@easyink/designer'

const dataSources: DataSourceDescriptor[] = [
  {
    id: 'order',
    name: '订单',
    fields: [
      { name: 'orderNo', path: 'orderNo', title: '订单号', use: 'text' },
      { name: 'customerName', path: 'customerName', title: '客户名称', use: 'text' },
      { name: 'qrcode', path: 'qrcode', title: '二维码', use: 'image' },
    ],
  },
]
```

再把它传给组件：

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :data-sources="dataSources"
  :locale="zhCN"
  :preference-provider="preferenceProvider"
/>
```

这时你就能在设计器里看到字段面板，并把字段拖到元素上了。

## 打开自动保存

模板能编辑之后，通常下一步就是保存。

Designer 内置了一层自动保存控制器。你只需要提供 `save` 回调，它会在模板变化后按 `delay` 防抖调用，并把当前 `DocumentSchema` 快照传给你。

```ts
const autoSave = {
  enabled: true,
  delay: 1000,
  save: async (schemaSnapshot) => {
    await fetch('/api/templates/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema: schemaSnapshot }),
    })
  },
}
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :data-sources="dataSources"
  :locale="zhCN"
  :preference-provider="preferenceProvider"
  :auto-save="autoSave"
/>
```

这里先知道一件事就够了：自动保存存的是模板，偏好持久化存的是工作台状态。两者互不替代。

## 再把同一份模板交给 Viewer

当你已经能编辑模板时，就可以开始预览了。

Viewer 是命令式运行时。你创建实例，调用 `open({ schema, data })`，它就会完成校验、绑定解析、渲染和分页。

先看最常见的 iframe 用法：

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createViewer } from '@easyink/viewer'

const props = defineProps<{
  schema: Record<string, unknown>
  data?: Record<string, unknown>
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
let viewer: ReturnType<typeof createViewer> | undefined

onMounted(async () => {
  if (!iframeRef.value)
    return

  viewer = createViewer({ iframe: iframeRef.value })
  await viewer.open({
    schema: props.schema as never,
    data: props.data,
  })
})

onBeforeUnmount(() => {
  viewer?.destroy()
})
</script>

<template>
  <iframe ref="iframeRef" style="width: 100%; height: 100%; border: 0;" />
</template>
```

上面这段代码演示了 Viewer 最重要的输入契约：它只接收 `schema` 和运行时 `data`。Designer 里的 `dataSources` 不会传进来。

## 试一下打印和导出

当文档已经打开后，打印和导出就是下一层能力。

先看调用方式：

```ts
await viewer.print()

const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'preview',
  onProgress(event) {
    console.log(event.current, event.total)
  },
})
```

这里有个细节值得先记住：`print()` 默认走浏览器打印；`exportDocument()` 则要求你先注册对应格式的导出器。关于这两条链路的完整接法，后面分别去看 Viewer 章节就行。

## 你现在应该已经知道什么

到这里，你已经具备了三个基础动作：

- 用 `EasyInkDesigner` 编辑模板。
- 用 `dataSources` 给模板提供设计时字段树。
- 用 `createViewer().open({ schema, data })` 预览同一份模板。

关于 EasyInk，目前先掌握这些就够用了。继续往下读时，建议按这个顺序走：

- [核心概念](/guide/concepts)
- [Designer 概述](/designer/)
- [Viewer 概述](/viewer/)
