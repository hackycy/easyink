---
description: Designer 自动保存配置：模板变化后防抖保存 Schema 快照，支持自定义触发策略和存储方式。
---

# 自动保存

自动保存这层能力很适合早点接上，因为它的职责非常单一：模板一旦变化，就在防抖之后把当前 Schema 快照交给你保存。

## 自动保存配置

```ts
const autoSave = {
  enabled: true,
  delay: 1000,
  save: async (schemaSnapshot) => {
    await saveTemplate(schemaSnapshot)
  },
}
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :auto-save="autoSave"
/>
```

上面这段配置已经够大多数项目使用了。

## 回调参数

你拿到的不是一个可变引用，而是当前模板的快照。当前实现会在保存前克隆一份 `store.schema`，再把这份结果传给 `save`。

这意味着两件事：

- 你可以放心把它直接序列化发给后端。
- 不要指望在 `save` 回调里修改它，去反向驱动 Designer 状态。

## 触发机制

内部流程可以简单理解成这样：

```text
schema 变化
  -> 标记草稿已修改
  -> 按 delay 防抖
  -> 调用 save(schemaSnapshot)
  -> 更新状态栏保存状态
```

如果你看到界面上有保存中、已保存、保存失败这些状态，它们就是围着这条流程更新的。

## 变更排队

自动保存内部已经处理了一个很常见的问题：上一次保存还没完成，用户又继续改了模板。

当前实现会把新的保存请求排队，而不是直接丢掉。前一次保存结束后，如果中间还有变更，就会继续执行下一次保存。

所以你不需要自己再额外套一层“保存中就忽略新请求”的逻辑。那样反而容易把后续修改吞掉。

## 动态启停

如果你的页面里只有在模板真正加载后才允许保存，把 `autoSave` 做成响应式对象就可以。

```ts
import { computed, ref } from 'vue'

const currentTemplateId = ref<string | null>(null)

const autoSave = computed(() => ({
  enabled: currentTemplateId.value != null,
  delay: 1000,
  save: saveTemplate,
}))
```

当 `enabled` 变成 `false` 时，内部会重置当前自动保存运行状态。

## 模板切换保护

你可能已经想到一个问题：如果我从服务器加载一份新模板，Designer 不是也会感知到 `schema` 变化吗？

是的，但当前组件内部已经处理了这个场景。它在替换 Schema 时会先标记“这次变化来自模板加载”，从而抑制紧接着那次自动保存触发。

所以正常接入时，你不需要自己去调用内部的 `markSchemaLoaded()`。组件已经帮你做了。

## 自动保存接入方案

如果你刚开始接自动保存，建议先做到这三件事：

1. `save` 回调只负责保存，不做额外 UI 副作用。
2. 后端接口接受完整 Schema。
3. 模板切换和模板保存走两条明确的业务路径。

这样后面再补保存版本、冲突提示或审计日志时，会轻松很多。

关于自动保存，目前知道这些就够了。接下来可以继续看 [数据绑定](./data-binding) 或 [字体管理](./fonts)。
