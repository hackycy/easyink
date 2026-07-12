<script setup lang="ts">
import type { FacetInstance, MaterialDesignerFacet, MaterialDesignerRenderContext, MaterialDesignerRenderContextSignal } from '@easyink/core'
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
let activation = 0
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

async function mount() {
  const current = ++activation
  unmount()
  const container = containerRef.value
  if (!container)
    return

  const node = store.getElementById(props.nodeId)
  if (!node)
    return
  container.textContent = 'Loading'
  const instance = await store.activateDesignerFacet(node.type) as FacetInstance<MaterialDesignerFacet>
  if (current !== activation)
    return
  if (instance.state !== 'active' || !instance.value) {
    container.textContent = instance.diagnostic?.code ?? 'MATERIAL_FACET_NOT_DECLARED'
    return
  }

  const nodeSignal = createNodeSignal(store, props.nodeId)
  container.replaceChildren()
  cleanup = instance.value.extension.renderContent(nodeSignal, container, renderContextSignal)
}

function unmount() {
  if (cleanup) {
    cleanup()
    cleanup = null
  }
  renderContextSubscribers.clear()
}

onMounted(() => {
  void mount()
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
  () => void mount(),
)

onBeforeUnmount(() => {
  activation += 1
  unmount()
})
</script>

<template>
  <div ref="containerRef" class="ei-canvas-element__render" />
</template>
