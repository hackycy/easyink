<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDesignerStore } from '../composables'
import { UpdateGuidesCommand, UnitManager } from '@easyink/core'

const props = defineProps<{
  previewGuide?: { axis: 'x' | 'y', position: number } | null
}>()

const store = useDesignerStore()

const overlayRef = ref<HTMLElement | null>(null)

const guidesX = computed(() => store.schema.guides.x)
const guidesY = computed(() => store.schema.guides.y)
const unit = computed(() => store.schema.unit)
const zoom = computed(() => store.workbench.viewport.zoom)

const draggingGuide = ref<{
  axis: 'x' | 'y'
  index: number
  isNew: boolean
} | null>(null)

function onGuideDragStart(direction: 'x' | 'y', e: PointerEvent) {
  e.preventDefault()

  // Create a new guide by dragging from ruler
  const guides = direction === 'x' ? [...guidesX.value] : [...guidesY.value]
  const newIndex = guides.length
  guides.push(0)

  // Temporarily add the guide
  if (direction === 'x') {
    store.schema.guides.x = guides
  }
  else {
    store.schema.guides.y = guides
  }

  draggingGuide.value = { axis: direction, index: newIndex, isNew: true }
  startDrag(direction, newIndex, e, true)
}

function onGuidePointerDown(axis: 'x' | 'y', index: number, e: PointerEvent) {
  e.stopPropagation()
  e.preventDefault()
  draggingGuide.value = { axis, index, isNew: false }
  startDrag(axis, index, e, false)
}

/**
 * Create a guide at a specific position (used for click-on-ruler).
 */
function createGuideAt(axis: 'x' | 'y', position: number) {
  const newGuides = { x: [...store.schema.guides.x], y: [...store.schema.guides.y] }
  if (axis === 'x') {
    newGuides.x.push(position)
  }
  else {
    newGuides.y.push(position)
  }
  const cmd = new UpdateGuidesCommand(store.schema, newGuides)
  store.commands.execute(cmd)
}

function startDrag(axis: 'x' | 'y', index: number, e: PointerEvent, isNew: boolean) {
  const unitManager = new UnitManager(unit.value)
  const z = zoom.value

  const el = (e.currentTarget || e.target) as HTMLElement
  el.setPointerCapture(e.pointerId)

  const origGuides = { x: [...store.schema.guides.x], y: [...store.schema.guides.y] }
  if (isNew) {
    if (axis === 'x') {
      origGuides.x = origGuides.x.slice(0, -1)
    }
    else {
      origGuides.y = origGuides.y.slice(0, -1)
    }
  }

  // Use overlay's own DOM to find the page element reliably.
  // The event target may come from the ruler (outside .ei-canvas-page).
  const pageEl = overlayRef.value?.closest('.ei-canvas-page') as HTMLElement | null
  if (!pageEl)
    return
  const pageRect = pageEl.getBoundingClientRect()

  function onMove(ev: PointerEvent) {
    const pos = axis === 'x'
      ? unitManager.screenToDocument(ev.clientX, pageRect.left, 0, z)
      : unitManager.screenToDocument(ev.clientY, pageRect.top, 0, z)

    const guides = axis === 'x' ? store.schema.guides.x : store.schema.guides.y
    guides[index] = Math.round(pos * 100) / 100
  }

  function onUp() {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)

    const guides = axis === 'x' ? store.schema.guides.x : store.schema.guides.y
    const finalPos = guides[index]!

    // If dragged back to ruler area (negative), remove the guide
    if (finalPos < 0) {
      guides.splice(index, 1)
      draggingGuide.value = null
      const cmd = new UpdateGuidesCommand(
        store.schema,
        { x: [...store.schema.guides.x], y: [...store.schema.guides.y] },
      )
      store.schema.guides.x = [...origGuides.x]
      store.schema.guides.y = [...origGuides.y]
      store.commands.execute(cmd)
      return
    }

    draggingGuide.value = null

    const newGuides = { x: [...store.schema.guides.x], y: [...store.schema.guides.y] }
    store.schema.guides.x = [...origGuides.x]
    store.schema.guides.y = [...origGuides.y]

    const cmd = new UpdateGuidesCommand(store.schema, newGuides)
    store.commands.execute(cmd)
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
}

defineExpose({ onGuideDragStart, createGuideAt })
</script>

<template>
  <div ref="overlayRef" class="ei-guide-overlay">
    <!-- Vertical guide lines (x-axis positions) -->
    <div
      v-for="(pos, i) in guidesX"
      :key="`x-${i}`"
      class="ei-guide ei-guide--vertical"
      :style="{ left: `${pos}${unit}` }"
      @pointerdown="onGuidePointerDown('x', i, $event)"
    />
    <!-- Horizontal guide lines (y-axis positions) -->
    <div
      v-for="(pos, i) in guidesY"
      :key="`y-${i}`"
      class="ei-guide ei-guide--horizontal"
      :style="{ top: `${pos}${unit}` }"
      @pointerdown="onGuidePointerDown('y', i, $event)"
    />
    <!-- Preview guide line (hover on ruler) -->
    <div
      v-if="previewGuide"
      class="ei-guide ei-guide--preview"
      :class="previewGuide.axis === 'x' ? 'ei-guide--vertical' : 'ei-guide--horizontal'"
      :style="previewGuide.axis === 'x' ? { left: `${previewGuide.position}${unit}` } : { top: `${previewGuide.position}${unit}` }"
    />
  </div>
</template>

<style scoped>
.ei-guide-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 50;
}

.ei-guide {
  position: absolute;
  pointer-events: auto;
}

.ei-guide--vertical {
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px dashed var(--ei-guide-color, #f50);
  cursor: ew-resize;
}

.ei-guide--vertical::before {
  content: '';
  position: absolute;
  inset: 0 -3px;
}

.ei-guide--horizontal {
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed var(--ei-guide-color, #f50);
  cursor: ns-resize;
}

.ei-guide--horizontal::before {
  content: '';
  position: absolute;
  inset: -3px 0;
}

.ei-guide--preview {
  pointer-events: none;
  opacity: 0.5;
  cursor: default;
  border-color: var(--ei-primary, #1890ff);
}
</style>
