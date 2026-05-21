# Designer

[![npm](https://img.shields.io/npm/v/@easyink/designer?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/designer)

`@easyink/designer` 是面向开发者的文档/报表设计器框架。基于 Vue 3 + TypeScript，设计器与预览器分离，以组件形式嵌入宿主应用。内置画布编辑、物料拖放、数据绑定、撤销重做、自动保存等能力，开箱即用。

## 基本用法

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

## 组件 Props

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schema` | `DocumentSchemaInput` | 否 | 文档模板输入，支持 `v-model:schema` 双向绑定；缺失字段会自动补默认值 |
| `dataSources` | `DataSourceDescriptor[]` | 否 | 数据源描述符列表，定义可绑定的字段树 |
| `locale` | `LocaleMessages` | 否 | 国际化消息，如 `zhCN` / `enUS`；推荐从 `@easyink/designer/locale` 引入 |
| `preferenceProvider` | `PreferenceProvider` | 否 | 用户偏好持久化 provider |
| `autoSave` | `TemplateAutoSaveOptions` | 否 | 自动保存配置 |
| `contributions` | `Contribution[]` | 否 | 贡献扩展列表（如 AI 面板） |
| `setupStore` | `(store: DesignerStore) => void` | 否 | Store 初始化回调，用于注册自定义物料 |

`schema` 是宿主输入，不要求传完整对象。传 `undefined`、`{}` 或只传部分字段时，设计器会在进入 `DesignerStore` 前归一化为完整 `DocumentSchema`，例如自动补齐 `version`、`unit`、`page`、`guides` 和 `elements`。`update:schema`、自动保存和 store 内部读到的始终是完整 Schema。

## Slots

| Slot | 说明 |
|------|------|
| `#topbar` | 自定义顶栏内容，通过 Teleport 挂载到顶栏区域 |

## 数据持久化

Designer 有两种独立的持久化机制，各管一件事：

| | 自动保存 (`autoSave`) | 偏好持久化 (`preferenceProvider`) |
|---|---|---|
| **存什么** | 模板内容（DocumentSchema） | 工作台偏好（窗口布局、缩放、吸附设置等） |
| **存到哪** | 宿主提供的 `save` 回调（通常是后端 API） | 默认 localStorage，也可自定义 |
| **用户感知** | 状态栏显示保存状态 | 无感，静默保存 |
| **是否进入 undo/redo** | 是 | 否 |

两者互补：自动保存保证模板内容不丢失，偏好持久化保证用户的编辑环境设置不丢失。

## 自动保存

```ts
const autoSaveOptions = {
  enabled: true,
  delay: 1000,
  save: async (schemaSnapshot: DocumentSchema) => {
    // schemaSnapshot 是当前 Schema 的快照
    await saveToBackend(schemaSnapshot)
  },
}
```

自动保存的工作流程：
1. 用户编辑触发 Schema 变化
2. 经过 `delay` 毫秒防抖后调用 `save` 回调
3. 保存期间状态栏显示保存状态（保存中/已保存/保存失败）

详细配置（并发保护、动态启用、模板切换配合等）见 [自动保存](./auto-save.md)。

## 偏好持久化

通过 `PreferenceProvider` 接口保存和恢复用户的工作台偏好。这些偏好不进入 Schema，不影响 undo/redo。

**持久化范围**：窗口显隐/位置/尺寸、工具栏排列、面板开关、画布缩放、吸附设置。

```ts
// 使用 localStorage 持久化
const preferenceProvider = createLocalStoragePreferenceProvider()
```

也可以自定义持久化方式：

```ts
const preferenceProvider = {
  get: async (key: string) => {
    // 从你的存储读取
  },
  set: async (key: string, value: unknown) => {
    // 写入你的存储
  },
}
```

## 自定义物料

通过 `setupStore` 回调可以接入自定义物料。

这属于高级二次开发：不仅涉及 Designer 注册，还会同时涉及 Schema、Viewer 渲染、数据绑定和调试。

完整流程见 [进阶 / 自定义物料开发](/advanced/custom-materials)。

## 贡献扩展

通过 `Contribution` API，宿主可以向设计器注入自定义面板、工具栏动作、命令和诊断订阅，而不用修改 Designer 源码。

这同样属于高级自定义能力。真正要落地时，关键不只是 `activate()` 怎么写，而是命令、面板、工具栏和宿主业务之间的职责划分。

完整教程见 [进阶 / 贡献扩展开发](/advanced/contributions)。

## Store 访问

在 `EasyInkDesigner` 子组件内通过 `useDesignerStore()` 获取 Store 实例（基于 Vue `inject`，必须在组件树内调用）。

```ts
import { useDesignerStore } from '@easyink/designer'

const store = useDesignerStore()

// 元素操作
store.addElement(node)
store.removeElement(id)
store.updateElement(id, { width: 200 })

// Schema 操作
store.setSchema(newSchema)

// 国际化
store.t('common.save')
```

## 国际化

内置中英文语言包，也支持自定义。语言包实现位于独立的 `@easyink/locales` 包中，`@easyink/designer/locale` 会继续透出这些语言包，应用侧不需要直接依赖内部维护包。

```ts
import { enUS, zhCN } from '@easyink/designer/locale'

// 使用内置中文
<EasyInkDesigner :locale="zhCN" />

// 使用内置英文
<EasyInkDesigner :locale="enUS" />

// 自定义语言包（结构参考 zhCN）
const myLocale = { /* ... */ }
<EasyInkDesigner :locale="myLocale" />
```

## CSS 引入

必须在入口文件中引入样式：

```ts
import '@easyink/designer/index.css'
```

## 样式自定义

Designer 的主题定制目前主要基于 CSS 变量和类名覆盖，详细说明见 [样式自定义](./styling.md)。
