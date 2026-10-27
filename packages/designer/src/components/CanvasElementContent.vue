<script setup lang="ts">
import type { MaterialDesignerRenderContext, MaterialDesignerRenderContextSignal } from '@easyink/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDesignerStore } from '../composables'
import { createNodeSignal } from '../materials/create-node-signal'

const props = defineProps<{
  nodeId: string
  renderContext?: MaterialDesignerRenderContext
}>()

const store = useDesignerStore()
const containerRef = ref<HTMLElement | null>(null)

let cleanup: (() => void) | null = null
const reportedUnknownTypes = new Set<string>()
const renderContextSubscribers = new Set<(context: MaterialDesignerRenderContext) => void>()

const renderContextSignal: MaterialDesignerRenderContextSignal = {
  get() {
    return props.renderContext ?? {}
  },
  subscribe(callback) {
    renderContextSubscribers.add(callback)
    return () => {
      renderContextSubscribers.delete(callback)
    }
  },
}

function mount() {
  unmount()
  const container = containerRef.value
  if (!container)
    return

  const node = store.getElementById(props.nodeId)
  if (!node)
    return

  const ext = store.getDesignerExtension(node.type)
  if (!ext) {
    container.textContent = `[Unknown: ${node.type}]`
    container.dataset.materialDiagnostic = 'UNKNOWN_MATERIAL'
    if (!reportedUnknownTypes.has(node.type)) {
      reportedUnknownTypes.add(node.type)
      store.diagnostics.push({ source: 'material-extension', severity: 'warn', message: `Material is not installed: ${node.type}`, detail: { code: 'UNKNOWN_MATERIAL', nodeId: node.id, type: node.type } })
    }
    cleanup = () => {
      container.replaceChildren()
      delete container.dataset.materialDiagnostic
    }
    return
  }

  const nodeSignal = createNodeSignal(store, props.nodeId)
  cleanup = ext.renderContent(nodeSignal, container, renderContextSignal)
}

function unmount() {
  if (cleanup) {
    cleanup()
    cleanup = null
  }
  renderContextSubscribers.clear()
}

onMounted(() => {
  mount()
})

watch(
  () => props.renderContext,
  () => {
    const context = renderContextSignal.get()
    for (const subscriber of renderContextSubscribers)
      subscriber(context)
  },
  { deep: true },
)

watch(
  () => [props.nodeId, store.materialExtensionRevision],
  () => mount(),
)

onBeforeUnmount(() => {
  unmount()
})
</script>

<template>
  <div ref="containerRef" class="ei-canvas-element__render" />
</template>
