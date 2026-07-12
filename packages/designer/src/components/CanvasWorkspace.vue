<script setup lang="ts">
import type { EditorSurfacePagePlan, MaterialDesignerRenderContext, Rect } from '@easyink/core'
import type { ResizeHandle } from '../composables/use-element-resize'
import type { MarqueeRect } from '../composables/use-marquee-select'
import type { WorkspaceWindowState } from '../types'
import {
  createEditorSurfacePlan,
  getEditorSurfacePageLeft,
  groupPageLayerPlansByPlacement,
  PAGE_CONTENT_LAYER_STACK_INDEX,
  projectDocumentPointToEditorSurface,
  readNodeRepeatScope,
  resolvePageLayerPlans,
  resolvePageLayerStackIndex,
} from '@easyink/core'
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useDesignerStore } from '../composables'
import { DESIGNER_DRAG_DROP_KEY, useDesignerDragDrop } from '../composables/use-designer-drag-drop'
import { useElementResize } from '../composables/use-element-resize'
import { useElementRotate } from '../composables/use-element-rotate'
import { useKeyboardShortcuts } from '../composables/use-keyboard-shortcuts'
import { useMarqueeSelect } from '../composables/use-marquee-select'
import { useCanvasInteractionController } from '../interactions'
import { isElementRotatable } from '../materials/capabilities'
import { getVisibleResizeHandles } from '../materials/control-policy'
import { getSelectionBox } from '../snap'
import { clampWorkspaceWindows, hasUsableWorkspaceRect, resolveAnchoredWorkspaceWindows } from '../store/workspace-window-layout'
import { CANVAS_CONTAINER_KEY } from './canvas-container'
import { resolveScrollPositionForSurfaceCenter, resolveVisibleSurfaceRect } from './canvas-viewport'
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
import { resolvePageBackgroundStyle } from './page-background-style'
import PageBreakRuler from './PageBreakRuler.vue'
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
const viewportSurfaceRect = ref<Rect | null>(null)

provide(CANVAS_CONTAINER_KEY, () => containerRef.value)

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

const dragDrop = useDesignerDragDrop({
  store,
  getPageEl: () => pageRef.value,
})

provide(DESIGNER_DRAG_DROP_KEY, dragDrop)

function handlePageDragOver(e: DragEvent) {
  dragDrop.onCanvasDragOver(e)
}

function handlePageDragLeave(e: DragEvent) {
  dragDrop.onCanvasDragLeave(e)
}

function handlePageDrop(e: DragEvent) {
  dragDrop.onCanvasDrop(e)
}

// ─── Computed ────────────────────────────────────────────────────

const editorSurfacePlan = computed(() => createEditorSurfacePlan(store.schema))

const surfaceStyle = computed(() => {
  const plan = editorSurfacePlan.value
  const unit = store.schema.unit
  const zoom = store.workbench.viewport.zoom
  return {
    width: `${plan.contentBounds.width}${unit}`,
    height: `${plan.contentBounds.height}${unit}`,
    fontFamily: store.schema.page.font || undefined,
    transform: `scale(${zoom})`,
    transformOrigin: 'top left',
  }
})

// Wrapper carries the *visual* (post-zoom) size so the scroll container
// reflects the real on-screen footprint of the page. The inner page keeps
// its document-unit size and only applies CSS scale, so all overlays/elements
// can stay in document-unit coordinates.
const wrapperStyle = computed(() => {
  const plan = editorSurfacePlan.value
  const unit = store.schema.unit
  const zoom = store.workbench.viewport.zoom
  return {
    width: `calc(${plan.contentBounds.width}${unit} * ${zoom})`,
    height: `calc(${plan.contentBounds.height}${unit} * ${zoom})`,
  }
})

const elements = computed(() => store.getElements())

const elementRenderContexts = computed(() => {
  const contexts = new Map<string, MaterialDesignerRenderContext>()
  const pages = resolveRepeatPreviewPages()
  if (pages.length === 0)
    return contexts

  for (const node of elements.value) {
    const sourcePage = resolveRepeatSourcePage(node, pages)
    contexts.set(node.id, createPageRenderContext(sourcePage.index, pages.length))
  }
  return contexts
})

const repeatedPreviewElements = computed(() => {
  const pages = resolveRepeatPreviewPages()
  if (pages.length <= 1)
    return []

  const previews: Array<{
    key: string
    sourceId: string
    renderContext: MaterialDesignerRenderContext
    style: ReturnType<typeof projectNodeStyle>
  }> = []

  for (const node of elements.value) {
    if (!isRepeatedEveryPage(node))
      continue
    if (node.editorState?.hidden)
      continue
    const sourcePage = resolveRepeatSourcePage(node, pages)
    const localY = node.y - sourcePage.yOffset
    for (const page of pages) {
      if (page.index === sourcePage.index)
        continue
      previews.push({
        key: `${node.id}__repeat_preview_${page.index}`,
        sourceId: node.id,
        renderContext: createPageRenderContext(page.index, pages.length),
        style: projectRepeatPreviewStyle(node, page.yOffset + localY),
      })
    }
  }
  return previews
})

const editingNodeId = computed(() => store.editingSession.activeNodeId)

const marqueeStyle = computed(() => {
  if (!marqueeRect.value)
    return null
  const r = marqueeRect.value
  const unit = store.schema.unit
  const topLeft = projectDocumentPointToEditorSurface(editorSurfacePlan.value, { x: r.x, y: r.y })
  return {
    left: `${topLeft.x}${unit}`,
    top: `${topLeft.y}${unit}`,
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

const selectedControlElements = computed(() =>
  elements.value.filter(el => store.selection.has(el.id) && editingNodeId.value !== el.id),
)

const groupSelectionFrame = computed(() => {
  if (!isMultiSelection.value)
    return null
  const nodes = store.selection.ids
    .map(id => store.getElementById(id))
    .filter((n): n is NonNullable<typeof n> => n != null)
  if (nodes.length < 2)
    return null
  const box = getSelectionBox(nodes, n => store.getElementSize(n))
  if (!box)
    return null
  const unit = store.schema.unit
  const topLeft = projectDocumentPointToEditorSurface(editorSurfacePlan.value, { x: box.x, y: box.y })
  return {
    left: `${topLeft.x}${unit}`,
    top: `${topLeft.y}${unit}`,
    width: `${box.width}${unit}`,
    height: `${box.height}${unit}`,
  }
})

const contentLayerStyle = {
  zIndex: PAGE_CONTENT_LAYER_STACK_INDEX,
}
const controlLayerStyle = {
  zIndex: 1_000_000,
}

const pageLayerBucketsByPageSize = computed(() => {
  const buckets = new Map<string, ReturnType<typeof groupPageLayerPlansByPlacement>>()
  for (const page of editorSurfacePlan.value.pages) {
    const key = createPageSizeKey(page.width, page.height)
    if (!buckets.has(key)) {
      buckets.set(key, groupPageLayerPlansByPlacement(resolvePageLayerPlans(store.schema.page, {
        width: page.width,
        height: page.height,
      })))
    }
  }
  return buckets
})

const pageFrames = computed(() => {
  const plan = editorSurfacePlan.value
  const unit = store.schema.unit
  const pageLayerBuckets = pageLayerBucketsByPageSize.value
  return plan.pages.map((page) => {
    const pagePositionStyle = {
      left: `${getEditorSurfacePageLeft(plan, page)}${unit}`,
      top: `${page.yOffset}${unit}`,
      width: `${page.width}${unit}`,
      height: `${page.height}${unit}`,
    }
    const buckets = pageLayerBuckets.get(createPageSizeKey(page.width, page.height))
    const layerPlans = buckets ? flattenPageLayerBuckets(buckets) : []
    return {
      page,
      layerPlans,
      style: {
        ...pagePositionStyle,
        ...resolvePageBackgroundStyle(store.schema.page.background, unit),
      },
      layerStyle: pagePositionStyle,
    }
  })
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

function getElementResizeHandles(elementId: string): ResizeHandle[] {
  const el = store.getElementById(elementId)
  if (!el)
    return []
  return getVisibleResizeHandles(store, el)
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
  if (!store.workbench.guide.enabled)
    return
  guideOverlayRef.value?.onGuideDragStart(direction, e)
}

function handleGuideCreate(axis: 'x' | 'y', position: number) {
  if (!store.workbench.guide.enabled)
    return
  guideOverlayRef.value?.createGuideAt(axis, position)
}

function handleScroll() {
  const el = scrollRef.value
  if (!el)
    return
  store.workbench.viewport.scrollLeft = el.scrollLeft
  store.workbench.viewport.scrollTop = el.scrollTop
  updateViewportSurfaceRect()
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
  rulerHover.value = store.workbench.guide.enabled ? hover : null
}

function projectNodeStyle(node: ReturnType<typeof store.getElements>[number], overrideY?: number) {
  const unit = store.schema.unit
  const point = projectDocumentPointToEditorSurface(editorSurfacePlan.value, { x: node.x, y: overrideY ?? node.y })
  return {
    left: `${point.x}${unit}`,
    top: `${point.y}${unit}`,
    width: `${node.width}${unit}`,
    height: `${node.height}${unit}`,
    transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
    opacity: node.editorState?.hidden ? 1 : (node.alpha ?? 1),
    zIndex: node.zIndex ?? 'auto',
  }
}

function projectRepeatPreviewStyle(node: ReturnType<typeof store.getElements>[number], overrideY: number) {
  const style = projectNodeStyle(node, overrideY)
  return {
    ...style,
    opacity: node.editorState?.hidden ? 0.45 : (node.alpha ?? 1) * 0.45,
  }
}

function resolveWatermarkTileStyle(tile: { x: number, y: number }, rotation: number, fontSize: number) {
  const unit = store.schema.unit
  return {
    left: `${tile.x}${unit}`,
    top: `${tile.y}${unit}`,
    fontSize: `${fontSize}${unit}`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  }
}

function isWatermarkLayerPlan(plan: ReturnType<typeof resolvePageLayerPlans>[number]) {
  return plan.layer.kind === 'watermark' && plan.layer.type === 'text'
}

function resolvePageLayerPlanStyle(plan: ReturnType<typeof resolvePageLayerPlans>[number]) {
  return {
    zIndex: resolvePageLayerStackIndex(plan),
    color: plan.layer.kind === 'watermark' ? plan.layer.color : undefined,
    opacity: plan.layer.kind === 'watermark' ? plan.layer.opacity : undefined,
  }
}

function flattenPageLayerBuckets(buckets: ReturnType<typeof groupPageLayerPlansByPlacement>): ReturnType<typeof resolvePageLayerPlans> {
  return [
    ...buckets.underContent,
    ...buckets.overContent,
    ...buckets.top,
  ]
}

function createPageSizeKey(width: number, height: number): string {
  return `${width}:${height}`
}

function isRepeatedEveryPage(node: ReturnType<typeof store.getElements>[number]): boolean {
  return readNodeRepeatScope(node) === 'every-output-page'
    || store.getMaterial(node.type)?.capabilities.pageAware === true
}

function createPageRenderContext(pageIndex: number, totalPages: number): MaterialDesignerRenderContext {
  return {
    page: {
      pageIndex,
      pageNumber: pageIndex + 1,
      totalPages,
    },
  }
}

function resolveRepeatPreviewPages(): EditorSurfacePagePlan[] {
  if (store.schema.page.pagination?.strategy !== 'auto-sheets')
    return editorSurfacePlan.value.pages

  const page = editorSurfacePlan.value.pages[0]
  if (!page)
    return []
  const pageHeight = store.schema.page.height
  if (pageHeight <= 0)
    return [page]
  const count = Math.max(Math.ceil(page.height / pageHeight), 1)
  return Array.from({ length: count }, (_, index) => ({
    index,
    width: page.width,
    height: pageHeight,
    yOffset: index * pageHeight,
    kind: 'page' as const,
  }))
}

function resolveRepeatSourcePage(node: ReturnType<typeof store.getElements>[number], pages: EditorSurfacePagePlan[]): EditorSurfacePagePlan {
  return pages.find(page => node.y >= page.yOffset && node.y < page.yOffset + page.height)
    ?? pages[0]
    ?? {
      index: 0,
      width: store.schema.page.width,
      height: store.schema.page.height,
      yOffset: 0,
      kind: 'page',
    }
}

function updateViewportSurfaceRect() {
  const scrollEl = scrollRef.value
  const surfaceEl = pageRef.value
  if (!scrollEl || !surfaceEl) {
    viewportSurfaceRect.value = null
    return
  }

  const zoom = store.workbench.viewport.zoom || 1
  const scrollRect = scrollEl.getBoundingClientRect()
  const surfaceRect = surfaceEl.getBoundingClientRect()
  viewportSurfaceRect.value = resolveVisibleSurfaceRect({
    unit: store.schema.unit,
    zoom,
    scrollRect: {
      left: scrollRect.left,
      top: scrollRect.top,
    },
    surfaceRect: {
      left: surfaceRect.left,
      top: surfaceRect.top,
    },
    viewportSize: {
      width: scrollEl.clientWidth,
      height: scrollEl.clientHeight,
    },
  })
}

function handleMinimapNavigate(surfacePoint: { x: number, y: number }) {
  const scrollEl = scrollRef.value
  const surfaceEl = pageRef.value
  if (!scrollEl || !surfaceEl)
    return

  const zoom = store.workbench.viewport.zoom || 1
  const scrollRect = scrollEl.getBoundingClientRect()
  const surfaceRect = surfaceEl.getBoundingClientRect()
  const scrollPosition = resolveScrollPositionForSurfaceCenter(surfacePoint, {
    unit: store.schema.unit,
    zoom,
    scrollRect: {
      left: scrollRect.left,
      top: scrollRect.top,
    },
    surfaceRect: {
      left: surfaceRect.left,
      top: surfaceRect.top,
    },
    scrollOffset: {
      left: scrollEl.scrollLeft,
      top: scrollEl.scrollTop,
    },
    viewportSize: {
      width: scrollEl.clientWidth,
      height: scrollEl.clientHeight,
    },
  })

  scrollEl.scrollTo({
    left: scrollPosition.left,
    top: scrollPosition.top,
    behavior: 'smooth',
  })
}

// ─── Window position clamping ────────────────────────────────────

let windowLayoutTimer: ReturnType<typeof setTimeout> | null = null

function clampWindowPositions() {
  const el = containerRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  if (!hasUsableWorkspaceRect(rect))
    return

  resolveAnchoredWorkspaceWindows(store.workbench.windows, rect)
  clampWorkspaceWindows(store.workbench.windows, rect)
}

function scheduleWindowLayout() {
  if (windowLayoutTimer)
    clearTimeout(windowLayoutTimer)
  windowLayoutTimer = setTimeout(() => {
    windowLayoutTimer = null
    clampWindowPositions()
  }, 120)
}

const containerObserver = new ResizeObserver(scheduleWindowLayout)
const viewportObserver = new ResizeObserver(updateViewportSurfaceRect)

watch(
  () => store.workbench.viewport.zoom,
  () => requestAnimationFrame(updateViewportSurfaceRect),
)

watch(() => store.workbench.guide.enabled, (enabled) => {
  if (!enabled)
    rulerHover.value = null
})

// ─── Lifecycle ───────────────────────────────────────────────────

onMounted(() => {
  const el = containerRef.value
  if (!el)
    return

  // Register page element provider so material extensions can do coordinate conversion
  store.setPageElProvider(() => pageRef.value)

  scheduleWindowLayout()
  containerObserver.observe(el)
  // Sync initial scroll position
  if (scrollRef.value) {
    handleScroll()
    viewportObserver.observe(scrollRef.value)
  }
  if (pageRef.value)
    viewportObserver.observe(pageRef.value)
})

onUnmounted(() => {
  if (windowLayoutTimer) {
    clearTimeout(windowLayoutTimer)
    windowLayoutTimer = null
  }
  containerObserver.disconnect()
  viewportObserver.disconnect()
  cursorPos.value = null
  viewportSurfaceRect.value = null
  dragDrop.cleanup()
})
</script>

<template>
  <div ref="containerRef" class="ei-canvas-workspace" tabindex="-1" @contextmenu="handleContextMenu" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave" @keydown="handleKeyDown">
    <!-- Rulers -->
    <CanvasRuler
      ref="rulerRef"
      :surface-plan="editorSurfacePlan"
      :surface-el="pageRef"
      :cursor-pos="cursorPos"
      @guide-drag-start="handleGuideDragStart"
      @guide-create="handleGuideCreate"
      @ruler-hover="handleRulerHover"
    />

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
          :style="surfaceStyle"
          @dragover="handlePageDragOver"
          @dragleave="handlePageDragLeave"
          @drop="handlePageDrop"
        >
          <div
            v-for="frame in pageFrames"
            :key="frame.page.index"
            class="ei-canvas-paper"
            :class="{
              'ei-canvas-paper--continuous': frame.page.kind === 'continuous',
            }"
            :style="frame.style"
          />

          <!-- Grid overlay -->
          <GridOverlay :surface-plan="editorSurfacePlan" />

          <!-- Guide overlay -->
          <GuideOverlay ref="guideOverlayRef" :surface-plan="editorSurfacePlan" :preview-guide="rulerHover" />

          <PageBreakRuler :surface-plan="editorSurfacePlan" />

          <div class="ei-canvas-content-layer" :style="contentLayerStyle">
            <div
              v-for="preview in repeatedPreviewElements"
              :key="preview.key"
              class="ei-canvas-element ei-canvas-element--repeat-preview"
              :style="preview.style"
            >
              <div class="ei-canvas-element__content">
                <CanvasElementContent :node-id="preview.sourceId" :render-context="preview.renderContext" />
              </div>
            </div>

            <!-- Elements -->
            <div
              v-for="el in elements"
              :key="el.id"
              class="ei-canvas-element"
              :class="{
                'ei-canvas-element--selected': store.selection.has(el.id),
                'ei-canvas-element--locked': el.editorState?.locked,
                'ei-canvas-element--hidden': el.editorState?.hidden,
                'ei-canvas-element--deep-editing': editingNodeId === el.id,
              }"
              :style="projectNodeStyle(el)"
              @pointerdown="handleElementPointerDown($event, el.id)"
              @click="handleElementClick($event, el.id)"
              @dblclick="handleElementDblClick($event, el.id)"
            >
              <div class="ei-canvas-element__content">
                <CanvasElementContent :node-id="el.id" :render-context="elementRenderContexts.get(el.id)" />
              </div>
            </div>
          </div>

          <!-- Page layer previews -->
          <div
            v-for="frame in pageFrames"
            :key="`layers_${frame.page.index}`"
            class="ei-canvas-page-layers"
            :style="{
              ...frame.layerStyle,
              display: frame.layerPlans.length > 0 ? undefined : 'none',
            }"
          >
            <template
              v-for="layerPlan in frame.layerPlans"
              :key="layerPlan.layer.id"
            >
              <div
                v-if="isWatermarkLayerPlan(layerPlan)"
                class="ei-canvas-page-layer ei-canvas-page-layer--watermark"
                :style="resolvePageLayerPlanStyle(layerPlan)"
              >
                <span
                  v-for="tile in layerPlan.tiles"
                  :key="tile.key"
                  class="ei-canvas-page-layer__watermark-tile"
                  :style="resolveWatermarkTileStyle(tile, layerPlan.layer.rotation, layerPlan.layer.fontSize)"
                >
                  {{ layerPlan.layer.text }}
                </span>
              </div>
            </template>
          </div>

          <div class="ei-canvas-control-layer" :style="controlLayerStyle">
            <div
              v-for="el in selectedControlElements"
              :key="`controls_${el.id}`"
              class="ei-canvas-element-control"
              :style="projectNodeStyle(el)"
            >
              <div v-if="!el.editorState?.hidden || el.editorState?.locked" class="ei-canvas-element__selection-border" />

              <template v-if="!isMultiSelection && !el.editorState?.locked && !el.editorState?.hidden">
                <div
                  v-for="handle in getElementResizeHandles(el.id)"
                  :key="handle"
                  class="ei-canvas-element__handle"
                  :class="`ei-canvas-element__handle--${handle}`"
                  :style="{ cursor: handleCursorForHandle(handle) }"
                  @pointerdown="handleResizePointerDown($event, el.id, handle)"
                />

                <div
                  v-if="isElementRotatable(store, el)"
                  class="ei-canvas-element__rotate-handle"
                  @pointerdown="handleRotatePointerDown($event, el.id)"
                >
                  <div class="ei-canvas-element__rotate-dot" />
                  <div class="ei-canvas-element__rotate-line" />
                </div>
              </template>
            </div>
          </div>

          <!-- Group selection frame (multi-selection only) -->
          <div
            v-if="groupSelectionFrame"
            class="ei-canvas-group-frame"
            :style="groupSelectionFrame"
          />

          <!-- Snap line overlay -->
          <SnapLineOverlay :surface-plan="editorSurfacePlan" />

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
          <MinimapPanel
            v-else-if="win.kind === 'minimap'"
            :surface-plan="editorSurfacePlan"
            :viewport-rect="viewportSurfaceRect"
            @navigate="handleMinimapNavigate"
          />
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
  user-select: none;

  &__placeholder {
    color: var(--ei-text-secondary, #999);
    text-align: center;
    padding: 20px;
    font-size: 12px;
  }
}

.ei-canvas-scroll {
  padding: 40px 40px 40px 60px;
  min-width: 100%;
  min-height: 100%;
  overflow: auto;
  position: absolute;
  inset: 0;
  top: 20px;
  left: 20px;
  // grid pattern
  background-image: radial-gradient(circle, rgb(175, 175, 175) 0.5px, transparent 0.5px);
  background-size: 10px 10px;
  background-position: 5px 5px;
}

.ei-canvas-page-wrapper {
  position: relative;
  margin: 0 auto;
  will-change: width, height;
}

.ei-canvas-page {
  position: absolute;
  top: 0;
  left: 0;
  overflow: visible;
}

.ei-canvas-paper {
  position: absolute;
  pointer-events: none;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;

  &--continuous {
    min-height: 100%;
  }
}

.ei-canvas-content-layer {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}

.ei-canvas-page-layers {
  position: absolute;
  pointer-events: none;
  user-select: none;
  overflow: hidden;
}

.ei-canvas-page-layer {
  position: absolute;
  inset: 0;

  &__watermark-tile {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    line-height: 1;
    font-weight: 500;
    transform-origin: center center;
  }
}

.ei-canvas-control-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}

.ei-canvas-element-control {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
}

.ei-canvas-element {
  position: absolute;
  cursor: move;
  box-sizing: border-box;
  pointer-events: auto;

  &--locked {
    cursor: default;
  }

  &--repeat-preview {
    pointer-events: none;
    opacity: 0.45;
    cursor: default;
  }

  &--repeat-preview &__content {
    border: 0;
  }

  &--hidden {
    cursor: default;
    border: 1px dashed var(--ei-hidden-border, #8c8c8c);

    .ei-canvas-element__content {
      display: none;
    }
  }

  &--hidden.ei-canvas-element--selected:not(.ei-canvas-element--locked) {
    border-color: var(--ei-primary, #1890ff);
  }

  &--deep-editing {
    cursor: default;
    outline: 1px dashed var(--ei-deep-edit-border, var(--ei-primary, #1890ff));
    outline-offset: 3px;
    box-shadow: 0 0 0 3px var(--ei-deep-edit-shadow, rgba(24, 144, 255, 0.08));
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

  &--locked &__selection-border {
    border-color: var(--ei-danger, #ff4d4f);
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
    pointer-events: auto;

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
    pointer-events: auto;
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
