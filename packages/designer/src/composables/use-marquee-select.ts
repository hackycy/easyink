import type { Ref } from 'vue'
import type { DesignerStore } from '../store/designer-store'
import { rectsIntersect, UnitManager } from '@easyink/core'

export interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

export interface MarqueeSelectContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
  /** Reactive ref to expose the current marquee rectangle (in document units, relative to page) */
  marqueeRef: Ref<MarqueeRect | null>
}

/**
 * Creates a pointerdown handler for marquee (rubber-band) selection on empty canvas area.
 * Supports:
 * - Drag-to-select by intersection
 * - Ctrl/Meta additive selection
 * - Visual feedback via marqueeRef
 */
export function useMarqueeSelect(ctx: MarqueeSelectContext) {
  function onCanvasPointerDown(e: PointerEvent) {
    const { store } = ctx

    // Only start marquee on primary button, on the scroll/page background
    if (e.button !== 0)
      return

    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return

    const unitManager = new UnitManager(store.schema.unit)
    const zoom = store.workbench.viewport.zoom

    const pageRect = pageEl.getBoundingClientRect()
    const canvasOffsetX = pageRect.left
    const canvasOffsetY = pageRect.top

    const startDocX = unitManager.screenToDocument(e.clientX, canvasOffsetX, 0, zoom)
    const startDocY = unitManager.screenToDocument(e.clientY, canvasOffsetY, 0, zoom)

    const additive = e.ctrlKey || e.metaKey
    const originalSelection = additive ? [...store.selection.ids] : []

    if (!additive) {
      store.selection.clear()
    }

    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    let dragging = false

    function onMove(ev: PointerEvent) {
      const docX = unitManager.screenToDocument(ev.clientX, canvasOffsetX, 0, zoom)
      const docY = unitManager.screenToDocument(ev.clientY, canvasOffsetY, 0, zoom)

      const dx = docX - startDocX
      const dy = docY - startDocY

      // Require minimum movement to start marquee
      if (!dragging && Math.abs(dx) < 1 && Math.abs(dy) < 1)
        return

      dragging = true

      const rect: MarqueeRect = {
        x: Math.min(startDocX, docX),
        y: Math.min(startDocY, docY),
        width: Math.abs(dx),
        height: Math.abs(dy),
      }

      ctx.marqueeRef.value = rect

      // Determine which elements intersect the marquee
      const elements = store.getElements()
      const hitIds: string[] = []
      for (const el of elements) {
        if (el.hidden || el.locked)
          continue
        if (rectsIntersect(rect, { x: el.x, y: el.y, width: el.width, height: store.getVisualHeight(el) })) {
          hitIds.push(el.id)
        }
      }

      // Merge with original selection if additive
      const finalIds = additive
        ? [...new Set([...originalSelection, ...hitIds])]
        : hitIds

      if (finalIds.length > 0) {
        store.selection.selectMultiple(finalIds)
      }
      else {
        if (!additive) {
          store.selection.clear()
        }
        else {
          store.selection.selectMultiple(originalSelection)
        }
      }
    }

    function onUp() {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      ctx.marqueeRef.value = null
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  return { onCanvasPointerDown }
}
