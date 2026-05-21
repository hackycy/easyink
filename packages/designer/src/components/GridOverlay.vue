<script setup lang="ts">
import type { EditorSurfacePlan } from '@easyink/core'
import { getEditorSurfacePageLeft } from '@easyink/core'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const props = defineProps<{
  surfacePlan: EditorSurfacePlan
}>()

const store = useDesignerStore()

const gridPages = computed(() => {
  const grid = store.schema.page.grid
  if (!grid || !grid.enabled)
    return []

  const unit = store.schema.unit
  const w = grid.width
  const h = grid.height

  return props.surfacePlan.pages.map(page => ({
    key: page.index,
    style: {
      left: `${getEditorSurfacePageLeft(props.surfacePlan, page)}${unit}`,
      top: `${page.visualTop}${unit}`,
      width: `${page.width}${unit}`,
      height: `${page.height}${unit}`,
      backgroundSize: `${w}${unit} ${h}${unit}`,
      backgroundImage:
        `linear-gradient(to right, var(--ei-grid-color, rgba(0,0,0,0.08)) 1px, transparent 1px),`
        + `linear-gradient(to bottom, var(--ei-grid-color, rgba(0,0,0,0.08)) 1px, transparent 1px)`,
    },
  }))
})
</script>

<template>
  <div
    v-for="page in gridPages"
    :key="page.key"
    class="ei-grid-overlay"
    :style="page.style"
  />
</template>

<style scoped lang="scss">
.ei-grid-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
