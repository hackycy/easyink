---
description: '@easyink/designer 提供完整的 Vue 设计工作台组件，支持画布编辑、物料拖放、数据绑定、撤销重做、自动保存和独立 Designer 扩展。'
---

# Designer {#designer}

`@easyink/designer` 提供的是一个完整的 Vue 组件，而不是一组零散拼装件。你把它嵌进页面，传入模板、数据源和宿主能力，它就能给你一个可以工作的编辑工作台。

## 最小用法 {#basic-usage}

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { materials } from '@easyink/builtin/all/designer'
import { EasyInkDesigner, createLocalStoragePreferenceProvider } from '@easyink/designer'
import { zhCN } from '@easyink/designer/locale'
import '@easyink/designer/index.css'

const schema = ref({})
const preferenceProvider = createLocalStoragePreferenceProvider()
const designerMaterials = materials
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :locale="zhCN"
    :materials="designerMaterials"
    :preference-provider="preferenceProvider"
  />
</template>
```

这段代码已经能让 Designer 跑起来，并注册全部内置设计态物料。`schema` 可以先传空对象，组件内部会在进入 `DesignerStore` 前把它归一化成完整模板。

组件 ref 提供 `destroy()`，返回可等待且重复调用共享的清理 Promise。卸载会触发同一清理流程；需要确认资源已经释放的宿主，在卸载前保留该 Promise 并等待它。

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
| `materials` | 创建时选择的完整 Designer 物料声明 |
| `runtimeConfig` | 配置纸张预设和新建模板默认值 |
| `extensions` | 创建时选择的独立 Designer 命令和 UI 扩展 |
| `interactionProvider` | 接管确认、资产选择、上传和文件读取这类交互 |

如果你只是做业务接入，`schema`、`dataSources`、`locale`、`preferenceProvider` 和 `autoSave` 最常用。剩下几项通常在你开始做二次开发时才会用到。

## 运行时配置 {#runtime-config}

如果你想选择物料，或者给纸张下拉框加企业纸张，分别使用 `materials` 和 `runtimeConfig`。

先看一个常见配置：

```ts
import type { DesignerRuntimeConfig } from '@easyink/designer'
import { materials } from '@easyink/builtin/basic/designer'

const runtimeConfig: DesignerRuntimeConfig = {
  paper: {
    mode: 'append',
    presets: [
      { name: '企业标签 80x50', width: 80, height: 50 },
      { name: '热敏票据 76x130', width: 76, height: 130 },
    ],
    defaultPreset: '企业标签 80x50',
  },
}
const designerMaterials = materials
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :materials="designerMaterials"
  :runtime-config="runtimeConfig"
/>
```

上面这段配置做了两件事：

- 物料栏选择内置基础物料。
- 在页面属性的纸张预设里追加两种企业纸张，并把新建空模板的默认纸张设为 `企业标签 80x50`。

你可能已经有疑问了：`defaultPreset` 会不会覆盖已有模板？不会。它只在输入 schema 没有显式 `page.width` / `page.height` 时生效。如果你打开的是已有模板，模板自己的页面尺寸优先。

## 内置物料范围 {#builtin-material-set}

内置物料由 `@easyink/builtin` 提供。Designer 不会自动内置它；在组件创建时通过 `materials` 选择完整 Designer 物料集合。业务接入直接使用宿主对应的公开子路径。

```ts
import { materials } from '@easyink/builtin/all/designer'

const designerMaterials = materials
```

可选子路径有三个：

| 子路径 | 注册内容 | 适合场景 |
| --- | --- | --- |
| `@easyink/builtin/all/designer` | 全部内置 Designer 物料 | 需要完整设计能力 |
| `@easyink/builtin/basic/designer` | 内置基础集合：排除图表和签名，保留文本、图片、线条、矩形、数据表格、SVG 等常用物料 | 需要常用编辑能力，但不想引入图表和签名 |
| `@easyink/builtin/none` | 空集合 | 你要完全使用自己的物料，同时保留统一接入形态 |

这里有两个概念容易混在一起：

- `@easyink/builtin/basic/designer` 控制的是“选择哪些内置 Designer 物料能力”。
- 物料栏里的“基础”“数据”“图表”等分组，来自每个物料的 `ui.palette` 声明。

也就是说，`basic/designer` 不是物料面板分类 API。它只是一个内置物料范围；真正决定物料出现在哪个分类、分类标题怎么翻译、以及分类顺序的，是 `ui.palette`。

如果你传入空数组，画布仍然能打开，但没有可拖拽的内置物料。这个模式通常要配合自定义物料使用：

```ts
const designerMaterials = [...enterpriseMaterials]
```

关于自定义物料怎么写，可以继续看 [自定义物料开发](/advanced/custom-materials)。

物料自己的 `ui.palette` 声明会进入对应分类：

```ts
import { priceTagDesigner } from './materials/price-tag/designer'

const enterpriseMaterials = [priceTagDesigner]
```

`ui.palette[].group` 是分类的稳定标识，`label` 是翻译 key，`order` 决定分类顺序。你可以复用内置的 `basic`、`data`、`chart`、`svg`、`utility`，也可以使用自己的业务分类。

## 纸张预设 {#paper-presets}

纸张预设控制的是页面属性面板里的“纸张”下拉框。

默认情况下，Designer 会带上 A3、A4、A5、Letter、Legal 等常用纸张。如果你只是想加企业自己的纸张，用 `append`：

```ts
const runtimeConfig = {
  paper: {
    mode: 'append',
    presets: [
      { name: '物流面单 100x150', width: 100, height: 150 },
    ],
  },
}
```

如果你的业务不想展示 EasyInk 默认纸张，只想展示自己的纸张，用 `replace`：

```ts
const runtimeConfig = {
  paper: {
    mode: 'replace',
    presets: [
      { name: '价签 40x30', width: 40, height: 30 },
      { name: '吊牌 55x90', width: 55, height: 90 },
    ],
  },
}
```

纸张尺寸目前按模板单位里的毫米语义填写。用户选中预设时，Designer 会同步更新 `page.width`、`page.height` 和 `page.pageModel.paper`，所以 Viewer 和打印链路看到的是同一份页面尺寸。

:::tip 提示
`name` 同时用作下拉显示和值匹配。我们建议你给企业纸张取稳定名称，比如 `物流面单 100x150`，不要用会频繁变化的营销文案。
:::

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

## 独立 Designer 扩展 {#contributions}

如果你要挂 overlay、工具栏按钮或命令，用 `extensions`。扩展声明通过 `@easyink/plugin-api/ui` 的 `DesignerExtension` 提供；物料选择使用 `materials`，纸张与模板默认值使用 `runtimeConfig`。

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :materials="designerMaterials"
  :extensions="extensions"
/>
```

框架在创建时安装声明，并为每个命令和 UI 挂载提供受控 context。组件以 `ready` / `error` 反馈创建结果；更换物料或扩展集合需要重新创建宿主。

完整写法可以继续看 [Designer 扩展开发](/advanced/contributions)。

## 宿主交互接管 {#interaction-provider}

Designer 支持把确认、资产选择、上传、文本文件读取这类交互交给宿主控制。

先看一个完整一点的例子：

```ts
const interactionProvider = {
  async confirm(request) {
    return openBusinessConfirmDialog(request)
  },

  async pickAsset(request) {
    const asset = await openAssetLibrary({
      accept: request.accept,
      currentUrl: request.currentUrl,
      source: request.source,
      payload: request.payload,
    })

    if (!asset)
      return null

    return {
      url: asset.url,
      assetId: asset.id,
      alt: asset.alt,
    }
  },

  async uploadAsset(request) {
    const uploaded = await uploadToYourServer(request.file)

    return {
      url: uploaded.url,
      assetId: uploaded.id,
      name: request.picked.name,
    }
  },

  async pickFileText(request) {
    const file = await openTextFileDialog(request.accept)
    if (!file)
      return null
    return {
      text: await file.text(),
      name: file.name,
      type: file.type,
      size: file.size,
    }
  },
}
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :interaction-provider="interactionProvider"
/>
```

这很适合接你的业务弹窗、权限策略、审计流程和素材库。

`pickAsset` 面向图片这类需要稳定 URL 的资源。如果你的素材库已经返回 URL，直接返回 `{ url }` 就行；如果用户从本地选了文件，可以让 `pickAsset` 返回 `{ file }`，Designer 会继续调用 `uploadAsset`，并把上传后的 URL 写回属性。

```ts
const interactionProvider = {
  async pickAsset(request) {
    const file = await openImageFileDialog(request.accept)
    return file ? { file, name: file.name } : null
  },

  async uploadAsset(request) {
    const uploaded = await uploadToYourServer(request.file)
    return { url: uploaded.url }
  },
}
```

`pickFileText` 面向 SVG/JSON/CSS 这类需要把文件文本写入属性值的场景，不会走上传或 data URL 链路。自定义物料想触发这些能力时，不需要自己写文件输入框，而是在属性声明里加 `editorOptions.valueInput`：

```ts
const propSchemas = [
  {
    key: 'src',
    label: 'materials.logo.property.src',
    type: 'image',
    editorOptions: {
      valueInput: {
        kind: 'asset-url',
        id: 'designer.logo.pickImage',
        source: 'logo-material',
        accept: ['image/*'],
      },
    },
  },
]
```

这条声明和宿主回调的对应关系是固定的：

- `valueInput.kind: 'asset-url'`：调用 `pickAsset`，如果返回 `{ file }`，继续调用 `uploadAsset`。
- `valueInput.kind: 'text-file'`：调用 `pickFileText`，把返回的 `text` 写入属性。

关于 `asset-url` 和 `text-file` 的物料侧声明，可以继续看 [自定义物料开发：属性值输入增强](/advanced/custom-materials#prop-value-input)。

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

如果你需要按钮、面板、命令和诊断上报，可以继续看 [Designer 扩展开发](/advanced/contributions)。

## 样式导入 {#styles}

最后一个容易漏掉的点，是样式入口：

```ts
import '@easyink/designer/index.css'
```

如果你看到组件能挂载，但界面布局明显不对，先检查这里。

关于 Designer，目前知道这些就够用了。接下来最适合继续读的是：

- [数据绑定](./data-binding)
- [Assistant 助手](./assistant)
- [自动保存](./auto-save)
- [字体管理](./fonts)
- [样式自定义](./styling)
