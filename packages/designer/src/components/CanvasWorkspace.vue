<script setup lang="ts">
import type { EditorSurfacePagePlan, MaterialDesignerRenderContext } from '@easyink/core'
import type { ResizeHandle } from '../composables/use-element-resize'
import type { MarqueeRect } from '../composables/use-marquee-select'
import type { WorkspaceWindowState } from '../types'
import {
  AddPageSheetCommand,
  createEditorSurfacePlan,
  getEditorSurfacePageLeft,
  projectDocumentPointToEditorSurface,
  readNodeRepeatScope,
  RemovePageSheetCommand,
  UnitManager,
} from '@easyink/core'
import { IconDelete, IconDown, IconNewTemplate, IconUp } from '@easyink/icons'
import { EiIcon } from '@easyink/ui'
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
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

const PAGE_TOOLBAR_GAP_PX = 16

type PageToolbarMode = 'fixed-sheet-management'

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

const isFixedSheetPlan = computed(() =>
  editorSurfacePlan.value.pages.length > 0
  && editorSurfacePlan.value.pages.every(page => page.kind === 'page')
  && store.schema.page.pagination?.strategy === 'fixed-sheets',
)

const pageToolbarMode = computed<PageToolbarMode | null>(() => {
  const strategy = store.schema.page.pagination?.strategy
  if (strategy === 'fixed-sheets' && isFixedSheetPlan.value)
    return 'fixed-sheet-management'
  return null
})

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
    if (node.hidden)
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

const pageFrames = computed(() => {
  const plan = editorSurfacePlan.value
  const unit = store.schema.unit
  return plan.pages.map(page => ({
    page,
    style: {
      left: `${getEditorSurfacePageLeft(plan, page)}${unit}`,
      top: `${page.yOffset}${unit}`,
      width: `${page.width}${unit}`,
      height: `${page.height}${unit}`,
      ...resolvePageBackgroundStyle(store.schema.page.background, unit),
    },
  }))
})

const pageToolbarItems = computed(() => {
  const mode = pageToolbarMode.value
  if (!mode)
    return []
  const plan = editorSurfacePlan.value
  const zoom = store.workbench.viewport.zoom
  const unitManager = new UnitManager(store.schema.unit)
  return plan.pages.map(page => ({
    mode,
    page,
    style: {
      left: `${unitManager.toPixels(getEditorSurfacePageLeft(plan, page) + page.width, 96, zoom) + PAGE_TOOLBAR_GAP_PX}px`,
      top: `${unitManager.toPixels(page.yOffset, 96, zoom) + 0}px`,
    },
  }))
})

const autoPaginationLines = computed(() => {
  if (store.schema.page.pagination?.strategy !== 'auto-sheets')
    return []
  const plan = editorSurfacePlan.value
  const page = plan.pages[0]
  if (!page)
    return []
  const lines: number[] = []
  const pageHeight = store.schema.page.height
  for (let y = pageHeight; y < page.height; y += pageHeight)
    lines.push(y)
  return lines
})

const pageBreakLineStyles = computed(() => {
  if (isFixedSheetPlan.value) {
    const plan = editorSurfacePlan.value
    const unit = store.schema.unit
    return plan.pages.slice(0, -1).map(page => ({
      key: `fixed-${page.index}`,
      style: {
        left: `${pageLeft(page)}${unit}`,
        top: `${page.yOffset + page.height}${unit}`,
        width: `${page.width}${unit}`,
      },
    }))
  }

  const page = editorSurfacePlan.value.pages[0]
  if (!page)
    return []
  const unit = store.schema.unit
  return autoPaginationLines.value.map(line => ({
    key: `auto-${line}`,
    style: {
      left: `${pageLeft(page)}${unit}`,
      top: `${line}${unit}`,
      width: `${page.width}${unit}`,
    },
  }))
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

function pageLeft(page: EditorSurfacePagePlan): number {
  return getEditorSurfacePageLeft(editorSurfacePlan.value, page)
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
    opacity: node.hidden ? 1 : (node.alpha ?? 1),
    zIndex: node.zIndex ?? 'auto',
  }
}

function projectRepeatPreviewStyle(node: ReturnType<typeof store.getElements>[number], overrideY: number) {
  const style = projectNodeStyle(node, overrideY)
  return {
    ...style,
    opacity: node.hidden ? 0.45 : (node.alpha ?? 1) * 0.45,
  }
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

function countElementsOnPage(page: EditorSurfacePagePlan): number {
  const start = page.yOffset
  const end = page.yOffset + page.height
  return store.schema.elements.filter((node) => {
    const bottom = node.y + node.height
    return node.y < end && bottom > start
  }).length
}

function addSheetAfter(page: EditorSurfacePagePlan) {
  if (!isFixedSheetPlan.value)
    return
  store.commands.execute(new AddPageSheetCommand(store.schema, editorSurfacePlan.value, page.index))
  store.markDraftModified()
}

async function removeSheet(page: EditorSurfacePagePlan) {
  if (!canDeletePage(page))
    return
  const affectedElementCount = countElementsOnPage(page)
  if (affectedElementCount > 0) {
    const confirmed = await store.interactions.confirm({
      id: 'designer.page.deleteWithElements',
      title: store.t('designer.toolbar.deletePage'),
      message: store.t('designer.message.confirmDeletePageWithElements'),
      severity: 'danger',
      confirmText: store.t('designer.dialog.confirm'),
      cancelText: store.t('designer.dialog.cancel'),
      payload: {
        pageIndex: page.index,
        pageNumber: page.index + 1,
        affectedElementCount,
      },
    })
    if (!confirmed)
      return
  }
  store.commands.execute(new RemovePageSheetCommand(store.schema, editorSurfacePlan.value, page.index))
  store.markDraftModified()
}

function scrollToPage(page: EditorSurfacePagePlan) {
  const el = scrollRef.value
  if (!el)
    return
  const zoom = store.workbench.viewport.zoom
  const unitManager = new UnitManager(store.schema.unit)
  const style = window.getComputedStyle(el)
  const paddingTop = Number.parseFloat(style.paddingTop) || 0
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
  const margin = 24
  el.scrollTo({
    top: Math.max(paddingTop + unitManager.toPixels(page.yOffset, 96, zoom) - margin, 0),
    left: Math.max(paddingLeft + unitManager.toPixels(pageLeft(page), 96, zoom) - margin, 0),
    behavior: 'smooth',
  })
}

function canDeletePage(page: EditorSurfacePagePlan): boolean {
  return page.kind === 'page' && isFixedSheetPlan.value && editorSurfacePlan.value.pages.length > 1
}

function scrollByPage(page: EditorSurfacePagePlan, delta: number) {
  const pages = editorSurfacePlan.value.pages
  if (pages.length === 0)
    return
  const next = pages[Math.min(Math.max(page.index + delta, 0), pages.length - 1)]
  if (next)
    scrollToPage(next)
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
  }
})

onUnmounted(() => {
  if (windowLayoutTimer) {
    clearTimeout(windowLayoutTimer)
    windowLayoutTimer = null
  }
  containerObserver.disconnect()
  cursorPos.value = null
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

          <div
            v-for="line in pageBreakLineStyles"
            :key="line.key"
            class="ei-canvas-page-break"
            :style="line.style"
          />

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
              'ei-canvas-element--locked': el.locked,
              'ei-canvas-element--hidden': el.hidden,
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

            <!-- Selection border, resize handles & rotation handle -->
            <template v-if="store.selection.has(el.id) && editingNodeId !== el.id">
              <div v-if="!el.hidden || el.locked" class="ei-canvas-element__selection-border" />

              <!-- Per-element transform handles only in single-selection mode.
                   Multi-selection renders a single group frame outside this loop. -->
              <template v-if="!isMultiSelection && !el.locked && !el.hidden">
                <!-- 8 resize handles -->
                <div
                  v-for="handle in getElementResizeHandles(el.id)"
                  :key="handle"
                  class="ei-canvas-element__handle"
                  :class="`ei-canvas-element__handle--${handle}`"
                  :style="{ cursor: handleCursorForHandle(handle) }"
                  @pointerdown="handleResizePointerDown($event, el.id, handle)"
                />

                <!-- Rotation handle (hidden for non-rotatable materials like tables) -->
                <div
                  v-if="isElementRotatable(store, el)"
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

        <div
          v-for="item in pageToolbarItems"
          :key="`toolbar-${item.page.index}`"
          class="ei-page-toolbar"
          :style="item.style"
          @pointerdown.stop
        >
          <button
            class="ei-page-toolbar__button"
            type="button"
            :title="store.t('designer.toolbar.addPage')"
            @click="addSheetAfter(item.page)"
          >
            <EiIcon :icon="IconNewTemplate" :size="15" />
          </button>
          <button
            class="ei-page-toolbar__button"
            type="button"
            :title="store.t('designer.toolbar.deletePage')"
            :disabled="!canDeletePage(item.page)"
            @click="removeSheet(item.page)"
          >
            <EiIcon :icon="IconDelete" :size="15" />
          </button>
          <button
            class="ei-page-toolbar__button"
            type="button"
            :title="store.t('designer.toolbar.previousPage')"
            :disabled="item.page.index <= 0"
            @click="scrollByPage(item.page, -1)"
          >
            <EiIcon :icon="IconUp" :size="15" />
          </button>
          <button
            class="ei-page-toolbar__button"
            type="button"
            :title="store.t('designer.toolbar.nextPage')"
            :disabled="item.page.index >= editorSurfacePlan.pages.length - 1"
            @click="scrollByPage(item.page, 1)"
          >
            <EiIcon :icon="IconDown" :size="15" />
          </button>
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

  &--continuous {
    min-height: 100%;
  }
}

.ei-canvas-page-break {
  position: absolute;
  height: 0;
  border-top: 1px dashed var(--ei-page-break-color, rgba(24, 144, 255, 0.72));
  pointer-events: none;
  z-index: 15;

  &::before,
  &::after {
    content: "";
    position: absolute;
    top: 0;
    width: 0;
    height: 0;
    transform: translateY(-50%);
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
  }

  &::before {
    left: -8px;
    border-left: 8px solid var(--ei-page-break-color, rgba(24, 144, 255, 0.72));
  }

  &::after {
    right: -8px;
    border-right: 8px solid var(--ei-page-break-color, rgba(24, 144, 255, 0.72));
  }
}

.ei-page-toolbar {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--ei-border-color, #d9d9d9);
  border-radius: 6px;
  // box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
  z-index: 20;

  &__button {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ei-text-primary, #333);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--ei-hover-bg, rgba(24, 144, 255, 0.1));
      color: var(--ei-primary, #1890ff);
    }

    &:disabled {
      color: var(--ei-text-disabled, #bbb);
      cursor: not-allowed;
    }
  }
}

.ei-canvas-element {
  position: absolute;
  cursor: move;
  box-sizing: border-box;

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
    z-index: 5 !important;
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
