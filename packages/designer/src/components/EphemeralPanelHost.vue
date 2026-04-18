<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const panel = computed(() => store.ephemeralPanel)

const node = computed(() => {
  const id = store.editingSession.activeNodeId
  if (!id)
    return null
  return store.getElementById(id) ?? null
})

const unit = computed(() => store.schema.unit)

const panelStyle = computed(() => {
  if (!panel.value || !node.value)
    return undefined

  const pos = panel.value.position
  const offset = pos.offset ?? { x: 0, y: 0 }

  // Default: position below the node
  if (pos.anchor === 'selection-bottom') {
    return {
      left: `${node.value.x + offset.x}${unit.value}`,
      top: `${node.value.y + store.getVisualHeight(node.value) + offset.y}${unit.value}`,
    }
  }

  if (pos.anchor === 'selection-top') {
    return {
      left: `${node.value.x + offset.x}${unit.value}`,
      top: `${node.value.y + offset.y}${unit.value}`,
      transform: 'translateY(-100%)',
    }
  }

  // Fallback: at node origin
  return {
    left: `${node.value.x + offset.x}${unit.value}`,
    top: `${node.value.y + offset.y}${unit.value}`,
  }
})

function handleClose() {
  panel.value?.onClose?.()
}
</script>

<template>
  <div
    v-if="panel && node"
    class="ei-ephemeral-panel"
    :style="panelStyle"
  >
    <component
      :is="panel.component"
      v-bind="panel.props"
      @close="handleClose"
    />
  </div>
</template>

<style scoped>
.ei-ephemeral-panel {
  position: absolute;
  z-index: 15;
  pointer-events: auto;
}
</style>
