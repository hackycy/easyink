import type { DatasourceDropZone, DatasourceFieldInfo } from '@easyink/core'
import type { BindingRef } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { DesignerStore } from '../store/designer-store'
import { BindFieldCommand, pointInRect } from '@easyink/core'
import { createGeometryService } from '../editing/geometry-service'
import { selectOne } from '../interactions/selection-api'

/**
 * MIME type used for datasource field drag data.
 */
export const DATASOURCE_DRAG_MIME = 'application/x-easyink-field'

export interface DatasourceFieldDragData {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldLabel?: string
  format?: BindingDisplayFormat
  use?: string
}

export interface DatasourceDropContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
}

/**
 * Creates drag-and-drop handlers for binding datasource fields to canvas elements.
 *
 * When a material provides a `datasourceDrop` handler on its extension,
 * the handler takes over dragOver detection and drop binding.
 * Otherwise, the default behavior is used (whole element as drop zone + BindFieldCommand).
 */
export function useDatasourceDrop(ctx: DatasourceDropContext) {
  const geometry = createGeometryService(ctx.store, { getPageEl: ctx.getPageEl })

  // ─── Drop Zone Overlay DOM ──────────────────────────────────────

  let overlayEl: HTMLElement | null = null
  let overlayRectEl: HTMLElement | null = null
  let overlayLabelEl: HTMLElement | null = null

  function ensureOverlay(): HTMLElement {
    if (!overlayEl) {
      overlayEl = document.createElement('div')
      overlayEl.className = 'ei-drop-zone-overlay'
      overlayEl.style.cssText = 'position:absolute;pointer-events:none;z-index:9999;display:none;transform-origin:center center;box-sizing:border-box;'
      overlayRectEl = document.createElement('div')
      overlayRectEl.className = 'ei-drop-zone-overlay__rect'
      overlayRectEl.style.cssText = 'position:absolute;box-sizing:border-box;'
      overlayLabelEl = document.createElement('span')
      overlayLabelEl.className = 'ei-drop-zone-overlay__label'
      overlayLabelEl.style.cssText = 'position:absolute;bottom:100%;left:0;padding:2px 6px;font-size:11px;white-space:nowrap;border-radius:3px;margin-bottom:2px;'
      overlayRectEl.appendChild(overlayLabelEl)
      overlayEl.appendChild(overlayRectEl)
    }
    return overlayEl
  }

  function showDropZone(
    zone: DatasourceDropZone,
    target: ReturnType<DesignerStore['getElements']>[number],
    elementSize: { width: number, height: number },
  ) {
    const el = ensureOverlay()
    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return

    if (!el.parentElement) {
      pageEl.appendChild(el)
    }

    const pageRect = pageEl.getBoundingClientRect()
    const elementScreen = geometry.documentToScreen({ x: target.x, y: target.y })
    const elementScreenEnd = geometry.documentToScreen({ x: target.x + elementSize.width, y: target.y + elementSize.height })
    const zoneScreen = geometry.documentToScreen({ x: target.x + zone.rect.x, y: target.y + zone.rect.y })
    const zoneScreenEnd = geometry.documentToScreen({ x: target.x + zone.rect.x + zone.rect.w, y: target.y + zone.rect.y + zone.rect.h })
    const elementLeft = elementScreen.x - pageRect.left
    const elementTop = elementScreen.y - pageRect.top
    const elementWidth = elementScreenEnd.x - elementScreen.x
    const elementHeight = elementScreenEnd.y - elementScreen.y
    const zoneLeft = zoneScreen.x - elementScreen.x
    const zoneTop = zoneScreen.y - elementScreen.y
    const zoneWidth = zoneScreenEnd.x - zoneScreen.x
    const zoneHeight = zoneScreenEnd.y - zoneScreen.y

    el.style.left = `${elementLeft}px`
    el.style.top = `${elementTop}px`
    el.style.width = `${elementWidth}px`
    el.style.height = `${elementHeight}px`
    el.style.display = 'block'
    el.style.transform = target.rotation ? `rotate(${target.rotation}deg)` : ''

    if (overlayRectEl) {
      overlayRectEl.style.left = `${zoneLeft}px`
      overlayRectEl.style.top = `${zoneTop}px`
      overlayRectEl.style.width = `${zoneWidth}px`
      overlayRectEl.style.height = `${zoneHeight}px`
    }

    if (zone.status === 'accepted') {
      if (overlayRectEl) {
        overlayRectEl.style.border = '2px solid var(--ei-success-color, #52c41a)'
        overlayRectEl.style.background = 'rgba(82, 196, 26, 0.08)'
      }
    }
    else {
      if (overlayRectEl) {
        overlayRectEl.style.border = '2px solid var(--ei-error-color, #ff4d4f)'
        overlayRectEl.style.background = 'rgba(255, 77, 79, 0.08)'
      }
    }

    if (overlayLabelEl) {
      if (zone.label) {
        overlayLabelEl.textContent = zone.label
        overlayLabelEl.style.display = 'block'
        overlayLabelEl.style.background = zone.status === 'accepted'
          ? 'var(--ei-success-color, #52c41a)'
          : 'var(--ei-error-color, #ff4d4f)'
        overlayLabelEl.style.color = '#fff'
      }
      else {
        overlayLabelEl.style.display = 'none'
      }
    }
  }

  function hideDropZone() {
    if (overlayEl) {
      overlayEl.style.display = 'none'
    }
  }

  function cleanupOverlay() {
    if (overlayEl?.parentElement) {
      overlayEl.parentElement.removeChild(overlayEl)
    }
    overlayEl = null
    overlayLabelEl = null
  }

  function documentPointToElementLocal(
    point: { x: number, y: number },
    element: ReturnType<DesignerStore['getElements']>[number],
  ) {
    return geometry.documentToLocal(point, element)
  }

  // ─── Drag Event Handlers ────────────────────────────────────────

  function parseFieldData(e: DragEvent): DatasourceFieldDragData | null {
    const raw = e.dataTransfer?.getData(DATASOURCE_DRAG_MIME)
    if (!raw)
      return null
    try {
      return JSON.parse(raw)
    }
    catch {
      return null
    }
  }

  function toFieldInfo(data: DatasourceFieldDragData): DatasourceFieldInfo {
    return {
      sourceId: data.sourceId,
      sourceName: data.sourceName,
      sourceTag: data.sourceTag,
      fieldPath: data.fieldPath,
      fieldKey: data.fieldKey,
      fieldLabel: data.fieldLabel,
      format: data.format,
      use: data.use,
    }
  }

  function hitTestElement(docX: number, docY: number) {
    const { store } = ctx
    const elements = store.getElements()
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]!
      if (el.editorState?.hidden || el.editorState?.locked)
        continue
      const elementSize = store.getElementSize(el)
      const localPoint = documentPointToElementLocal({ x: docX, y: docY }, el)
      if (pointInRect(localPoint, { x: 0, y: 0, width: elementSize.width, height: elementSize.height })) {
        const mat = store.getMaterialManifest(el.type)
        if (mat && (mat.capabilities.bindable === false || mat.binding.kind === 'data-contract'))
          continue
        return el
      }
    }
    return undefined
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(DATASOURCE_DRAG_MIME))
      return
    e.preventDefault()
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = 'link'

    const { store } = ctx
    const pageEl = ctx.getPageEl()
    if (!pageEl) {
      hideDropZone()
      return
    }

    const point = geometry.screenToDocument({ x: e.clientX, y: e.clientY })
    const docX = point.x
    const docY = point.y

    const target = hitTestElement(docX, docY)
    if (!target) {
      hideDropZone()
      return
    }

    // Get extension for custom drop handler
    const ext = store.peekDesignerFacet(target.type)?.value?.extension
    const elementSize = store.getElementSize(target)
    const localPoint = documentPointToElementLocal({ x: docX, y: docY }, target)
    if (ext?.datasourceDrop) {
      // Try to parse field data for dragOver feedback
      // During dragOver, getData may return empty on some browsers,
      // so we use a minimal field info from types check
      // We can't read drag data during dragOver in some browsers,
      // so we use a placeholder field info for hit-test only
      const fieldInfo: DatasourceFieldInfo = {
        sourceId: '',
        fieldPath: '',
      }
      const zone = ext.datasourceDrop.onDragOver(fieldInfo, localPoint, target)
      if (zone) {
        showDropZone(zone, target, elementSize)
      }
      else {
        hideDropZone()
      }
    }
    else {
      // Default: highlight the whole element
      showDropZone(
        { status: 'accepted', rect: { x: 0, y: 0, w: elementSize.width, h: elementSize.height } },
        target,
        elementSize,
      )
    }
  }

  function onDragLeave(e: DragEvent) {
    // Only hide if we're leaving the page element entirely
    const pageEl = ctx.getPageEl()
    if (pageEl && e.relatedTarget && pageEl.contains(e.relatedTarget as Node))
      return
    hideDropZone()
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    hideDropZone()

    const fieldData = parseFieldData(e)
    if (!fieldData)
      return

    const { store } = ctx
    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return

    const point = geometry.screenToDocument({ x: e.clientX, y: e.clientY })
    const docX = point.x
    const docY = point.y

    const target = hitTestElement(docX, docY)
    if (!target)
      return

    // Check for custom handler
    const ext = store.peekDesignerFacet(target.type)?.value?.extension
    if (ext?.datasourceDrop) {
      const localPoint = documentPointToElementLocal({ x: docX, y: docY }, target)
      ext.datasourceDrop.onDrop(toFieldInfo(fieldData), localPoint, target)
      selectOne(store, target.id)
      return
    }

    // Default: scalar element binding
    const binding: BindingRef = {
      sourceId: fieldData.sourceId,
      sourceName: fieldData.sourceName,
      sourceTag: fieldData.sourceTag,
      fieldPath: fieldData.fieldPath,
      fieldKey: fieldData.fieldKey,
      fieldLabel: fieldData.fieldLabel,
      format: fieldData.format,
    }

    const cmd = new BindFieldCommand(store.schema.elements, target.id, binding)
    store.commands.execute(cmd)
    selectOne(store, target.id)
  }

  return { onDragOver, onDragLeave, onDrop, cleanupOverlay }
}
