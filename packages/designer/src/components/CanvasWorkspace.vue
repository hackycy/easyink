<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue'
import { useDesignerStore } from '../composables'
import { CANVAS_CONTAINER_KEY } from './canvas-container'
import WorkspaceWindow from './WorkspaceWindow.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import StructureTree from './StructureTree.vue'
import DataSourcePanel from './DataSourcePanel.vue'
import HistoryPanel from './HistoryPanel.vue'
import MinimapPanel from './MinimapPanel.vue'
import DebugPanel from './DebugPanel.vue'

const store = useDesignerStore()
const containerRef = ref<HTMLElement | null>(null)

provide(CANVAS_CONTAINER_KEY, () => containerRef.value)

const pageStyle = computed(() => {
  const page = store.schema.page
  const unit = store.schema.unit
  const zoom = store.workbench.viewport.zoom
  return {
    width: `${page.width}${unit}`,
    height: `${page.height}${unit}`,
    transform: `scale(${zoom})`,
    transformOrigin: 'top left',
    background: page.background?.color || '#fff',
  }
})

const elements = computed(() => store.getElements())

function windowTitle(kind: string): string {
  const key = kind === 'structure-tree' ? 'structureTree' : kind
  return store.t(`designer.panel.${key}`)
}

function isResizable(kind: string): boolean {
  return kind !== 'minimap'
}

function handleCanvasClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    store.selection.clear()
  }
}

function handleElementClick(e: MouseEvent, elementId: string) {
  e.stopPropagation()
  if (e.ctrlKey || e.metaKey) {
    store.selection.toggle(elementId)
  }
  else {
    store.selection.select(elementId)
  }
}

onMounted(() => {
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  for (const win of store.workbench.windows) {
    if (win.x < 0) {
      win.x = rect.width - win.width - 12
    }
    if (win.y < 0) {
      win.y = rect.height - win.height - 12
    }
  }
})
</script>

<template>
  <div ref="containerRef" class="ei-canvas-workspace">
    <div class="ei-canvas-scroll" @click="handleCanvasClick">
      <div class="ei-canvas-page" :style="pageStyle">
        <div
          v-for="el in elements"
          :key="el.id"
          class="ei-canvas-element"
          :class="{
            'ei-canvas-element--selected': store.selection.has(el.id),
            'ei-canvas-element--locked': el.locked,
            'ei-canvas-element--hidden': el.hidden,
          }"
          :style="{
            left: `${el.x}${store.schema.unit}`,
            top: `${el.y}${store.schema.unit}`,
            width: `${el.width}${store.schema.unit}`,
            height: `${el.height}${store.schema.unit}`,
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            opacity: el.alpha ?? 1,
            zIndex: el.zIndex ?? 'auto',
          }"
          @click="handleElementClick($event, el.id)"
        >
          <div class="ei-canvas-element__content">
            {{ el.type }}
          </div>
          <div
            v-if="store.selection.has(el.id)"
            class="ei-canvas-element__selection-border"
          />
        </div>
      </div>
    </div>

    <!-- Floating windows layer -->
    <div class="ei-canvas-windows">
      <template v-for="win in store.workbench.windows" :key="win.id">
        <WorkspaceWindow
          v-if="win.visible"
          :window-state="win"
          :title="windowTitle(win.kind)"
          :resizable="isResizable(win.kind)"
        >
          <PropertiesPanel v-if="win.kind === 'properties'" />
          <StructureTree v-else-if="win.kind === 'structure-tree'" />
          <DataSourcePanel v-else-if="win.kind === 'datasource'" />
          <HistoryPanel v-else-if="win.kind === 'history'" />
          <MinimapPanel v-else-if="win.kind === 'minimap'" />
          <DebugPanel v-else-if="win.kind === 'debug'" />
          <div v-else class="ei-canvas-workspace__placeholder">
            {{ windowTitle(win.kind) }}
          </div>
        </WorkspaceWindow>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ei-canvas-workspace {
  flex: 1;
  overflow: hidden;
  background: var(--ei-canvas-bg, #e8e8e8);
  position: relative;
}

.ei-canvas-scroll {
  padding: 40px;
  display: inline-block;
  min-width: 100%;
  min-height: 100%;
  overflow: auto;
  position: absolute;
  inset: 0;
}

.ei-canvas-page {
  position: relative;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.ei-canvas-element {
  position: absolute;
  cursor: move;
  box-sizing: border-box;
}

.ei-canvas-element--hidden {
  opacity: 0.3;
}

.ei-canvas-element__content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--ei-text-secondary, #999);
  border: 1px dashed var(--ei-border-color, #d0d0d0);
  box-sizing: border-box;
  overflow: hidden;
}

.ei-canvas-element--selected .ei-canvas-element__content {
  border-color: var(--ei-primary, #1890ff);
}

.ei-canvas-element__selection-border {
  position: absolute;
  inset: -1px;
  border: 2px solid var(--ei-primary, #1890ff);
  pointer-events: none;
}

.ei-canvas-windows {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.ei-canvas-workspace__placeholder {
  color: var(--ei-text-secondary, #999);
  text-align: center;
  padding: 20px;
  font-size: 12px;
}
</style>
