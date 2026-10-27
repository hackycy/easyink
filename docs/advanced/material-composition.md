---
description: 在 Designer 和 Viewer 中使用完整 text/image 物料。
---

# text/image 完整组合

物料根入口提供 Designer 完整定义，`/viewer` 提供同名 Viewer 定义。应用选好数组再创建宿主；目录、属性、文案和 AI 描述随 Designer 物料提供。

```vue
<script setup lang="ts">
import { EasyInkDesigner } from '@easyink/designer'
import { image } from '@easyink/material-image'
import { text } from '@easyink/material-text'
import { ref } from 'vue'

const schema = ref({})
const materials = [text, image]
</script>

<template>
  <EasyInkDesigner v-model:schema="schema" :materials="materials" />
</template>
```

Viewer 使用隔离的物理入口，可同时导入节点工厂和默认值：

```ts
import { createImageNode, image } from '@easyink/material-image/viewer'
import { createTextNode, text } from '@easyink/material-text/viewer'
import { normalizeDocumentSchema } from '@easyink/schema'
import { createViewer } from '@easyink/viewer'

const container = document.createElement('div')
const viewer = await createViewer({ container, materials: [text, image] })
await viewer.open({
  schema: normalizeDocumentSchema({
    elements: [
      createTextNode({ props: { content: 'Hello' } }),
      createImageNode({ props: { src: 'https://example.test/logo.png' } }),
    ],
  }),
})
await viewer.destroy()
```

替换渲染器时保留模型，绑定和条件继续由模型驱动：

```ts
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import { text } from '@easyink/material-text/viewer'

const customText: ViewerMaterial = {
  model: text.model,
  renderer: {
    render(_node, context) {
      const element = context.document.createElement('span')
      element.textContent = String(context.resolvedProps.content ?? '')
      return { element }
    },
  },
}
```

未选择的物料节点保留并显示未知物料诊断。所选物料必须有 renderer 或受管 loadRenderer；已声明 loader 的加载失败显示局部不可用诊断，其他节点继续输出。缺少可选 palette、properties 或 AI 只影响对应功能。
