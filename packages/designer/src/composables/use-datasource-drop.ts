import type { DatasourceDropZone, DatasourceFieldInfo } from '@easyink/core'
import type { BindingRef } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { BindFieldCommand, pointInRect, UnitManager } from '@easyink/core'

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
  // ─── Drop Zone Overlay DOM ──────────────────────────────────────

  let overlayEl: HTMLElement | null = null
  let overlayLabelEl: HTMLElement | null = null

  function ensureOverlay(): HTMLElement {
    if (!overlayEl) {
      overlayEl = document.createElement('div')
      overlayEl.className = 'ei-drop-zone-overlay'
      overlayEl.style.cssText = 'position:absolute;pointer-events:none;z-index:9999;display:none;'
      overlayLabelEl = document.createElement('span')
      overlayLabelEl.className = 'ei-drop-zone-overlay__label'
      overlayLabelEl.style.cssText = 'position:absolute;bottom:100%;left:0;padding:2px 6px;font-size:11px;white-space:nowrap;border-radius:3px;margin-bottom:2px;'
      overlayEl.appendChild(overlayLabelEl)
    }
    return overlayEl
  }

  function showDropZone(
    zone: DatasourceDropZone,
    elementRect: DOMRect,
    zoom: number,
    unitManager: UnitManager,
  ) {
    const el = ensureOverlay()
    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return

    if (!el.parentElement) {
      pageEl.appendChild(el)
    }

    // Convert zone rect from document units to screen pixels relative to the page element
    const left = unitManager.documentToScreen(zone.rect.x, 0, 0, zoom)
    const top = unitManager.documentToScreen(zone.rect.y, 0, 0, zoom)
    const width = unitManager.documentToScreen(zone.rect.w, 0, 0, zoom)
    const height = unitManager.documentToScreen(zone.rect.h, 0, 0, zoom)

    // Position relative to the element within the page
    const pageRect = pageEl.getBoundingClientRect()
    const elOffsetLeft = elementRect.left - pageRect.left
    const elOffsetTop = elementRect.top - pageRect.top

    el.style.left = `${elOffsetLeft + left}px`
    el.style.top = `${elOffsetTop + top}px`
    el.style.width = `${width}px`
    el.style.height = `${height}px`
    el.style.display = 'block'

    if (zone.status === 'accepted') {
      el.style.border = '2px solid var(--ei-success-color, #52c41a)'
      el.style.background = 'rgba(82, 196, 26, 0.08)'
    }
    else {
      el.style.border = '2px solid var(--ei-error-color, #ff4d4f)'
      el.style.background = 'rgba(255, 77, 79, 0.08)'
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
      use: data.use,
    }
  }

  function hitTestElement(docX: number, docY: number) {
    const { store } = ctx
    const elements = store.getElements()
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]!
      if (el.hidden || el.locked)
        continue
      // Use visual height (accounts for virtual rows in table-data)
      const visualHeight = store.getVisualHeight(el)
      if (pointInRect({ x: docX, y: docY }, { x: el.x, y: el.y, width: el.width, height: visualHeight })) {
        const mat = store.getMaterial(el.type)
        if (mat && mat.capabilities.bindable === false)
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

    const unitManager = new UnitManager(store.schema.unit)
    const zoom = store.workbench.viewport.zoom
    const pageRect = pageEl.getBoundingClientRect()
    const docX = unitManager.screenToDocument(e.clientX, pageRect.left, 0, zoom)
    const docY = unitManager.screenToDocument(e.clientY, pageRect.top, 0, zoom)

    const target = hitTestElement(docX, docY)
    if (!target) {
      hideDropZone()
      return
    }

    // Get extension for custom drop handler
    const ext = store.getDesignerExtension(target.type)
    const visualHeight = store.getVisualHeight(target)
    if (ext?.datasourceDrop) {
      // Try to parse field data for dragOver feedback
      // During dragOver, getData may return empty on some browsers,
      // so we use a minimal field info from types check
      const localX = docX - target.x
      const localY = docY - target.y
      // We can't read drag data during dragOver in some browsers,
      // so we use a placeholder field info for hit-test only
      const fieldInfo: DatasourceFieldInfo = {
        sourceId: '',
        fieldPath: '',
      }
      const zone = ext.datasourceDrop.onDragOver(fieldInfo, { x: localX, y: localY }, target)
      if (zone) {
        // Calculate element rect in screen space (using visual height for placeholder rows)
        const elScreenLeft = pageRect.left + unitManager.documentToScreen(target.x, 0, 0, zoom)
        const elScreenTop = pageRect.top + unitManager.documentToScreen(target.y, 0, 0, zoom)
        const elScreenWidth = unitManager.documentToScreen(target.width, 0, 0, zoom)
        const elScreenHeight = unitManager.documentToScreen(visualHeight, 0, 0, zoom)
        const elementRect = new DOMRect(elScreenLeft, elScreenTop, elScreenWidth, elScreenHeight)
        showDropZone(zone, elementRect, zoom, unitManager)
      }
      else {
        hideDropZone()
      }
    }
    else {
      // Default: highlight the whole element
      const elScreenLeft = pageRect.left + unitManager.documentToScreen(target.x, 0, 0, zoom)
      const elScreenTop = pageRect.top + unitManager.documentToScreen(target.y, 0, 0, zoom)
      const elScreenWidth = unitManager.documentToScreen(target.width, 0, 0, zoom)
      const elScreenHeight = unitManager.documentToScreen(visualHeight, 0, 0, zoom)
      const elementRect = new DOMRect(elScreenLeft, elScreenTop, elScreenWidth, elScreenHeight)
      showDropZone(
        { status: 'accepted', rect: { x: 0, y: 0, w: target.width, h: visualHeight } },
        elementRect,
        zoom,
        unitManager,
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

    const unitManager = new UnitManager(store.schema.unit)
    const zoom = store.workbench.viewport.zoom
    const pageRect = pageEl.getBoundingClientRect()
    const docX = unitManager.screenToDocument(e.clientX, pageRect.left, 0, zoom)
    const docY = unitManager.screenToDocument(e.clientY, pageRect.top, 0, zoom)

    const target = hitTestElement(docX, docY)
    if (!target)
      return

    // Check for custom handler
    const ext = store.getDesignerExtension(target.type)
    if (ext?.datasourceDrop) {
      const localX = docX - target.x
      const localY = docY - target.y
      ext.datasourceDrop.onDrop(toFieldInfo(fieldData), { x: localX, y: localY }, target)
      store.selection.select(target.id)
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
    }

    const cmd = new BindFieldCommand(store.schema.elements, target.id, binding)
    store.commands.execute(cmd)
    store.selection.select(target.id)
  }

  return { onDragOver, onDragLeave, onDrop, cleanupOverlay }
}
