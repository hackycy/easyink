# EasyInk

EasyInk 是一个面向开发者的文档/报表编辑框架，核心原则是把编辑态和运行态彻底拆开。

- `@easyink/designer` 只负责编辑工作台、画布交互、面板系统和设计态状态。
- `@easyink/viewer` 负责预览、打印、导出和运行时渲染。
- 模板列表、模板权限、未保存确认、预览入口、导出适配器都属于宿主应用，不再内置在 designer 内。
- `@easyink/samples` 只提供示例 schema、示例 data 和示例 datasource，用于演示、测试和脚手架参考，不是模板库产品。

## Package Roles

- `@easyink/schema`: 文档模型、迁移、校验、序列化。
- `@easyink/core`: 命令、选择、几何、分页和设计器/Viewer 共用纯逻辑。
- `@easyink/datasource`: 设计态字段树和绑定元数据。
- `@easyink/designer`: 编辑器工作台。
- `@easyink/viewer`: 运行时预览、打印、导出。
- `@easyink/samples`: 示例资产。

## Host Integration

推荐的接入方式是宿主同时引入 designer 和 viewer，自行决定何时打开预览、传什么数据、以及是否允许模板切换。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { EasyInkDesigner } from '@easyink/designer'
import type { DocumentSchema } from '@easyink/designer'
import { flowInvoiceTemplate, invoiceDemoData, sampleDataSources } from '@easyink/samples'
import PreviewOverlay from './PreviewOverlay.vue'

const schema = ref<DocumentSchema>(flowInvoiceTemplate)
const showPreview = ref(false)
const previewSchema = ref<DocumentSchema>()

function openPreview() {
  previewSchema.value = JSON.parse(JSON.stringify(schema.value))
  showPreview.value = true
}
</script>

<template>
  <EasyInkDesigner v-model:schema="schema" :data-sources="sampleDataSources">
    <template #topbar>
      <button @click="openPreview">
        预览
      </button>
    </template>
  </EasyInkDesigner>

  <PreviewOverlay
    v-if="showPreview && previewSchema"
    :schema="previewSchema"
    :data="invoiceDemoData"
    @close="showPreview = false"
  />
</template>
```

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createViewer, registerBuiltinViewerMaterials } from '@easyink/viewer'

const props = defineProps<{
  schema: import('@easyink/viewer').DocumentSchema
  data: Record<string, unknown>
}>()

const containerRef = ref<HTMLDivElement>()

onMounted(async () => {
  if (!containerRef.value)
    return

  const viewer = createViewer({ container: containerRef.value })
  registerBuiltinViewerMaterials(viewer)
  await viewer.open({ schema: props.schema, data: props.data })
})
</script>
```

宿主需要自己处理这些边界：

- 预览使用哪份 data。
- 模板选择后是否覆盖当前 schema。
- 未保存修改时是否弹确认。
- 导出适配器和文件落地方式。

完整示例见 `playground/`。架构文档索引见 `.github/architecture/README.md`。

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

## License

[MIT](./LICENSE)
