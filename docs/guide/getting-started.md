# 快速上手

本指南帮助你在 5 分钟内跑通 Designer（设计器）和 Viewer（预览器）。

## 环境要求

- Node.js >= 18
- pnpm >= 9

## 安装

大多数场景只需安装面向应用的两个包（完整包列表见 [包概览](/guide/packages)）：

```bash
# 设计器（包含完整的编辑工作台）
pnpm add @easyink/designer

# 预览器（独立的渲染/打印/导出引擎）
pnpm add @easyink/viewer
```

## 使用 Designer

Designer 是一个 Vue 3 组件，通过 `v-model:schema` 双向绑定文档模板。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { EasyInkDesigner, createLocalStoragePreferenceProvider } from '@easyink/designer'
import { zhCN } from '@easyink/designer/locale'
import '@easyink/designer/index.css'

// 文档模板 -- 设计器的唯一数据源
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

// 偏好持久化（可选，保存面板布局、缩放等用户偏好）
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

设计器内置 `zhCN` 和 `enUS` 两套语言包，推荐继续从 `@easyink/designer/locale` 引入；语言包实现由独立的 `@easyink/locales` 包维护，并通过设计器透出。

### 添加数据源

数据源定义了可绑定的字段树，用户可以通过拖拽将字段绑定到元素上。

```ts
import type { DataSourceDescriptor } from '@easyink/designer'

const dataSources: DataSourceDescriptor[] = [{
  id: 'order',
  name: '订单数据',
  fields: [
    { name: 'orderNo', path: 'orderNo', title: '订单号', use: 'text' },
    { name: 'customerName', path: 'customerName', title: '客户名称', use: 'text' },
    { name: 'qrcode', path: 'qrcode', title: '二维码', use: 'image' },
  ],
}]
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :data-sources="dataSources"
  :locale="zhCN"
  :preference-provider="preferenceProvider"
/>
```

### 自动保存

配置 `auto-save` 属性，设计器会在 Schema 变化后自动调用你的保存回调。

```ts
const autoSaveOptions = {
  enabled: true,
  delay: 1000, // 防抖延迟（毫秒）
  save: async (schemaSnapshot) => {
    // 保存到你的后端
    await fetch('/api/templates/1', {
      method: 'PUT',
      body: JSON.stringify({ schema: schemaSnapshot }),
    })
  },
}
```

## 使用 Viewer

Viewer 是一个命令式 API，通过 `createViewer()` 创建运行时实例。通常运行在 iframe 中以实现样式隔离。

```vue
<script setup lang="ts">
import { createIframeViewerHost, createViewer } from '@easyink/viewer'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: Object, default: () => ({}) },
})

const iframeRef = ref()
let viewer

onMounted(async () => {
  // 1. 创建 iframe host
  const host = createIframeViewerHost(iframeRef.value)

  // 2. 创建 viewer 运行时
  viewer = createViewer({ host })

  // 3. 打开文档（传入 Schema + 数据）
  await viewer.open({
    schema: props.schema,
    data: props.data,
  })
})

onBeforeUnmount(() => {
  viewer?.destroy()
})
</script>

<template>
  <iframe ref="iframeRef" style="width: 100%; height: 100%; border: none;" />
</template>
```

### 打印与导出

Viewer 内置浏览器打印支持，同时支持注册自定义打印驱动和导出插件。

```ts
// 浏览器打印
await viewer.print({ driverId: 'browser' })

// 导出 PDF（需要注册导出插件）
const blob = await viewer.exportDocument({
  format: 'pdf',
  entry: 'preview',
  onProgress: (progress) => console.log(progress),
})
```

## 下一步

- [核心概念](/guide/concepts) -- Schema、物料、数据源、三种状态模型
- [Designer 详解](/designer/) -- 组件 Props、数据绑定、自动保存
- [Viewer 详解](/viewer/) -- Host 模式、打印导出、诊断
