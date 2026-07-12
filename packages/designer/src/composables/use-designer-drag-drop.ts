import type { DatasourceDropZone, DatasourceFieldInfo, Rect } from '@easyink/core'
import type { DataUnionBinding } from '@easyink/datasource'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { InjectionKey } from 'vue'
import type { DesignerStore } from '../store/designer-store'
import type { MaterialCatalogEntry } from '../types'
import {
  AddMaterialCommand,
  BindFieldCommand,
  createEditorSurfacePlan,
  pointInRect,
  projectEditorSurfacePointToDocument,
  UnitManager,
} from '@easyink/core'
import { IconRect } from '@easyink/icons'
import { deepClone } from '@easyink/shared'
import { createGeometryService } from '../editing/geometry-service'
import { selectMany, selectOne } from '../interactions/selection-api'

export const MATERIAL_DRAG_MIME = 'application/x-easyink-material'
export const DATASOURCE_DRAG_MIME = 'application/x-easyink-field'

const MATERIAL_PREVIEW_MIN_SIZE_PX = 32
const DATASOURCE_FLOATING_PREVIEW = {
  width: 136,
  height: 34,
}
const POINTER_DRAG_THRESHOLD_PX = 4

export interface DatasourceFieldDragData {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldTag?: string
  fieldLabel?: string
  format?: BindingDisplayFormat
  use?: string
  props?: Record<string, unknown>
  bindIndex?: number
  union?: DataUnionBinding[]
}

export interface DesignerDragDropContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
}

export interface DesignerDragDropController {
  startMaterialPointerDrag: (event: PointerEvent, entry: MaterialCatalogEntry) => void
  startDatasourcePointerDrag: (event: PointerEvent, data: DatasourceFieldDragData) => void
  consumeClickSuppression: () => boolean
  startMaterialDrag: (event: DragEvent, entry: MaterialCatalogEntry) => void
  startDatasourceDrag: (event: DragEvent, data: DatasourceFieldDragData) => void
  updateDragPosition: (event: DragEvent) => void
  endDrag: () => void
  onCanvasDragOver: (event: DragEvent) => void
  onCanvasDragLeave: (event: DragEvent) => void
  onCanvasDrop: (event: DragEvent) => void
  registerDatasourceDropTarget: (target: DatasourcePanelDropTarget) => () => void
  cleanup: () => void
}

export interface DatasourcePanelDropTarget {
  id: string
  element: () => HTMLElement | null
  onDragOver: (data: DatasourceFieldDragData) => { status: 'accepted' | 'rejected', label?: string }
  onDrop: (data: DatasourceFieldDragData) => void
}

export const DESIGNER_DRAG_DROP_KEY: InjectionKey<DesignerDragDropController> = Symbol('easyinkDesignerDragDrop')

type DragSession
  = | { kind: 'material', entry: MaterialCatalogEntry, dragData: string, node: MaterialNode | null }
    | { kind: 'datasource', data: DatasourceFieldDragData }

type PointerSession
  = | {
    kind: 'material'
    entry: MaterialCatalogEntry
    node: MaterialNode | null
    pointerId: number
    captureTarget: Element | null
    startX: number
    startY: number
    active: boolean
  }
  | {
    kind: 'datasource'
    data: DatasourceFieldDragData
    pointerId: number
    captureTarget: Element | null
    startX: number
    startY: number
    active: boolean
  }

type DropTarget
  = | { status: 'inside', docPoint: { x: number, y: number } }
    | { status: 'outside', docPoint: { x: number, y: number } }

type MaterialDropTarget
  = | { status: 'inside', rect: Rect, previewRect: Rect }
    | { status: 'outside', rect: Rect, previewRect: Rect }

type DragIntent
  = | { kind: 'create-material', nodes: MaterialNode[], previewRects: Rect[], accepted: boolean }
    | { kind: 'bind-element', target: MaterialNode, zone: DatasourceDropZone, docPoint: { x: number, y: number }, accepted: boolean }
    | { kind: 'bind-panel', target: DatasourcePanelDropTarget, rect: DOMRect, label?: string, accepted: boolean }
    | { kind: 'floating-preview', rect: { left: number, top: number, width: number, height: number }, label?: string }
    | { kind: 'cancel', reason: string }

interface PreviewRect {
  key: string
  rect: Rect
  accepted: boolean
  primary?: boolean
}

interface PreviewZone {
  target: MaterialNode
  elementSize: { width: number, height: number }
  zone: DatasourceDropZone
  accepted: boolean
}

export function useDesignerDragDrop(ctx: DesignerDragDropContext): DesignerDragDropController {
  const geometry = createGeometryService(ctx.store, { getPageEl: ctx.getPageEl })
  let session: DragSession | null = null
  let pointerSession: PointerSession | null = null
  let overlayEl: HTMLElement | null = null
  let emptyDragImageEl: HTMLElement | null = null
  let globalListenersAttached = false
  let pointerListenersAttached = false
  let suppressNextClick = false
  let clearClickSuppressionTimer: number | null = null
  const datasourcePanelTargets = new Map<string, DatasourcePanelDropTarget>()

  function startMaterialPointerDrag(event: PointerEvent, entry: MaterialCatalogEntry) {
    if (!canStartPointerDrag(event))
      return
    event.preventDefault()
    event.stopPropagation()
    resetActiveDragSession()
    const captureTarget = capturePointer(event)
    pointerSession = {
      kind: 'material',
      entry,
      node: createMaterialNodeDraft(entry),
      pointerId: event.pointerId,
      captureTarget,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }
    attachPointerListeners()
  }

  function startDatasourcePointerDrag(event: PointerEvent, data: DatasourceFieldDragData) {
    if (!canStartPointerDrag(event))
      return
    event.preventDefault()
    event.stopPropagation()
    resetActiveDragSession()
    const captureTarget = capturePointer(event)
    pointerSession = {
      kind: 'datasource',
      data,
      pointerId: event.pointerId,
      captureTarget,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }
    attachPointerListeners()
  }

  function consumeClickSuppression(): boolean {
    const shouldSuppress = suppressNextClick
    suppressNextClick = false
    clearClickSuppressionTimerIfNeeded()
    return shouldSuppress
  }

  function startMaterialDrag(event: DragEvent, entry: MaterialCatalogEntry) {
    if (!event.dataTransfer)
      return
    const dragData = entry.dragData ?? entry.materialType
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(MATERIAL_DRAG_MIME, dragData)
    setEmptyDragImage(event.dataTransfer)
    session = { kind: 'material', entry, dragData, node: createMaterialNodeDraft(entry) }
    attachGlobalListeners()
    updateDragPosition(event)
  }

  function startDatasourceDrag(event: DragEvent, data: DatasourceFieldDragData) {
    if (!event.dataTransfer)
      return
    event.dataTransfer.effectAllowed = 'copyLink'
    event.dataTransfer.setData(DATASOURCE_DRAG_MIME, JSON.stringify(data))
    setEmptyDragImage(event.dataTransfer)
    session = { kind: 'datasource', data }
    attachGlobalListeners()
    updateDragPosition(event)
  }

  function updateDragPosition(event: DragEvent) {
    if (!session || !hasUsablePointer(event))
      return
    const resolved = resolveIntent(event.clientX, event.clientY)
    renderIntent(resolved, event.clientX, event.clientY)
  }

  function endDrag() {
    releasePointerCapture()
    session = null
    pointerSession = null
    hideOverlay()
    cleanupEmptyDragImage()
    detachGlobalListeners()
    detachPointerListeners()
  }

  function resetActiveDragSession() {
    releasePointerCapture()
    session = null
    pointerSession = null
    hideOverlay()
    cleanupEmptyDragImage()
    detachGlobalListeners()
    detachPointerListeners()
  }

  function onCanvasDragOver(event: DragEvent) {
    if (!isSupportedDrag(event))
      return
    event.preventDefault()
    ensureSessionFromDataTransfer(event)
    if (!session)
      return

    const resolved = resolveIntent(event.clientX, event.clientY)
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = resolveDropEffect(resolved)
    renderIntent(resolved, event.clientX, event.clientY)
  }

  function onCanvasDragLeave(event: DragEvent) {
    const pageEl = ctx.getPageEl()
    if (pageEl && event.relatedTarget && pageEl.contains(event.relatedTarget as Node))
      return
    if (!session)
      hideOverlay()
  }

  function onCanvasDrop(event: DragEvent) {
    if (!isSupportedDrag(event))
      return
    event.preventDefault()
    ensureSessionFromDataTransfer(event)
    if (!session) {
      endDrag()
      return
    }

    const resolved = resolveIntent(event.clientX, event.clientY)
    commitIntent(resolved)
    endDrag()
  }

  function cleanup() {
    endDrag()
    suppressNextClick = false
    clearClickSuppressionTimerIfNeeded()
    if (overlayEl?.parentElement)
      overlayEl.parentElement.removeChild(overlayEl)
    overlayEl = null
  }

  function ensureSessionFromDataTransfer(event: DragEvent) {
    if (session)
      return
    const transfer = event.dataTransfer
    if (!transfer)
      return
    if (transfer.types.includes(MATERIAL_DRAG_MIME)) {
      const dragData = transfer.getData(MATERIAL_DRAG_MIME)
      if (!dragData)
        return
      const entry = resolveCatalogEntry(dragData)
      if (entry)
        session = { kind: 'material', entry, dragData, node: createMaterialNodeDraft(entry) }
      return
    }
    if (transfer.types.includes(DATASOURCE_DRAG_MIME)) {
      const data = parseDatasourceDragData(transfer.getData(DATASOURCE_DRAG_MIME))
      if (data)
        session = { kind: 'datasource', data }
    }
  }

  function resolveIntent(clientX: number, clientY: number): DragIntent {
    const activeSession = session
    if (!activeSession)
      return { kind: 'cancel', reason: 'no-session' }

    if (activeSession.kind === 'material')
      return resolveMaterialIntent(activeSession.node, clientX, clientY)

    const panelIntent = resolveDatasourcePanelIntent(activeSession.data, clientX, clientY)
    if (panelIntent)
      return panelIntent

    const target = resolveDatasourceDropTarget(clientX, clientY)
    const bindIntent = resolveDatasourceBindIntent(activeSession.data, target)
    if (bindIntent)
      return bindIntent
    return resolveDatasourceFloatingIntent(activeSession.data, clientX, clientY)
  }

  function resolveDatasourcePanelIntent(data: DatasourceFieldDragData, clientX: number, clientY: number): DragIntent | null {
    for (const target of Array.from(datasourcePanelTargets.values()).reverse()) {
      const el = target.element()
      if (!el)
        continue
      const rect = el.getBoundingClientRect()
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom)
        continue
      const result = target.onDragOver(data)
      return {
        kind: 'bind-panel',
        target,
        rect,
        label: result.label,
        accepted: result.status === 'accepted',
      }
    }
    return null
  }

  function resolveMaterialIntent(node: MaterialNode | null, clientX: number, clientY: number): DragIntent {
    if (!node)
      return { kind: 'cancel', reason: 'unknown-material' }

    const target = resolveMaterialDropTarget(clientX, clientY, node.width, node.height)
    node.x = target.rect.x
    node.y = target.rect.y
    return {
      kind: 'create-material',
      nodes: [node],
      previewRects: [target.previewRect],
      accepted: target.status !== 'outside',
    }
  }

  function resolveDatasourceBindIntent(data: DatasourceFieldDragData, target: DropTarget): DragIntent | null {
    if (target.status !== 'inside')
      return null
    const hit = hitTestElement(target.docPoint.x, target.docPoint.y)
    if (!hit)
      return null

    const ext = ctx.store.peekDesignerFacet(hit.type)?.value?.extension
    const elementSize = ctx.store.getElementSize(hit)
    const localPoint = geometry.documentToLocal(target.docPoint, hit)
    if (ext?.datasourceDrop) {
      const zone = ext.datasourceDrop.onDragOver(toFieldInfo(data), localPoint, hit)
      if (!zone)
        return null
      return {
        kind: 'bind-element',
        target: hit,
        zone,
        docPoint: target.docPoint,
        accepted: zone.status === 'accepted',
      }
    }

    return {
      kind: 'bind-element',
      target: hit,
      zone: { status: 'accepted', rect: { x: 0, y: 0, w: elementSize.width, h: elementSize.height }, label: data.fieldLabel },
      docPoint: target.docPoint,
      accepted: true,
    }
  }

  function resolveDatasourceFloatingIntent(data: DatasourceFieldDragData, clientX: number, clientY: number): DragIntent {
    return {
      kind: 'floating-preview',
      rect: {
        left: clientX - DATASOURCE_FLOATING_PREVIEW.width / 2,
        top: clientY - DATASOURCE_FLOATING_PREVIEW.height / 2,
        width: DATASOURCE_FLOATING_PREVIEW.width,
        height: DATASOURCE_FLOATING_PREVIEW.height,
      },
      label: data.fieldLabel || data.fieldPath,
    }
  }

  function commitIntent(resolved: DragIntent) {
    if (resolved.kind === 'cancel')
      return
    if (resolved.kind === 'floating-preview')
      return
    if (!resolved.accepted)
      return

    if (resolved.kind === 'bind-panel') {
      const fieldData = session?.kind === 'datasource' ? session.data : null
      if (fieldData)
        resolved.target.onDrop(fieldData)
      return
    }

    if (resolved.kind === 'create-material') {
      const command = new AddMaterialCommand(ctx.store.schema.elements, resolved.nodes[0]!)
      ctx.store.commands.execute(command)
      selectMany(ctx.store, resolved.nodes.map(node => node.id))
      return
    }

    const ext = ctx.store.peekDesignerFacet(resolved.target.type)?.value?.extension
    const fieldData = session?.kind === 'datasource' ? session.data : null
    if (!fieldData)
      return
    const localPoint = geometry.documentToLocal(resolved.docPoint, resolved.target)
    if (ext?.datasourceDrop) {
      ext.datasourceDrop.onDrop(toFieldInfo(fieldData), localPoint, resolved.target)
      selectOne(ctx.store, resolved.target.id)
      return
    }

    const cmd = new BindFieldCommand(ctx.store.schema.elements, resolved.target.id, createBinding(fieldData))
    ctx.store.commands.execute(cmd)
    selectOne(ctx.store, resolved.target.id)
  }
  function resolveDatasourceDropTarget(clientX: number, clientY: number): DropTarget {
    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return { status: 'outside', docPoint: { x: 0, y: 0 } }

    const surfacePoint = screenToSurfacePoint(clientX, clientY, pageEl)
    const plan = createEditorSurfacePlan(ctx.store.schema)
    const projected = projectEditorSurfacePointToDocument(plan, surfacePoint)
    const docPoint = {
      x: projected.x,
      y: projected.y,
    }
    return { status: 'inside', docPoint }
  }

  function resolveMaterialDropTarget(clientX: number, clientY: number, width: number, height: number): MaterialDropTarget {
    const pageEl = ctx.getPageEl()
    if (!pageEl) {
      const rect = { x: clientX - width / 2, y: clientY - height / 2, width, height }
      return {
        status: 'outside',
        rect,
        previewRect: rect,
      }
    }

    const surfacePoint = screenToSurfacePoint(clientX, clientY, pageEl)
    const surfaceRect: Rect = {
      x: surfacePoint.x - width / 2,
      y: surfacePoint.y - height / 2,
      width,
      height,
    }
    const plan = createEditorSurfacePlan(ctx.store.schema)
    const unitManager = new UnitManager(ctx.store.schema.unit)
    const minPreviewSize = unitManager.fromPixels(MATERIAL_PREVIEW_MIN_SIZE_PX, 96, ctx.store.workbench.viewport.zoom)
    const previewSurfaceRect = expandRectToMinSize(surfaceRect, minPreviewSize, minPreviewSize)
    return {
      status: 'inside',
      rect: surfaceRectToDocumentRect(plan, surfaceRect),
      previewRect: surfaceRectToDocumentRect(plan, previewSurfaceRect),
    }
  }

  function surfaceRectToDocumentRect(
    plan: ReturnType<typeof createEditorSurfacePlan>,
    surfaceRect: Rect,
  ): Rect {
    const topLeft = projectEditorSurfacePointToDocument(plan, { x: surfaceRect.x, y: surfaceRect.y })
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: surfaceRect.width,
      height: surfaceRect.height,
    }
  }

  function expandRectToMinSize(rect: Rect, minWidth: number, minHeight: number): Rect {
    const width = Math.max(rect.width, minWidth)
    const height = Math.max(rect.height, minHeight)
    return {
      x: rect.x - (width - rect.width) / 2,
      y: rect.y - (height - rect.height) / 2,
      width,
      height,
    }
  }

  function screenToSurfacePoint(clientX: number, clientY: number, pageEl: HTMLElement) {
    const rect = pageEl.getBoundingClientRect()
    const { zoom } = ctx.store.workbench.viewport
    const unitManager = new UnitManager(ctx.store.schema.unit)
    return {
      x: unitManager.fromPixels(clientX - rect.left, 96, zoom),
      y: unitManager.fromPixels(clientY - rect.top, 96, zoom),
    }
  }

  function hitTestElement(docX: number, docY: number) {
    const elements = ctx.store.getElements()
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i]!
      if (element.editorState?.hidden || element.editorState?.locked)
        continue
      const elementSize = ctx.store.getElementSize(element)
      const localPoint = geometry.documentToLocal({ x: docX, y: docY }, element)
      if (pointInRect(localPoint, { x: 0, y: 0, width: elementSize.width, height: elementSize.height })) {
        const material = ctx.store.getMaterialManifest(element.type)
        if (material?.common.binding.kind === false)
          continue
        return element
      }
    }
    return undefined
  }

  function renderIntent(resolved: DragIntent, clientX: number, clientY: number) {
    if (resolved.kind === 'cancel') {
      hideOverlay()
      return
    }

    if (resolved.kind === 'floating-preview') {
      renderFloatingPreview(resolved)
      return
    }

    if (resolved.kind === 'bind-panel') {
      renderPanelDropTarget(resolved)
      return
    }

    if (resolved.kind === 'bind-element') {
      renderZone({
        target: resolved.target,
        elementSize: ctx.store.getElementSize(resolved.target),
        zone: resolved.zone,
        accepted: resolved.accepted,
      })
      return
    }

    const rects = resolved.nodes.map((node, index) => ({
      key: node.id,
      rect: resolved.previewRects[index] ?? { x: node.x, y: node.y, width: node.width, height: node.height },
      accepted: resolved.accepted,
      primary: index === 0,
    }))
    renderRects(rects, clientX, clientY)
  }

  function renderRects(rects: PreviewRect[], clientX: number, clientY: number) {
    const overlay = ensureOverlay()
    overlay.innerHTML = ''
    for (const item of rects) {
      const child = document.createElement('div')
      child.className = 'ei-designer-drag-preview__rect'
      const screenRect = item.accepted
        ? documentRectToScreen(item.rect)
        : {
            left: clientX - rectToScreenSize(item.rect.width) / 2,
            top: clientY - rectToScreenSize(item.rect.height) / 2,
            width: rectToScreenSize(item.rect.width),
            height: rectToScreenSize(item.rect.height),
          }
      child.style.cssText = previewRectStyle(screenRect, item.accepted, item.primary)
      overlay.appendChild(child)
    }
    overlay.style.display = 'block'
  }

  function renderZone(preview: PreviewZone) {
    const overlay = ensureOverlay()
    overlay.innerHTML = ''
    const elementStart = geometry.documentToScreen({ x: preview.target.x, y: preview.target.y })
    const elementEnd = geometry.documentToScreen({
      x: preview.target.x + preview.elementSize.width,
      y: preview.target.y + preview.elementSize.height,
    })
    const zoneStart = geometry.documentToScreen({
      x: preview.target.x + preview.zone.rect.x,
      y: preview.target.y + preview.zone.rect.y,
    })
    const zoneEnd = geometry.documentToScreen({
      x: preview.target.x + preview.zone.rect.x + preview.zone.rect.w,
      y: preview.target.y + preview.zone.rect.y + preview.zone.rect.h,
    })

    const group = document.createElement('div')
    group.className = 'ei-designer-drag-preview__zone'
    group.style.cssText = [
      'position:fixed',
      `left:${elementStart.x}px`,
      `top:${elementStart.y}px`,
      `width:${elementEnd.x - elementStart.x}px`,
      `height:${elementEnd.y - elementStart.y}px`,
      'transform-origin:center center',
      preview.target.rotation ? `transform:rotate(${preview.target.rotation}deg)` : '',
    ].filter(Boolean).join(';')

    const rect = document.createElement('div')
    rect.className = 'ei-designer-drag-preview__zone-rect'
    rect.style.cssText = [
      'position:absolute',
      'box-sizing:border-box',
      `left:${zoneStart.x - elementStart.x}px`,
      `top:${zoneStart.y - elementStart.y}px`,
      `width:${zoneEnd.x - zoneStart.x}px`,
      `height:${zoneEnd.y - zoneStart.y}px`,
      `border:2px solid ${preview.accepted ? 'var(--ei-success-color, #52c41a)' : 'var(--ei-error-color, #ff4d4f)'}`,
      `background:${preview.accepted ? 'rgba(82, 196, 26, 0.08)' : 'rgba(255, 77, 79, 0.08)'}`,
    ].join(';')

    if (preview.zone.label) {
      const label = document.createElement('span')
      label.textContent = preview.zone.label
      label.style.cssText = [
        'position:absolute',
        'bottom:100%',
        'left:0',
        'margin-bottom:2px',
        'padding:2px 6px',
        'border-radius:3px',
        'font-size:11px',
        'line-height:1.4',
        'white-space:nowrap',
        'color:#fff',
        `background:${preview.accepted ? 'var(--ei-success-color, #52c41a)' : 'var(--ei-error-color, #ff4d4f)'}`,
      ].join(';')
      rect.appendChild(label)
    }

    group.appendChild(rect)
    overlay.appendChild(group)
    overlay.style.display = 'block'
  }

  function renderFloatingPreview(preview: Extract<DragIntent, { kind: 'floating-preview' }>) {
    const overlay = ensureOverlay()
    overlay.innerHTML = ''
    const rect = document.createElement('div')
    rect.className = 'ei-designer-drag-preview__floating'
    rect.style.cssText = [
      'position:fixed',
      'box-sizing:border-box',
      `left:${preview.rect.left}px`,
      `top:${preview.rect.top}px`,
      `width:${preview.rect.width}px`,
      `height:${preview.rect.height}px`,
      'display:flex',
      'align-items:center',
      'padding:0 10px',
      'border:1px dashed var(--ei-primary, #1890ff)',
      'border-radius:3px',
      'background:rgba(24, 144, 255, 0.06)',
      'color:var(--ei-primary, #1890ff)',
      'font-size:12px',
      'line-height:1',
      'overflow:hidden',
      'white-space:nowrap',
      'text-overflow:ellipsis',
    ].join(';')
    rect.textContent = preview.label ?? ''
    overlay.appendChild(rect)
    overlay.style.display = 'block'
  }

  function renderPanelDropTarget(preview: Extract<DragIntent, { kind: 'bind-panel' }>) {
    const overlay = ensureOverlay()
    overlay.innerHTML = ''
    const rect = document.createElement('div')
    rect.className = 'ei-designer-drag-preview__panel'
    rect.style.cssText = [
      'position:fixed',
      'box-sizing:border-box',
      `left:${preview.rect.left}px`,
      `top:${preview.rect.top}px`,
      `width:${preview.rect.width}px`,
      `height:${preview.rect.height}px`,
      `border:2px solid ${preview.accepted ? 'var(--ei-success-color, #52c41a)' : 'var(--ei-error-color, #ff4d4f)'}`,
      `background:${preview.accepted ? 'rgba(82, 196, 26, 0.08)' : 'rgba(255, 77, 79, 0.08)'}`,
      'border-radius:6px',
    ].join(';')

    if (preview.label) {
      const label = document.createElement('span')
      label.textContent = preview.label
      label.style.cssText = [
        'position:absolute',
        'bottom:100%',
        'left:0',
        'margin-bottom:3px',
        'padding:2px 6px',
        'border-radius:3px',
        'font-size:11px',
        'line-height:1.4',
        'white-space:nowrap',
        'color:#fff',
        `background:${preview.accepted ? 'var(--ei-success-color, #52c41a)' : 'var(--ei-error-color, #ff4d4f)'}`,
      ].join(';')
      rect.appendChild(label)
    }

    overlay.appendChild(rect)
    overlay.style.display = 'block'
  }

  function ensureOverlay(): HTMLElement {
    if (!overlayEl) {
      overlayEl = document.createElement('div')
      overlayEl.className = 'ei-designer-drag-preview'
      overlayEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10000;display:none;'
      document.body.appendChild(overlayEl)
    }
    return overlayEl
  }

  function hideOverlay() {
    if (overlayEl) {
      overlayEl.style.display = 'none'
      overlayEl.innerHTML = ''
    }
  }

  function documentRectToScreen(rect: Rect) {
    const start = geometry.documentToScreen({ x: rect.x, y: rect.y })
    const end = geometry.documentToScreen({ x: rect.x + rect.width, y: rect.y + rect.height })
    return {
      left: start.x,
      top: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
    }
  }

  function rectToScreenSize(value: number) {
    const unitManager = new UnitManager(ctx.store.schema.unit)
    const px = unitManager.toPixels(value, 96, ctx.store.workbench.viewport.zoom)
    return Math.max(px, 1)
  }

  function previewRectStyle(
    rect: { left: number, top: number, width: number, height: number },
    accepted: boolean,
    primary?: boolean,
  ) {
    return [
      'position:fixed',
      'box-sizing:border-box',
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${Math.max(rect.width, 1)}px`,
      `height:${Math.max(rect.height, 1)}px`,
      `border:${primary === false ? 1 : 2}px dashed ${accepted ? 'var(--ei-primary, #1890ff)' : 'var(--ei-error-color, #ff4d4f)'}`,
      `background:${accepted ? 'rgba(24, 144, 255, 0.06)' : 'rgba(255, 77, 79, 0.05)'}`,
      `opacity:${primary === false ? 0.72 : 1}`,
      'border-radius:2px',
    ].join(';')
  }

  function setEmptyDragImage(dataTransfer: DataTransfer) {
    cleanupEmptyDragImage()
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;left:-1000px;top:-1000px;width:1px;height:1px;opacity:0;'
    document.body.appendChild(el)
    dataTransfer.setDragImage(el, 0, 0)
    emptyDragImageEl = el
  }

  function cleanupEmptyDragImage() {
    if (emptyDragImageEl?.parentElement)
      emptyDragImageEl.parentElement.removeChild(emptyDragImageEl)
    emptyDragImageEl = null
  }

  function resolveCatalogEntry(dragData: string): MaterialCatalogEntry | undefined {
    const manifest = ctx.store.listEditableMaterialManifests().find(entry => entry.type === dragData)
    return manifest && { id: manifest.type, groupId: manifest.common.category, label: manifest.common.nameKey, icon: IconRect, materialType: manifest.type }
  }

  function createMaterialNodeDraft(entry: MaterialCatalogEntry): MaterialNode | null {
    return ctx.store.materialProfile.createNode(entry.materialType, {}, ctx.store.schema.unit)
  }

  function createBinding(data: DatasourceFieldDragData): BindingRef {
    return {
      sourceId: data.sourceId,
      sourceName: data.sourceName,
      sourceTag: data.sourceTag,
      fieldPath: data.fieldPath,
      fieldKey: data.fieldKey,
      fieldLabel: data.fieldLabel,
      format: data.format ? deepClone(data.format) : undefined,
      bindIndex: data.bindIndex,
    }
  }

  function toFieldInfo(data: DatasourceFieldDragData): DatasourceFieldInfo {
    return {
      sourceId: data.sourceId,
      sourceName: data.sourceName,
      sourceTag: data.sourceTag,
      fieldPath: data.fieldPath,
      fieldKey: data.fieldKey,
      fieldTag: data.fieldTag,
      fieldLabel: data.fieldLabel,
      format: data.format,
      use: data.use,
    }
  }

  function parseDatasourceDragData(raw: string): DatasourceFieldDragData | null {
    if (!raw)
      return null
    try {
      return JSON.parse(raw)
    }
    catch {
      return null
    }
  }

  function isSupportedDrag(event: DragEvent) {
    const types = event.dataTransfer?.types
    return !!types && (types.includes(MATERIAL_DRAG_MIME) || types.includes(DATASOURCE_DRAG_MIME) || !!session)
  }

  function resolveDropEffect(resolved: DragIntent): DataTransfer['dropEffect'] {
    if (resolved.kind === 'cancel' || resolved.kind === 'floating-preview' || !resolved.accepted)
      return 'none'
    return resolved.kind === 'bind-element' ? 'link' : 'copy'
  }

  function hasUsablePointer(event: DragEvent) {
    return event.clientX !== 0 || event.clientY !== 0
  }

  function attachGlobalListeners() {
    if (globalListenersAttached)
      return
    window.addEventListener('dragover', handleGlobalDragOver, true)
    window.addEventListener('drop', handleGlobalDrop, true)
    window.addEventListener('dragend', handleGlobalDragEnd, true)
    globalListenersAttached = true
  }

  function detachGlobalListeners() {
    if (!globalListenersAttached)
      return
    window.removeEventListener('dragover', handleGlobalDragOver, true)
    window.removeEventListener('drop', handleGlobalDrop, true)
    window.removeEventListener('dragend', handleGlobalDragEnd, true)
    globalListenersAttached = false
  }

  function handleGlobalDragOver(event: DragEvent) {
    if (!session || !hasUsablePointer(event) || isEventInsidePage(event))
      return
    const resolved = resolveIntent(event.clientX, event.clientY)
    renderIntent(resolved, event.clientX, event.clientY)
  }

  function handleGlobalDrop(event: DragEvent) {
    if (!session || isEventInsidePage(event))
      return
    if (hasUsablePointer(event)) {
      const resolved = resolveIntent(event.clientX, event.clientY)
      commitIntent(resolved)
    }
    endDrag()
  }

  function handleGlobalDragEnd() {
    endDrag()
  }

  function isEventInsidePage(event: DragEvent) {
    const pageEl = ctx.getPageEl()
    const target = event.target
    return !!pageEl && target instanceof Node && pageEl.contains(target)
  }

  function attachPointerListeners() {
    if (pointerListenersAttached)
      return
    window.addEventListener('pointermove', handlePointerMove, true)
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerCancel, true)
    window.addEventListener('blur', handleWindowBlur, true)
    pointerListenersAttached = true
  }

  function detachPointerListeners() {
    if (!pointerListenersAttached)
      return
    window.removeEventListener('pointermove', handlePointerMove, true)
    window.removeEventListener('pointerup', handlePointerUp, true)
    window.removeEventListener('pointercancel', handlePointerCancel, true)
    window.removeEventListener('blur', handleWindowBlur, true)
    pointerListenersAttached = false
  }

  function handlePointerMove(event: PointerEvent) {
    const current = pointerSession
    if (!current || event.pointerId !== current.pointerId)
      return

    const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
    if (!current.active && moved < POINTER_DRAG_THRESHOLD_PX)
      return

    current.active = true
    scheduleClickSuppression()
    session = pointerSessionToDragSession(current)
    const resolved = resolveIntent(event.clientX, event.clientY)
    renderIntent(resolved, event.clientX, event.clientY)
    event.preventDefault()
  }

  function handlePointerUp(event: PointerEvent) {
    const current = pointerSession
    if (!current || event.pointerId !== current.pointerId)
      return

    const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
    if (current.active || moved >= POINTER_DRAG_THRESHOLD_PX) {
      session = pointerSessionToDragSession(current)
      const resolved = resolveIntent(event.clientX, event.clientY)
      commitIntent(resolved)
      scheduleClickSuppression()
      event.preventDefault()
    }
    endDrag()
  }

  function handlePointerCancel() {
    endDrag()
  }

  function handleWindowBlur() {
    endDrag()
  }

  function capturePointer(event: PointerEvent): Element | null {
    const target = event.currentTarget
    if (!(target instanceof Element) || typeof target.setPointerCapture !== 'function')
      return null
    try {
      target.setPointerCapture(event.pointerId)
      return target
    }
    catch {
      return null
    }
  }

  function releasePointerCapture() {
    const current = pointerSession
    if (!current?.captureTarget || typeof current.captureTarget.releasePointerCapture !== 'function')
      return
    try {
      current.captureTarget.releasePointerCapture(current.pointerId)
    }
    catch {
      // Pointer capture can already be gone after pointerup/cancel.
    }
  }

  function pointerSessionToDragSession(current: PointerSession): DragSession {
    if (current.kind === 'material') {
      return {
        kind: 'material',
        entry: current.entry,
        dragData: current.entry.dragData ?? current.entry.materialType,
        node: current.node,
      }
    }
    return { kind: 'datasource', data: current.data }
  }

  function canStartPointerDrag(event: PointerEvent) {
    return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey
  }

  function scheduleClickSuppression() {
    suppressNextClick = true
    clearClickSuppressionTimerIfNeeded()
    clearClickSuppressionTimer = window.setTimeout(() => {
      suppressNextClick = false
      clearClickSuppressionTimer = null
    }, 0)
  }

  function clearClickSuppressionTimerIfNeeded() {
    if (clearClickSuppressionTimer == null)
      return
    window.clearTimeout(clearClickSuppressionTimer)
    clearClickSuppressionTimer = null
  }

  function registerDatasourceDropTarget(target: DatasourcePanelDropTarget): () => void {
    datasourcePanelTargets.set(target.id, target)
    return () => {
      if (datasourcePanelTargets.get(target.id) === target)
        datasourcePanelTargets.delete(target.id)
    }
  }

  return {
    startMaterialPointerDrag,
    startDatasourcePointerDrag,
    consumeClickSuppression,
    startMaterialDrag,
    startDatasourceDrag,
    updateDragPosition,
    endDrag,
    onCanvasDragOver,
    onCanvasDragLeave,
    onCanvasDrop,
    registerDatasourceDropTarget,
    cleanup,
  }
}
