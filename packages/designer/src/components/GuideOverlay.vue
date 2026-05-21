<script setup lang="ts">
import type { EditorSurfacePlan } from '@easyink/core'
import type { RulerCoordinateContext } from './ruler-coordinate'
import { UpdateGuidesCommand } from '@easyink/core'
import { computed, ref } from 'vue'
import { useDesignerStore } from '../composables'
import {
  getCanvasRulerOrigin,
  rulerClientPointToUnit,
  rulerUnitToSurfaceUnit,
} from './ruler-coordinate'

const props = defineProps<{
  surfacePlan: EditorSurfacePlan
  previewGuide?: { axis: 'x' | 'y', position: number } | null
}>()

const store = useDesignerStore()
const overlayRef = ref<HTMLElement | null>(null)

const guidesX = computed(() => store.schema.guides.x)
const guidesY = computed(() => store.schema.guides.y)
const unit = computed(() => store.schema.unit)
const rulerOrigin = computed(() => getCanvasRulerOrigin(props.surfacePlan))

const verticalGuideViews = computed(() => {
  const views: Array<{ key: string, index: number, style: Record<string, string> }> = []
  for (let index = 0; index < guidesX.value.length; index++) {
    const pos = guidesX.value[index]!
    views.push({
      key: `x-${index}`,
      index,
      style: {
        left: `${rulerUnitToSurfaceUnit(rulerOrigin.value, 'horizontal', pos)}${unit.value}`,
        top: `0${unit.value}`,
        height: `${props.surfacePlan.contentBounds.height}${unit.value}`,
      },
    })
  }
  return views
})

const horizontalGuideViews = computed(() => guidesY.value.map((pos, index) => {
  return {
    key: `y-${index}`,
    index,
    style: {
      left: `0${unit.value}`,
      top: `${rulerUnitToSurfaceUnit(rulerOrigin.value, 'vertical', pos)}${unit.value}`,
      width: `${props.surfacePlan.contentBounds.width}${unit.value}`,
    },
  }
}))

const previewGuideViews = computed(() => {
  const guide = props.previewGuide
  if (!guide)
    return []
  if (guide.axis === 'x') {
    return [{
      key: 'preview-x',
      className: 'ei-guide--vertical',
      style: {
        left: `${rulerUnitToSurfaceUnit(rulerOrigin.value, 'horizontal', guide.position)}${unit.value}`,
        top: `0${unit.value}`,
        height: `${props.surfacePlan.contentBounds.height}${unit.value}`,
      },
    }]
  }
  return [{
    key: 'preview-y',
    className: 'ei-guide--horizontal',
    style: {
      left: `0${unit.value}`,
      top: `${rulerUnitToSurfaceUnit(rulerOrigin.value, 'vertical', guide.position)}${unit.value}`,
      width: `${props.surfacePlan.contentBounds.width}${unit.value}`,
    },
  }]
})

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

  const coordinateContext = getRulerCoordinateContext()
  if (!coordinateContext) {
    store.schema.guides.x = [...origGuides.x]
    store.schema.guides.y = [...origGuides.y]
    draggingGuide.value = null
    return
  }
  const activeCoordinateContext = coordinateContext

  updateGuidePosition(e)

  function onMove(ev: PointerEvent) {
    updateGuidePosition(ev)
  }

  function onUp() {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)

    draggingGuide.value = null

    const newGuides = { x: [...store.schema.guides.x], y: [...store.schema.guides.y] }
    store.schema.guides.x = [...origGuides.x]
    store.schema.guides.y = [...origGuides.y]

    const cmd = new UpdateGuidesCommand(store.schema, newGuides)
    store.commands.execute(cmd)
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)

  function updateGuidePosition(ev: PointerEvent) {
    const position = rulerClientPointToUnit(activeCoordinateContext, axis === 'x' ? 'horizontal' : 'vertical', ev.clientX, ev.clientY)
    const guides = axis === 'x' ? store.schema.guides.x : store.schema.guides.y
    guides[index] = position
  }
}

function getRulerCoordinateContext(): RulerCoordinateContext | null {
  const surfaceRect = (overlayRef.value?.closest('.ei-canvas-page') as HTMLElement | null)?.getBoundingClientRect()
  if (!surfaceRect)
    return null
  return {
    unit: unit.value,
    zoom: store.workbench.viewport.zoom,
    surfaceRect: {
      left: surfaceRect.left,
      top: surfaceRect.top,
    },
    origin: rulerOrigin.value,
  }
}

defineExpose({ onGuideDragStart, createGuideAt })
</script>

<template>
  <div ref="overlayRef" class="ei-guide-overlay">
    <!-- Vertical guide lines (x-axis positions) -->
    <div
      v-for="guide in verticalGuideViews"
      :key="guide.key"
      class="ei-guide ei-guide--vertical"
      :style="guide.style"
      @pointerdown="onGuidePointerDown('x', guide.index, $event)"
    />
    <!-- Horizontal guide lines (y-axis positions) -->
    <div
      v-for="guide in horizontalGuideViews"
      :key="guide.key"
      class="ei-guide ei-guide--horizontal"
      :style="guide.style"
      @pointerdown="onGuidePointerDown('y', guide.index, $event)"
    />
    <!-- Preview guide line (hover on ruler) -->
    <div
      v-for="guide in previewGuideViews"
      :key="guide.key"
      class="ei-guide ei-guide--preview"
      :class="guide.className"
      :style="guide.style"
    />
  </div>
</template>

<style scoped lang="scss">
.ei-guide-overlay {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 50;
}

.ei-guide {
  position: absolute;
  pointer-events: auto;

  &--vertical {
    top: 0;
    bottom: auto;
    width: 0;
    border-left: 1px dashed var(--ei-guide-color, #f50);
    cursor: ew-resize;

    &::before {
      content: '';
      position: absolute;
      inset: 0 -3px;
    }
  }

  &--horizontal {
    left: 0;
    right: 0;
    height: 0;
    right: auto;
    border-top: 1px dashed var(--ei-guide-color, #f50);
    cursor: ns-resize;

    &::before {
      content: '';
      position: absolute;
      inset: -3px 0;
    }
  }

  &--preview {
    pointer-events: none;
    opacity: 0.5;
    cursor: default;
    border-color: var(--ei-primary, #1890ff);
  }
}
</style>
