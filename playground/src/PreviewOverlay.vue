<script setup lang="ts">
import type { DataSourceDescriptor, DocumentSchema } from '@easyink/viewer'
import type { ViewerRuntime } from '@easyink/viewer'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createViewer, registerBuiltinViewerMaterials } from '@easyink/viewer'

const props = defineProps<{
  schema: DocumentSchema
  dataSources: DataSourceDescriptor[]
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
  await viewer.open({
    schema: props.schema,
    data: props.data,
    dataSources: props.dataSources,
  })
})

onBeforeUnmount(() => {
  viewer?.destroy()
  viewer = undefined
})

async function handlePrint() {
  await viewer?.print()
}
</script>

<template>
  <div class="preview-overlay">
    <div class="preview-toolbar">
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
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
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
