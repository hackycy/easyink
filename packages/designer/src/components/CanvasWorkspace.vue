<script setup lang="ts">
import type { MarqueeRect } from '../composables/use-marquee-select'
import type { ResizeHandle } from '../composables/use-element-resize'
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { UnitManager } from '@easyink/core'
import { useDesignerStore } from '../composables'
import { useElementDrag } from '../composables/use-element-drag'
import { useElementResize } from '../composables/use-element-resize'
import { useElementRotate } from '../composables/use-element-rotate'
import { useMarqueeSelect } from '../composables/use-marquee-select'
import { useDatasourceDrop } from '../composables/use-datasource-drop'
import { useMaterialDrop } from '../composables/use-material-drop'
import { CANVAS_CONTAINER_KEY } from './canvas-container'
import GridOverlay from './GridOverlay.vue'
import SnapLineOverlay from './SnapLineOverlay.vue'
import GuideOverlay from './GuideOverlay.vue'
import CanvasRuler from './CanvasRuler.vue'
import CanvasContextMenu from './CanvasContextMenu.vue'
import WorkspaceWindow from './WorkspaceWindow.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import StructureTree from './StructureTree.vue'
import DataSourcePanel from './DataSourcePanel.vue'
import HistoryPanel from './HistoryPanel.vue'
import MinimapPanel from './MinimapPanel.vue'
import DebugPanel from './DebugPanel.vue'
import ToolbarManager from './ToolbarManager.vue'
import MaterialPanel from './MaterialPanel.vue'
import DeepEditDragHandle from './DeepEditDragHandle.vue'
import CanvasElementContent from './CanvasElementContent.vue'
import SelectionOverlay from './SelectionOverlay.vue'
import EphemeralPanelHost from './EphemeralPanelHost.vue'

const store = useDesignerStore()
const containerRef = ref<HTMLElement | null>(null)
const pageRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const marqueeRect = ref<MarqueeRect | null>(null)
const guideOverlayRef = ref<InstanceType<typeof GuideOverlay> | null>(null)
const contextMenuRef = ref<InstanceType<typeof CanvasContextMenu> | null>(null)
const rulerRef = ref<InstanceType<typeof CanvasRuler> | null>(null)
const cursorPos = ref<{ x: number, y: number } | null>(null)
const rulerHover = ref<{ axis: 'x' | 'y', position: number } | null>(null)

provide(CANVAS_CONTAINER_KEY, () => containerRef.value)

const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']

// ─── Composables ─────────────────────────────────────────────────

const { onPointerDown: onElementPointerDown } = useElementDrag({
  store,
  getPageEl: () => pageRef.value,
  getScrollEl: () => scrollRef.value,
})

const { onHandlePointerDown } = useElementResize({
  store,
  getPageEl: () => pageRef.value,
})

const { onRotatePointerDown } = useElementRotate({
  store,
  getPageEl: () => pageRef.value,
})

const { onCanvasPointerDown } = useMarqueeSelect({
  store,
  getPageEl: () => pageRef.value,
  marqueeRef: marqueeRect,
})

const { onDragOver: onPageDragOver, onDrop: onPageDrop, onDragLeave: onPageDragLeave, cleanupOverlay } = useDatasourceDrop({
  store,
  getPageEl: () => pageRef.value,
})

const { onDragOver: onMaterialDragOver, onDrop: onMaterialDrop } = useMaterialDrop({
  store,
  getPageEl: () => pageRef.value,
})

function handlePageDragOver(e: DragEvent) {
  onPageDragOver(e)
  onMaterialDragOver(e)
}

function handlePageDragLeave(e: DragEvent) {
  onPageDragLeave(e)
}

function handlePageDrop(e: DragEvent) {
  onPageDrop(e)
  onMaterialDrop(e)
}

// ─── Computed ────────────────────────────────────────────────────

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

const editingNodeId = computed(() => store.editingSession.activeNodeId)

const editingNode = computed(() => {
  const id = editingNodeId.value
  if (!id)
    return null
  return store.getElementById(id) ?? null
})

const marqueeStyle = computed(() => {
  if (!marqueeRect.value)
    return null
  const r = marqueeRect.value
  const unit = store.schema.unit
  return {
    left: `${r.x}${unit}`,
    top: `${r.y}${unit}`,
    width: `${r.width}${unit}`,
    height: `${r.height}${unit}`,
  }
})

// ─── Helpers ─────────────────────────────────────────────────────

function windowTitle(kind: string): string {
  if (kind === 'toolbar-manager') return store.t('designer.toolbar.manager')
  const key = kind === 'structure-tree' ? 'structureTree' : kind
  return store.t(`designer.panel.${key}`)
}

function isResizable(kind: string): boolean {
  return kind !== 'minimap'
}

function handleScrollPointerDown(e: PointerEvent) {
  // Only trigger marquee on empty space (the scroll area or page background)
  if (e.target === scrollRef.value || e.target === pageRef.value) {
    if (store.editingSession.isActive) {
      store.editingSession.exit()
    }
    onCanvasPointerDown(e)
  }
}

/** Guards against the click event routing to cell selection when editing was just entered on pointerdown. */
let editEnteredOnPointerDown = false

function handleElementPointerDown(e: PointerEvent, elementId: string) {
  e.stopPropagation()
  editEnteredOnPointerDown = false

  // Right-click: preserve current selection for context menu, skip editing and drag
  if (e.button === 2) {
    if (!store.selection.has(elementId)) {
      store.selection.select(elementId)
    }
    return
  }

  const activeNodeId = store.editingSession.activeNodeId

  // During editing for this element, dispatch pointer event to session
  if (store.editingSession.isActive && activeNodeId === elementId) {
    const pageEl = pageRef.value
    if (pageEl) {
      const rect = pageEl.getBoundingClientRect()
      const zoom = store.workbench.viewport.zoom
      const um = new UnitManager(store.schema.unit)
      const x = um.screenToDocument(e.clientX, rect.left, 0, zoom)
      const y = um.screenToDocument(e.clientY, rect.top, 0, zoom)
      store.editingSession.dispatch({ kind: 'pointer-down', point: { x, y }, originalEvent: e })
    }
    return
  }
  // If editing another element, exit first
  if (store.editingSession.isActive && activeNodeId !== elementId) {
    store.editingSession.exit()
  }

  // For edit-capable elements, enter editing session based on enterTrigger
  if (!(e.ctrlKey || e.metaKey)) {
    const node = store.getElementById(elementId)
    const ext = node ? store.getDesignerExtension(node.type) : undefined
    if (ext?.geometry && ext.enterTrigger === 'click') {
      const pageEl = pageRef.value
      if (pageEl) {
        const rect = pageEl.getBoundingClientRect()
        const zoom = store.workbench.viewport.zoom
        const um = new UnitManager(store.schema.unit)
        const initialPoint = {
          x: um.screenToDocument(e.clientX, rect.left, 0, zoom),
          y: um.screenToDocument(e.clientY, rect.top, 0, zoom),
        }
        if (store.editingSession.enter(elementId, ext, initialPoint)) {
          editEnteredOnPointerDown = true
          return
        }
      }
    }
  }
  onElementPointerDown(e, elementId)
}

function handleElementClick(e: MouseEvent, elementId: string) {
  e.stopPropagation()

  // Skip cell routing if editing was just entered on this same pointerdown->click cycle
  if (editEnteredOnPointerDown) {
    editEnteredOnPointerDown = false
    return
  }

  // Normal selection / narrow-down logic
  if (e.ctrlKey || e.metaKey) {
    store.selection.toggle(elementId)
    return
  }

  if (!store.selection.has(elementId) || store.selection.count > 1) {
    store.selection.select(elementId)
  }
}

function handleElementDblClick(e: MouseEvent, elementId: string) {
  e.stopPropagation()

  // If this element is already being edited, treat dblclick as a request to
  // enter the material's "content edit" mode for the currently-selected sub-target
  // (e.g. text editing a table cell). The preceding pointerdown/click cycle has
  // already updated selection via the framework's selectionMiddleware.
  if (store.editingSession.isActive && store.editingSession.activeNodeId === elementId) {
    store.editingSession.dispatch({ kind: 'command', command: 'enter-edit' })
    return
  }

  const node = store.getElementById(elementId)
  const ext = node ? store.getDesignerExtension(node.type) : undefined
  // Default enterTrigger is 'dblclick'
  if (ext?.geometry && (ext.enterTrigger ?? 'dblclick') === 'dblclick') {
    const pageEl = pageRef.value
    if (pageEl) {
      const rect = pageEl.getBoundingClientRect()
      const zoom = store.workbench.viewport.zoom
      const um = new UnitManager(store.schema.unit)
      const initialPoint = {
        x: um.screenToDocument(e.clientX, rect.left, 0, zoom),
        y: um.screenToDocument(e.clientY, rect.top, 0, zoom),
      }
      const session = store.editingSession.enter(elementId, ext, initialPoint)
      // If a cell selection was hit, also enter content edit mode immediately
      if (session && session.selectionStore.selection) {
        store.editingSession.dispatch({ kind: 'command', command: 'enter-edit' })
      }
    }
  }
}

function handleResizePointerDown(e: PointerEvent, elementId: string, handle: ResizeHandle) {
  onHandlePointerDown(e, elementId, handle)
}

function handleRotatePointerDown(e: PointerEvent, elementId: string) {
  onRotatePointerDown(e, elementId)
}

function handleCursorForHandle(handle: ResizeHandle): string {
  const map: Record<ResizeHandle, string> = {
    nw: 'nwse-resize',
    n: 'ns-resize',
    ne: 'nesw-resize',
    w: 'ew-resize',
    e: 'ew-resize',
    sw: 'nesw-resize',
    s: 'ns-resize',
    se: 'nwse-resize',
  }
  return map[handle]
}

function handleContextMenu(e: MouseEvent) {
  contextMenuRef.value?.onContextMenu(e)
}

function handleGuideDragStart(direction: 'x' | 'y', e: PointerEvent) {
  guideOverlayRef.value?.onGuideDragStart(direction, e)
}

function handleGuideCreate(axis: 'x' | 'y', position: number) {
  guideOverlayRef.value?.createGuideAt(axis, position)
}

function handleScroll() {
  const el = scrollRef.value
  if (!el)
    return
  store.workbench.viewport.scrollLeft = el.scrollLeft
  store.workbench.viewport.scrollTop = el.scrollTop
}

function handleMouseMove(e: MouseEvent) {
  const el = containerRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  cursorPos.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  }
}

function handleMouseLeave() {
  cursorPos.value = null
}

function handleKeyDown(e: KeyboardEvent) {
  if (store.editingSession.isActive) {
    store.editingSession.dispatch({
      kind: 'key-down',
      key: e.key,
      originalEvent: e,
    })
    // Workbench fallback: Escape exits editing session only if not consumed by behaviors
    if (e.key === 'Escape' && !e.defaultPrevented && store.editingSession.isActive) {
      store.editingSession.exit()
      e.preventDefault()
    }
  }
}

function handleRulerHover(hover: { axis: 'x' | 'y', position: number } | null) {
  rulerHover.value = hover
}

// ─── Window position clamping ────────────────────────────────────

function clampWindowPositions() {
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const rulerSize = 20
  for (const win of store.workbench.windows) {
    const maxX = rect.width - win.width
    const maxY = rect.height - 32
    win.x = maxX <= rulerSize ? rulerSize : Math.max(rulerSize, Math.min(win.x, maxX))
    win.y = maxY <= rulerSize ? rulerSize : Math.max(rulerSize, Math.min(win.y, maxY))
  }
}

const containerObserver = new ResizeObserver(clampWindowPositions)

// ─── Lifecycle ───────────────────────────────────────────────────

onMounted(() => {
  const el = containerRef.value
  if (!el) return

  // Register page element provider so material extensions can do coordinate conversion
  store.setPageElProvider(() => pageRef.value)

  const rect = el.getBoundingClientRect()
  for (const win of store.workbench.windows) {
    if (win.x < 0) {
      win.x = rect.width - win.width - 12
    }
    if (win.y < 0) {
      win.y = rect.height - win.height - 12
    }
  }
  clampWindowPositions()
  containerObserver.observe(el)
  // Sync initial scroll position
  if (scrollRef.value) {
    handleScroll()
  }
})

onUnmounted(() => {
  containerObserver.disconnect()
  cursorPos.value = null
  cleanupOverlay()
})
</script>

<template>
  <div ref="containerRef" class="ei-canvas-workspace" tabindex="-1" @contextmenu="handleContextMenu" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave" @keydown="handleKeyDown">
    <!-- Rulers -->
    <CanvasRuler ref="rulerRef" :cursor-pos="cursorPos" @guide-drag-start="handleGuideDragStart" @guide-create="handleGuideCreate" @ruler-hover="handleRulerHover" />

    <div
      ref="scrollRef"
      class="ei-canvas-scroll"
      @pointerdown="handleScrollPointerDown"
      @scroll="handleScroll"
    >
      <div
        ref="pageRef"
        class="ei-canvas-page"
        :style="pageStyle"
        @dragover="handlePageDragOver"
        @dragleave="handlePageDragLeave"
        @drop="handlePageDrop"
      >
        <!-- Grid overlay -->
        <GridOverlay />

        <!-- Guide overlay -->
        <GuideOverlay ref="guideOverlayRef" :preview-guide="rulerHover" />

        <!-- Elements -->
        <div
          v-for="el in elements"
          :key="el.id"
          class="ei-canvas-element"
          :class="{
            'ei-canvas-element--selected': store.selection.has(el.id),
            'ei-canvas-element--locked': el.locked,
            'ei-canvas-element--hidden': el.hidden,
            'ei-canvas-element--deep-editing': editingNodeId === el.id,
          }"
          :style="{
            left: `${el.x}${store.schema.unit}`,
            top: `${el.y}${store.schema.unit}`,
            width: `${el.width}${store.schema.unit}`,
            height: `${store.getVisualHeight(el)}${store.schema.unit}`,
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            opacity: el.alpha ?? 1,
            zIndex: el.zIndex ?? 'auto',
          }"
          @pointerdown="handleElementPointerDown($event, el.id)"
          @click="handleElementClick($event, el.id)"
          @dblclick="handleElementDblClick($event, el.id)"
        >
          <div class="ei-canvas-element__content">
            <CanvasElementContent :node-id="el.id" />
          </div>

          <!-- Selection border, resize handles & rotation handle -->
          <template v-if="store.selection.has(el.id) && editingNodeId !== el.id">
            <div class="ei-canvas-element__selection-border" />

            <!-- 8 resize handles -->
            <div
              v-for="handle in resizeHandles"
              :key="handle"
              class="ei-canvas-element__handle"
              :class="`ei-canvas-element__handle--${handle}`"
              :style="{ cursor: handleCursorForHandle(handle) }"
              @pointerdown="handleResizePointerDown($event, el.id, handle)"
            />

            <!-- Rotation handle (hidden for non-rotatable materials like tables) -->
            <div
              v-if="store.getMaterial(el.type)?.capabilities.rotatable !== false"
              class="ei-canvas-element__rotate-handle"
              @pointerdown="handleRotatePointerDown($event, el.id)"
            >
              <div class="ei-canvas-element__rotate-dot" />
              <div class="ei-canvas-element__rotate-line" />
            </div>
          </template>
        </div>

        <!-- Snap line overlay -->
        <SnapLineOverlay />

        <!-- Selection overlay (decorations from editing session) -->
        <SelectionOverlay />

        <!-- Ephemeral panel host -->
        <EphemeralPanelHost />

        <DeepEditDragHandle v-if="store.isInDeepEditing && editingNode" :get-page-el="() => pageRef" :get-scroll-el="() => scrollRef" />

        <!-- Marquee selection rectangle -->
        <div
          v-if="marqueeStyle"
          class="ei-canvas-marquee"
          :style="marqueeStyle"
        />
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
          <ToolbarManager v-else-if="win.kind === 'toolbar-manager'" />
          <MaterialPanel v-else-if="win.kind === 'materials'" />
          <div v-else class="ei-canvas-workspace__placeholder">
            {{ windowTitle(win.kind) }}
          </div>
        </WorkspaceWindow>
      </template>
    </div>

    <!-- Context menu -->
    <CanvasContextMenu ref="contextMenuRef" />
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
  padding: 40px 40px 40px 60px;
  display: inline-block;
  min-width: 100%;
  min-height: 100%;
  overflow: auto;
  position: absolute;
  inset: 0;
  top: 20px;
  left: 20px;
}

.ei-canvas-page {
  position: relative;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  overflow: visible;
}

.ei-canvas-element {
  position: absolute;
  cursor: move;
  box-sizing: border-box;
}

.ei-canvas-element--locked {
  cursor: default;
}

.ei-canvas-element--hidden {
  opacity: 0.3;
}

.ei-canvas-element--deep-editing {
  z-index: 5 !important;
  cursor: default;
}

.ei-canvas-element__content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--ei-text-secondary, #999);
  box-sizing: border-box;
  overflow: visible;
  position: relative;
}

.ei-canvas-element__content:not(:has(.ei-canvas-element__render)) {
  border: 1px dashed var(--ei-border-color, #d0d0d0);
}

.ei-canvas-element--selected .ei-canvas-element__content:not(:has(.ei-canvas-element__render)) {
  border-color: var(--ei-primary, #1890ff);
}

.ei-canvas-element__render {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.ei-canvas-element__type-label {
  user-select: none;
  pointer-events: none;
}

.ei-canvas-element__bind-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ei-success, #52c41a);
}

.ei-canvas-element__selection-border {
  position: absolute;
  inset: -1px;
  border: 2px solid var(--ei-primary, #1890ff);
  pointer-events: none;
}

/* ─── Resize Handles ──────────────────────────────────────────── */

.ei-canvas-element__handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #fff;
  border: 1.5px solid var(--ei-primary, #1890ff);
  border-radius: 1px;
  box-sizing: border-box;
  z-index: 1;
}

/* Corner handles */
.ei-canvas-element__handle--nw {
  top: -4px;
  left: -4px;
}

.ei-canvas-element__handle--ne {
  top: -4px;
  right: -4px;
}

.ei-canvas-element__handle--sw {
  bottom: -4px;
  left: -4px;
}

.ei-canvas-element__handle--se {
  bottom: -4px;
  right: -4px;
}

/* Edge handles */
.ei-canvas-element__handle--n {
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
}

.ei-canvas-element__handle--s {
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
}

.ei-canvas-element__handle--w {
  top: 50%;
  left: -4px;
  transform: translateY(-50%);
}

.ei-canvas-element__handle--e {
  top: 50%;
  right: -4px;
  transform: translateY(-50%);
}

/* ─── Rotation Handle ────────────────────────────────────────── */

.ei-canvas-element__rotate-handle {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  cursor: crosshair;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ei-canvas-element__rotate-line {
  width: 1px;
  height: 20px;
  background: var(--ei-primary, #1890ff);
}

.ei-canvas-element__rotate-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  border: 1.5px solid var(--ei-primary, #1890ff);
  box-sizing: border-box;
}

/* ─── Marquee Selection ───────────────────────────────────────── */

.ei-canvas-marquee {
  position: absolute;
  border: 1px solid var(--ei-primary, #1890ff);
  background: rgba(24, 144, 255, 0.08);
  pointer-events: none;
  z-index: 9999;
}

/* ─── Floating Windows ────────────────────────────────────────── */

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

/* ─── Floating Windows ────────────────────────────────────────── */</style>
