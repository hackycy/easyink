---
description: '@easyink/designer 提供完整的 Vue 设计工作台组件，支持画布编辑、物料拖放、数据绑定、撤销重做、自动保存和 Contribution 扩展。'
---

# Designer {#designer}

`@easyink/designer` 提供的是一个完整的 Vue 组件，而不是一组零散拼装件。你把它嵌进页面，传入模板、数据源和宿主能力，它就能给你一个可以工作的编辑工作台。

## 最小用法 {#basic-usage}

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { EasyInkDesigner, createLocalStoragePreferenceProvider } from '@easyink/designer'
import { zhCN } from '@easyink/designer/locale'
import '@easyink/designer/index.css'

const schema = ref({})
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

这段代码已经能让 Designer 跑起来。`schema` 可以先传空对象，组件内部会在进入 `DesignerStore` 前把它归一化成完整模板。

## 常用输入 {#common-props}

当前组件实现里，你最常碰到的是这些输入：

| 属性 | 作用 |
| --- | --- |
| `schema` | 模板输入，支持 `v-model:schema` |
| `dataSources` | 设计时字段树 |
| `locale` | 语言包 |
| `preferenceProvider` | 工作台偏好持久化 |
| `autoSave` | 模板自动保存 |
| `fontProvider` | 字体目录和字体加载器 |
| `setupStore` | 初始化 store 后做自定义注册 |
| `contributions` | 注册面板、工具栏动作和命令扩展 |
| `interactionProvider` | 接管确认和资产选择这类交互 |

如果你只是做业务接入，`schema`、`dataSources`、`locale`、`preferenceProvider` 和 `autoSave` 最常用。剩下几项通常在你开始做二次开发时才会用到。

## `schema` 自动补齐 {#schema-normalization}

先看一个例子：

```ts
const schema = ref({
  page: { width: 80, height: 120 },
})
```

这份输入不完整，但 Designer 仍然能工作。原因很简单：它内部会把输入补成完整 `DocumentSchema`，再交给 store 和后续流程。

这也是为什么：

- `update:schema` 回传给你的会是完整模板。
- 自动保存拿到的也是完整模板。
- 你不需要自己先手写所有默认字段。

## 自动保存与偏好持久化 {#autosave-and-preferences}

很多业务项目第一次接入时会把这两件事写成一个接口，后面就会越来越乱。

先看两者各自负责什么：

| 能力 | 存什么 |
| --- | --- |
| `autoSave` | 模板内容，也就是 `DocumentSchema` |
| `preferenceProvider` | 窗口布局、缩放、面板开关、吸附设置 |

先看代码：

```ts
const autoSave = {
  enabled: true,
  delay: 1000,
  save: async (schemaSnapshot) => {
    await saveTemplate(schemaSnapshot)
  },
}

const preferenceProvider = createLocalStoragePreferenceProvider()
```

如果你的目标是“模板别丢”和“用户习惯别丢”，这两条能力都应该保留，但别让它们共用一套存储语义。

## 数据源接入 {#data-sources}

Designer 不负责请求业务数据，它只消费一份字段树。

```ts
const dataSources = [
  {
    id: 'order',
    name: '订单',
    fields: [
      { name: 'orderNo', path: 'orderNo', title: '订单号', use: 'text' },
    ],
  },
]
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :data-sources="dataSources"
/>
```

这时 Designer 会把字段树注册进内部数据源注册表，并在左侧面板里展示出来。用户后续做的是拖拽绑定，不是直接传运行时数据。

## 字体接入 {#fonts}

如果你的模板要用业务字体，先给 `fontProvider`。

```ts
import type { FontProvider } from '@easyink/designer'

const fontProvider: FontProvider = {
  async listFonts() {
    return [
      {
        family: 'SourceHanSans',
        displayName: '思源黑体',
        weights: ['400', '700'],
        styles: ['normal'],
        preview: 'EasyInk 字体预览',
      },
    ]
  },
  async loadFont(family, weight, style) {
    return `/fonts/${encodeURIComponent(family)}-${weight ?? '400'}-${style ?? 'normal'}.woff2`
  },
}
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :font-provider="fontProvider"
/>
```

Designer 会自己负责加载字体和注入 `@font-face`。宿主不用再手写一套重复的注入逻辑。

## `setupStore` 用途 {#setup-store}

当你需要在初始化时做一次注册或定制，就可以用 `setupStore`。

最常见的场景是注册自定义物料，或者在 store 初始化后接入自己的扩展逻辑。这个回调会在内置物料注册、`fontProvider` 设置之后执行。

```ts
import type { DesignerStore } from '@easyink/designer'

function setupStore(store: DesignerStore) {
  console.log(store.schema.unit)
}
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :setup-store="setupStore"
/>
```

这已经属于进阶能力了。如果你还没到这一层，先把 Designer 跑顺就好。

## Contribution 扩展 {#contributions}

如果你要挂面板、工具栏按钮或命令，用 `contributions`。

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :contributions="contributions"
/>
```

`contributions` 会交给内部的 `ContributionRegistry` 激活。它和 `setupStore` 的边界不一样：`setupStore` 适合直接操作 store 做注册，`contributions` 适合把面板、工具栏动作和命令作为一组扩展交给 Designer。

完整写法可以继续看 [贡献扩展开发](/advanced/contributions)。

## 宿主交互接管 {#interaction-provider}

Designer 支持把确认和资产选择这类交互交给宿主控制。

先看一个确认示例：

```ts
const interactionProvider = {
  async confirm(request) {
    return openBusinessConfirmDialog(request)
  },
}
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :interaction-provider="interactionProvider"
/>
```

这很适合接你的业务弹窗、权限策略和审计流程。你不用去改 Designer 内部组件，就能把交互接回自己的系统。

## Store 访问 {#store-access}

如果你写的是 Designer 内部子组件或贡献面板，可以直接通过 `useDesignerStore()` 取到 store。

```ts
import { useDesignerStore } from '@easyink/designer'

const store = useDesignerStore()
```

这个 hook 依赖 Vue 注入，所以必须在 `EasyInkDesigner` 组件树内使用。脱离组件树单独调用会直接报错。

## 顶栏插槽与扩展入口 {#topbar-slot}

Designer 还提供一个顶栏插槽：

```vue
<EasyInkDesigner v-model:schema="schema">
  <template #topbar>
    <div>My Header</div>
  </template>
</EasyInkDesigner>
```

如果你需要的不是简单插槽，而是按钮、面板、命令和诊断订阅，那就继续往 [贡献扩展开发](/advanced/contributions) 看。

## 样式导入 {#styles}

最后一个容易漏掉的点，是样式入口：

```ts
import '@easyink/designer/index.css'
```

如果你看到组件能挂载，但界面布局明显不对，先检查这里。

关于 Designer，目前知道这些就够用了。接下来最适合继续读的是：

- [数据绑定](./data-binding)
- [自动保存](./auto-save)
- [字体管理](./fonts)
- [样式自定义](./styling)
