<script setup lang="ts">
import type { ResizeHandle } from '../composables/use-element-resize'
import type { MarqueeRect } from '../composables/use-marquee-select'
import type { WorkspaceWindowState } from '../types'
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { useDesignerStore } from '../composables'
import { useDatasourceDrop } from '../composables/use-datasource-drop'
import { useElementResize } from '../composables/use-element-resize'
import { useElementRotate } from '../composables/use-element-rotate'
import { useKeyboardShortcuts } from '../composables/use-keyboard-shortcuts'
import { useMarqueeSelect } from '../composables/use-marquee-select'
import { useMaterialDrop } from '../composables/use-material-drop'
import { useCanvasInteractionController } from '../interactions'
import { getSelectionBox } from '../snap'
import { CANVAS_CONTAINER_KEY } from './canvas-container'
import CanvasContextMenu from './CanvasContextMenu.vue'
import CanvasElementContent from './CanvasElementContent.vue'
import CanvasRuler from './CanvasRuler.vue'
import DataSourcePanel from './DataSourcePanel.vue'
import DebugPanel from './DebugPanel.vue'
import EphemeralPanelHost from './EphemeralPanelHost.vue'
import GridOverlay from './GridOverlay.vue'
import GuideOverlay from './GuideOverlay.vue'
import HistoryPanel from './HistoryPanel.vue'
import MaterialPanel from './MaterialPanel.vue'
import MinimapPanel from './MinimapPanel.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import SelectionOverlay from './SelectionOverlay.vue'
import SnapLineOverlay from './SnapLineOverlay.vue'
import StructureTree from './StructureTree.vue'
import ToolbarManager from './ToolbarManager.vue'
import WorkspaceWindow from './WorkspaceWindow.vue'

const store = useDesignerStore()
const containerRef = ref<HTMLElement | null>(null)
const pageRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const marqueeRect = ref<MarqueeRect | null>(null)
const guideOverlayRef = ref<InstanceType<typeof GuideOverlay> | null>(null)
const contextMenuRef = ref<InstanceType<typeof CanvasContextMenu> | null>(null)
const rulerRef = ref<InstanceType<typeof CanvasRuler> | null>(null)

function updateWindowState(windowState: WorkspaceWindowState, patch: Partial<WorkspaceWindowState>) {
  Object.assign(windowState, patch)
}
const cursorPos = ref<{ x: number, y: number } | null>(null)
const rulerHover = ref<{ axis: 'x' | 'y', position: number } | null>(null)

provide(CANVAS_CONTAINER_KEY, () => containerRef.value)

const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']

// ─── Composables ─────────────────────────────────────────────────

const { onCanvasPointerDown } = useMarqueeSelect({
  store,
  getPageEl: () => pageRef.value,
  marqueeRef: marqueeRect,
})

const {
  handleElementPointerDown,
  handleElementClick,
  handleElementDblClick,
  handleScrollPointerDown: controllerHandleScrollPointerDown,
} = useCanvasInteractionController({
  store,
  getPageEl: () => pageRef.value,
  getScrollEl: () => scrollRef.value,
  onCanvasBackgroundPointerDown: e => onCanvasPointerDown(e),
})

const { onHandlePointerDown } = useElementResize({
  store,
  getPageEl: () => pageRef.value,
})

const { onRotatePointerDown } = useElementRotate({
  store,
  getPageEl: () => pageRef.value,
})

useKeyboardShortcuts({
  store,
  getContainer: () => containerRef.value,
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

// Wrapper carries the *visual* (post-zoom) size so the scroll container
// reflects the real on-screen footprint of the page. The inner page keeps
// its document-unit size and only applies CSS scale, so all overlays/elements
// can stay in document-unit coordinates.
const wrapperStyle = computed(() => {
  const page = store.schema.page
  const unit = store.schema.unit
  const zoom = store.workbench.viewport.zoom
  return {
    width: `calc(${page.width}${unit} * ${zoom})`,
    height: `calc(${page.height}${unit} * ${zoom})`,
  }
})

const elements = computed(() => store.getElements())

const editingNodeId = computed(() => store.editingSession.activeNodeId)

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

// Group selection frame: a single bounding-box overlay rendered when more
// than one element is selected. Per-element resize / rotate handles are
// suppressed in that case (they would visually clash and have no defined
// group-transform semantics yet). The frame is purely visual; it conveys
// the aggregated extent so users can see what they're about to drag/copy/
// delete as a group.
const isMultiSelection = computed(() => store.selection.count > 1)

const groupSelectionFrame = computed(() => {
  if (!isMultiSelection.value)
    return null
  const nodes = store.selection.ids
    .map(id => store.getElementById(id))
    .filter((n): n is NonNullable<typeof n> => n != null)
  if (nodes.length < 2)
    return null
  const box = getSelectionBox(nodes, n => store.getVisualSize(n))
  if (!box)
    return null
  const unit = store.schema.unit
  return {
    left: `${box.x}${unit}`,
    top: `${box.y}${unit}`,
    width: `${box.width}${unit}`,
    height: `${box.height}${unit}`,
  }
})

// ─── Helpers ─────────────────────────────────────────────────────

function windowTitle(kind: string): string {
  if (kind === 'toolbar-manager')
    return store.t('designer.toolbar.manager')
  const key = kind === 'structure-tree' ? 'structureTree' : kind
  return store.t(`designer.panel.${key}`)
}

function isResizable(kind: string): boolean {
  return kind !== 'minimap'
}

function handleScrollPointerDown(e: PointerEvent) {
  controllerHandleScrollPointerDown(e)
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
  if (!el)
    return
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
  if (!el)
    return

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
      <div class="ei-canvas-page-wrapper" :style="wrapperStyle">
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

              <!-- Per-element transform handles only in single-selection mode.
                   Multi-selection renders a single group frame outside this loop. -->
              <template v-if="!isMultiSelection">
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
            </template>
          </div>

          <!-- Group selection frame (multi-selection only) -->
          <div
            v-if="groupSelectionFrame"
            class="ei-canvas-group-frame"
            :style="groupSelectionFrame"
          />

          <!-- Snap line overlay -->
          <SnapLineOverlay />

          <!-- Selection overlay (decorations from editing session) -->
          <SelectionOverlay />

          <!-- Ephemeral panel host -->
          <EphemeralPanelHost />

          <!-- Marquee selection rectangle -->
          <div
            v-if="marqueeStyle"
            class="ei-canvas-marquee"
            :style="marqueeStyle"
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
          @update-window-state="updateWindowState(win, $event)"
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
    <CanvasContextMenu ref="contextMenuRef" />
  </div>
</template>

<style scoped lang="scss">
.ei-canvas-workspace {
  flex: 1;
  overflow: hidden;
  background: var(--ei-canvas-bg, #e8e8e8);
  position: relative;

  &__placeholder {
    color: var(--ei-text-secondary, #999);
    text-align: center;
    padding: 20px;
    font-size: 12px;
  }
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

.ei-canvas-page-wrapper {
  position: relative;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  // Promote to its own compositor layer so that integer-sized wrapper bounds
  // clip cleanly without bleeding the page's sub-pixel scaled content.
  will-change: width, height;
  transform: translateZ(0);
}

.ei-canvas-page {
  position: absolute;
  top: 0;
  left: 0;
  overflow: visible;
}

.ei-canvas-element {
  position: absolute;
  cursor: move;
  box-sizing: border-box;

  &--locked {
    cursor: default;
  }

  &--hidden {
    opacity: 0.3;
  }

  &--deep-editing {
    z-index: 5 !important;
    cursor: default;
  }

  &--selected &__content:not(:has(&__render)) {
    border-color: var(--ei-primary, #1890ff);
  }

  &__content {
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

    &:not(:has(.ei-canvas-element__render)) {
      border: 1px dashed var(--ei-border-color, #d0d0d0);
    }
  }

  &__render {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  &__type-label {
    user-select: none;
    pointer-events: none;
  }

  &__bind-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ei-success, #52c41a);
  }

  &__selection-border {
    position: absolute;
    inset: -1px;
    border: 2px solid var(--ei-primary, #1890ff);
    pointer-events: none;
  }

  &__handle {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #fff;
    border: 1.5px solid var(--ei-primary, #1890ff);
    border-radius: 1px;
    box-sizing: border-box;
    z-index: 1;

    &--nw {
      top: -4px;
      left: -4px;
    }

    &--ne {
      top: -4px;
      right: -4px;
    }

    &--sw {
      bottom: -4px;
      left: -4px;
    }

    &--se {
      bottom: -4px;
      right: -4px;
    }

    &--n {
      top: -4px;
      left: 50%;
      transform: translateX(-50%);
    }

    &--s {
      bottom: -4px;
      left: 50%;
      transform: translateX(-50%);
    }

    &--w {
      top: 50%;
      left: -4px;
      transform: translateY(-50%);
    }

    &--e {
      top: 50%;
      right: -4px;
      transform: translateY(-50%);
    }
  }

  &__rotate-handle {
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

  &__rotate-line {
    width: 1px;
    height: 20px;
    background: var(--ei-primary, #1890ff);
  }

  &__rotate-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #fff;
    border: 1.5px solid var(--ei-primary, #1890ff);
    box-sizing: border-box;
  }
}

.ei-canvas-marquee {
  position: absolute;
  border: 1px dashed var(--ei-primary, #1890ff);
  background: rgba(24, 144, 255, 0.08);
  pointer-events: none;
  z-index: 9999;
}

.ei-canvas-group-frame {
  position: absolute;
  // Dashed outline distinguishes the aggregate frame from per-element solid borders.
  border: 1px dashed var(--ei-primary, #1890ff);
  pointer-events: none;
  // Sit above element selection-borders but below transient overlays (snap lines, marquee).
  z-index: 100;
}

.ei-canvas-windows {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
</style>
