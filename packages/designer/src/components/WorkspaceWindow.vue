<script setup lang="ts">
import type { WorkspaceWindowState } from '../types'
import { IconClose, IconMaximize, IconMinimize } from '@easyink/icons'
import { inject } from 'vue'
import { useWindowDrag } from '../composables/use-window-drag'
import { useDesignerStore } from '../composables/use-designer-store'
import { CANVAS_CONTAINER_KEY } from './canvas-container'

const props = defineProps<{
  windowState: WorkspaceWindowState
  title: string
  resizable?: boolean
}>()

const store = useDesignerStore()
const getContainer = inject(CANVAS_CONTAINER_KEY, () => null)

const drag = useWindowDrag(
  () => props.windowState,
  () => store.workbench.windows,
  getContainer,
)

const TITLEBAR_HEIGHT = 32

function onResizeStart(e: PointerEvent) {
  const win = props.windowState
  const startX = e.clientX
  const startY = e.clientY
  const startW = win.width
  const startH = win.height

  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)

  function onMove(ev: PointerEvent) {
    win.width = Math.max(160, startW + (ev.clientX - startX))
    win.height = Math.max(100, startH + (ev.clientY - startY))
  }

  function onUp() {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
}
</script>

<template>
  <div
    class="ei-workspace-window"
    :style="{
      left: `${windowState.x}px`,
      top: `${windowState.y}px`,
      width: `${windowState.width}px`,
      zIndex: windowState.zIndex,
    }"
  >
    <div
      class="ei-workspace-window__titlebar"
      @pointerdown.prevent="drag.onPointerDown"
    >
      <span class="ei-workspace-window__title">{{ title }}</span>
      <div class="ei-workspace-window__actions">
        <button
          class="ei-workspace-window__action"
          @pointerdown.stop
          @click="windowState.collapsed = !windowState.collapsed"
        >
          <IconMaximize v-if="windowState.collapsed" :size="12" />
          <IconMinimize v-else :size="12" />
        </button>
        <button
          class="ei-workspace-window__action"
          @pointerdown.stop
          @click="windowState.visible = false"
        >
          <IconClose :size="12" />
        </button>
      </div>
    </div>
    <div
      v-show="!windowState.collapsed"
      class="ei-workspace-window__body"
      :style="{ height: `${windowState.height - TITLEBAR_HEIGHT}px` }"
    >
      <slot />
    </div>
    <div
      v-if="resizable && !windowState.collapsed"
      class="ei-workspace-window__resize-handle"
      @pointerdown.prevent="onResizeStart"
    />
  </div>
</template>

<style scoped>
.ei-workspace-window {
  position: absolute;
  background: var(--ei-panel-bg, #fff);
  border: 1px solid var(--ei-border-color, #e0e0e0);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ei-workspace-window__titlebar {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  background: var(--ei-panel-header-bg, #fafafa);
  border-bottom: 1px solid var(--ei-border-color, #e0e0e0);
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}

.ei-workspace-window__titlebar:active {
  cursor: grabbing;
}

.ei-workspace-window__title {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ei-workspace-window__actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.ei-workspace-window__action {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--ei-text-secondary, #999);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.ei-workspace-window__action:hover {
  background: var(--ei-hover-bg, #e8e8e8);
  color: var(--ei-text, #333);
}

.ei-workspace-window__body {
  overflow: auto;
  padding: 8px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.2s;
}

.ei-workspace-window__body:hover {
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.ei-workspace-window__body::-webkit-scrollbar {
  width: 2px;
  height: 2px;
}

.ei-workspace-window__body::-webkit-scrollbar-track {
  background: transparent;
}

.ei-workspace-window__body::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
  transition: background 0.2s;
}

.ei-workspace-window__body:hover::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
}

.ei-workspace-window__body:hover::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.35);
}

.ei-workspace-window__resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}

.ei-workspace-window__resize-handle::before {
  content: '';
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 6px;
  height: 6px;
  border-right: 2px solid var(--ei-border-color, #ccc);
  border-bottom: 2px solid var(--ei-border-color, #ccc);
}
</style>
