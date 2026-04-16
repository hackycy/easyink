<script setup lang="ts">
import type { DocumentSchema } from '@easyink/viewer'
import type { ViewerRuntime } from '@easyink/viewer'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createViewer, registerBuiltinViewerMaterials } from '@easyink/viewer'

const EXPORT_FORMAT = 'playground-demo-json'

const props = defineProps<{
  schema: DocumentSchema
  data: Record<string, unknown>
}>()

const emit = defineEmits<{
  close: []
}>()

const containerRef = ref<HTMLDivElement>()
let viewer: ViewerRuntime | undefined

onMounted(async () => {
  if (!containerRef.value)
    return

  viewer = createViewer({ container: containerRef.value })
  registerBuiltinViewerMaterials(viewer)
  viewer.registerExportAdapter({
    id: 'playground-demo-export',
    format: EXPORT_FORMAT,
    async export(context) {
      return new Blob(
        [JSON.stringify({ schema: context.schema, data: context.data ?? {} }, null, 2)],
        { type: 'application/json' },
      )
    },
  })
  await viewer.open({
    schema: props.schema,
    data: props.data,
  })
})

onBeforeUnmount(() => {
  viewer?.destroy()
  viewer = undefined
})

async function handlePrint() {
  await viewer?.print()
}

async function handleExport() {
  const blob = await viewer?.exportDocument(EXPORT_FORMAT)
  if (!(blob instanceof Blob)) {
    return
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'easyink-preview-export.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="preview-overlay">
    <div class="preview-toolbar">
      <span class="preview-hint">宿主注入 schema、data 与导出适配器；designer 只负责编辑。</span>
      <button class="preview-btn" @click="handleExport">
        导出
      </button>
      <button class="preview-btn" @click="handlePrint">
        打印
      </button>
      <button class="preview-btn" @click="emit('close')">
        关闭
      </button>
    </div>
    <div ref="containerRef" class="preview-content" />
  </div>
</template>

<style scoped>
.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.5);
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
}

.preview-hint {
  color: #666;
  font-size: 13px;
}

.preview-btn {
  padding: 4px 16px;
  font-size: 13px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #333;
}

.preview-btn:hover {
  background: #f5f5f5;
}

.preview-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}
</style>
