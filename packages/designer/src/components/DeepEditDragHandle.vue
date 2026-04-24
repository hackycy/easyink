<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../composables'
import { useElementDrag } from '../composables/use-element-drag'

const props = defineProps<{
  getPageEl: () => HTMLElement | null
  getScrollEl: () => HTMLElement | null
}>()

const store = useDesignerStore()

const { onPointerDown } = useElementDrag({
  store,
  getPageEl: props.getPageEl,
  getScrollEl: props.getScrollEl,
})

const node = computed(() => {
  const id = store.deepEditingNodeId
  if (!id)
    return null
  return store.getElementById(id) ?? null
})

const unit = computed(() => store.schema.unit)

function handlePointerDown(e: PointerEvent) {
  if (!node.value)
    return
  e.stopPropagation()
  onPointerDown(e, node.value.id)
}
</script>

<template>
  <div
    v-if="node"
    class="ei-deep-edit-drag-handle"
    :style="{
      left: `${node.x}${unit}`,
      top: `${node.y}${unit}`,
    }"
    @pointerdown="handlePointerDown"
  >
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="12" rx="2" fill="white" stroke="#1890ff" stroke-width="1.5" />
      <line x1="4" y1="5" x2="10" y2="5" stroke="#1890ff" stroke-width="1" />
      <line x1="4" y1="7" x2="10" y2="7" stroke="#1890ff" stroke-width="1" />
      <line x1="4" y1="9" x2="10" y2="9" stroke="#1890ff" stroke-width="1" />
    </svg>
  </div>
</template>

<style scoped>
.ei-deep-edit-drag-handle {
  position: absolute;
  transform: translate(-16px, -16px);
  width: 14px;
  height: 14px;
  cursor: move;
  z-index: 11;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ei-deep-edit-drag-handle:hover {
  filter: brightness(0.9);
}
</style>
