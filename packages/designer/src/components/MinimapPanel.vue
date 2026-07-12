<script setup lang="ts">
import type { EditorSurfacePlan, Rect } from '@easyink/core'
import type { MinimapElementFrame, MinimapPageFrame } from './minimap-layout'
import { createEditorSurfacePlan } from '@easyink/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useDesignerStore } from '../composables'
import { resolveMinimapLayout } from './minimap-layout'
import {
  projectMinimapClientPointToSurface,
  resolveMinimapRectStyle,
  resolveMinimapViewportRect,
} from './minimap-viewport'

const props = defineProps<{
  surfacePlan?: EditorSurfacePlan
  viewportRect?: Rect | null
}>()

const emit = defineEmits<{
  navigate: [surfacePoint: { x: number, y: number }]
}>()

const store = useDesignerStore()
const rootRef = ref<HTMLElement | null>(null)
const availableWidth = ref(180)

const surfacePlan = computed(() => props.surfacePlan ?? createEditorSurfacePlan(store.schema))
const layout = computed(() => resolveMinimapLayout(store.schema, surfacePlan.value, store.getElements()))

const canvasSize = computed(() => {
  const bounds = layout.value.bounds
  const width = Math.max(Math.min(availableWidth.value, 260), 96)
  return {
    width,
    height: Math.max((width * bounds.height) / bounds.width, 40),
  }
})

const canvasStyle = computed(() => ({
  width: `${canvasSize.value.width}px`,
  height: `${canvasSize.value.height}px`,
}))

const viewportStyle = computed(() => {
  const rect = resolveMinimapViewportRect(props.viewportRect, layout.value.bounds)
  if (!rect)
    return null
  return rectStyle(rect)
})

let resizeObserver: ResizeObserver | null = null
let activePointerId: number | null = null

function measure() {
  const el = rootRef.value
  if (!el)
    return
  availableWidth.value = Math.max(el.clientWidth, 96)
}

function rectStyle(rect: Rect) {
  return resolveMinimapRectStyle(rect, layout.value.bounds)
}

function frameStyle(frame: MinimapPageFrame) {
  return rectStyle(frame)
}

function elementStyle(element: MinimapElementFrame) {
  return rectStyle(element)
}

function isElementHidden(element: MinimapElementFrame): boolean {
  const { hidden } = element
  return hidden === true
}

function isElementLocked(element: MinimapElementFrame): boolean {
  const { locked } = element
  return locked === true
}

function handlePointerDown(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  activePointerId = event.pointerId
  target.setPointerCapture?.(event.pointerId)
  event.preventDefault()
  navigateFromPointer(event)
}

function handlePointerMove(event: PointerEvent) {
  if (activePointerId !== event.pointerId)
    return
  navigateFromPointer(event)
}

function handlePointerUp(event: PointerEvent) {
  if (activePointerId !== event.pointerId)
    return
  activePointerId = null
  const target = event.currentTarget as HTMLElement
  target.releasePointerCapture?.(event.pointerId)
}

function navigateFromPointer(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const point = projectMinimapClientPointToSurface(
    { x: event.clientX, y: event.clientY },
    {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
    layout.value.bounds,
  )
  if (point)
    emit('navigate', point)
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'undefined')
    return
  resizeObserver = new ResizeObserver(measure)
  if (rootRef.value)
    resizeObserver.observe(rootRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div ref="rootRef" class="ei-minimap-panel">
    <div class="ei-minimap-panel__stage">
      <div
        class="ei-minimap-panel__canvas"
        :style="canvasStyle"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
      >
        <div
          v-for="frame in layout.pageFrames"
          :key="frame.key"
          class="ei-minimap-panel__page"
          :class="{
            'ei-minimap-panel__page--continuous': frame.kind === 'continuous',
          }"
          :style="frameStyle(frame)"
        />
        <div
          v-for="el in layout.elements"
          :key="el.id"
          class="ei-minimap-panel__element"
          :class="{
            'ei-minimap-panel__element--selected': store.selection.has(el.id),
            'ei-minimap-panel__element--hidden': isElementHidden(el),
            'ei-minimap-panel__element--locked': isElementLocked(el),
          }"
          :style="elementStyle(el)"
        />
        <div
          v-if="viewportStyle"
          class="ei-minimap-panel__viewport"
          :style="viewportStyle"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-minimap-panel {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;

  &__stage {
    display: flex;
    justify-content: center;
    min-width: 0;
  }

  &__canvas {
    position: relative;
    flex: 0 0 auto;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
    background:
      linear-gradient(rgba(0, 0, 0, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 0, 0, 0.035) 1px, transparent 1px),
      var(--ei-canvas-bg, #f2f3f5);
    background-size: 8px 8px;
    border: 0.5px solid rgba(0, 0, 0, 0.16);
    box-sizing: border-box;
  }

  &__page {
    position: absolute;
    box-sizing: border-box;
    background: var(--ei-panel-bg, #fff);
    border: 0.5px solid rgba(0, 0, 0, 0.14);
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.72);

    &--continuous {
      border-style: solid;
    }
  }

  &__element {
    position: absolute;
    box-sizing: border-box;
    min-width: 2px;
    min-height: 2px;
    background: var(--ei-primary, #1890ff);
    border: 0.5px solid rgba(24, 144, 255, 0.36);
    opacity: 0.32;

    &--selected {
      opacity: 0.78;
      background: var(--ei-primary, #1890ff);
      border-color: rgba(24, 144, 255, 0.72);
    }

    &--hidden {
      background: transparent;
      border-style: dashed;
      opacity: 0.45;
    }

    &--locked {
      border-color: var(--ei-danger, #ff4d4f);
    }
  }

  &__viewport {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid rgba(24, 144, 255, 0.72);
    background: rgba(24, 144, 255, 0.08);
    box-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.78);
    pointer-events: none;
  }
}
</style>
