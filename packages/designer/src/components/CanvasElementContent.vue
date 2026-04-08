<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDesignerStore } from '../composables'
import { createNodeSignal } from '../materials/create-node-signal'

const props = defineProps<{
  nodeId: string
}>()

const store = useDesignerStore()
const containerRef = ref<HTMLElement | null>(null)

let cleanup: (() => void) | null = null

function mount() {
  unmount()
  const container = containerRef.value
  if (!container) return

  const node = store.getElementById(props.nodeId)
  if (!node) return

  const ext = store.getDesignerExtension(node.type)
  if (!ext) return

  const nodeSignal = createNodeSignal(store, props.nodeId)
  cleanup = ext.renderContent(nodeSignal, container)
}

function unmount() {
  if (cleanup) {
    cleanup()
    cleanup = null
  }
}

onMounted(() => {
  mount()
})

onBeforeUnmount(() => {
  unmount()
})
</script>

<template>
  <div ref="containerRef" class="ei-canvas-element__render" />
</template>
