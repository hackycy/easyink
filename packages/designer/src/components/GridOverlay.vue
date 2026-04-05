<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const gridStyle = computed(() => {
  const grid = store.schema.page.grid
  if (!grid || !grid.enabled)
    return null

  const unit = store.schema.unit
  const w = grid.width
  const h = grid.height

  return {
    backgroundSize: `${w}${unit} ${h}${unit}`,
    backgroundImage:
      `linear-gradient(to right, var(--ei-grid-color, rgba(0,0,0,0.08)) 1px, transparent 1px),`
      + `linear-gradient(to bottom, var(--ei-grid-color, rgba(0,0,0,0.08)) 1px, transparent 1px)`,
  }
})
</script>

<template>
  <div
    v-if="gridStyle"
    class="ei-grid-overlay"
    :style="gridStyle"
  />
</template>

<style scoped>
.ei-grid-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
