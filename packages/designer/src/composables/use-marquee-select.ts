import type { Ref } from 'vue'
import type { DesignerStore } from '../store/designer-store'
import { getRotatedAABB, rectsIntersect, UnitManager } from '@easyink/core'

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
 * Minimum drag distance (document units) before marquee activates.
 *
 * Avoids "phantom marquees" from imprecise touch input or trackpad jitter on
 * a plain background click. Note: 1 doc-unit can be ~1px (px) or microscopic
 * (mm), so the threshold is intentionally biased toward starting too easily
 * rather than losing a real drag.
 */
const MARQUEE_ACTIVATION_DISTANCE = 1

/**
 * Pointerdown handler for marquee (rubber-band) selection on empty canvas
 * background.
 *
 * Conventions (kept aligned with `useElementDrag`):
 * - Pointer move/up/cancel are bound on `window` so the drag survives the
 *   pointer leaving the page element.
 * - `pointercancel` always clears the visual marquee — otherwise system
 *   gestures (3-finger swipe, Ctrl-Tab) leave a stale rectangle on screen.
 * - Hit testing uses the element's rotated AABB so that rotated elements have
 *   the same selection footprint that snap and the selection box already use.
 * - Hidden / locked elements are excluded.
 * - In additive mode (Ctrl/Meta), the original selection is preserved on
 *   pointerdown and re-merged with each frame's hits; the original selection
 *   is never cleared.
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
    const pointerId = e.pointerId
    const captureEl = e.currentTarget as HTMLElement

    try {
      captureEl.setPointerCapture(pointerId)
    }
    catch {
      // Capture may fail if the pointer was released between bubble phases;
      // fall back to window listeners which still receive the events.
    }

    let dragging = false
    let lastSerialized = ''

    function applyHits(rect: MarqueeRect) {
      const elements = store.getElements()
      const hitIds: string[] = []
      for (const node of elements) {
        if (node.hidden || node.locked)
          continue
        const visual = store.getVisualSize(node)
        const aabb = getRotatedAABB(
          { x: node.x, y: node.y, width: visual.width, height: visual.height },
          node.rotation,
        )
        if (rectsIntersect(rect, aabb))
          hitIds.push(node.id)
      }

      // Additive mode merges with the original selection; non-additive replaces.
      const finalIds = additive
        ? unique([...originalSelection, ...hitIds])
        : hitIds

      // Skip writes when the resulting selection is unchanged to avoid
      // re-firing every selection listener on every pointermove frame.
      const serialized = finalIds.join(',')
      if (serialized === lastSerialized)
        return
      lastSerialized = serialized

      if (finalIds.length === 0) {
        if (!store.selection.isEmpty)
          store.selection.clear()
      }
      else {
        store.selection.selectMultiple(finalIds)
      }
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId)
        return

      const docX = unitManager.screenToDocument(ev.clientX, canvasOffsetX, 0, zoom)
      const docY = unitManager.screenToDocument(ev.clientY, canvasOffsetY, 0, zoom)

      const dx = docX - startDocX
      const dy = docY - startDocY

      if (!dragging && Math.abs(dx) < MARQUEE_ACTIVATION_DISTANCE && Math.abs(dy) < MARQUEE_ACTIVATION_DISTANCE)
        return

      // First activation: this is the moment we know the user committed to a
      // marquee instead of a plain background click. Only now should we drop
      // the previous selection (when not additive), so that an accidental
      // single click on empty background still falls through to its own
      // dedicated handler without selection thrash.
      if (!dragging) {
        dragging = true
        if (!additive && !store.selection.isEmpty)
          store.selection.clear()
      }

      const rect: MarqueeRect = {
        x: Math.min(startDocX, docX),
        y: Math.min(startDocY, docY),
        width: Math.abs(dx),
        height: Math.abs(dy),
      }

      ctx.marqueeRef.value = rect
      applyHits(rect)
    }

    function teardown() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      try {
        captureEl.releasePointerCapture(pointerId)
      }
      catch {
        // Capture may already be released by the browser.
      }
      ctx.marqueeRef.value = null
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId)
        return
      // Plain click on the background (no drag activation, no modifier) is
      // the canonical "clear selection" gesture in every comparable designer.
      // Deferring this to pointerup (instead of clearing eagerly on
      // pointerdown) keeps additive marquees and click-without-move both safe.
      if (!dragging && !additive && !store.selection.isEmpty)
        store.selection.clear()
      teardown()
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId)
        return
      // Restore the original selection — a cancelled gesture should not leave
      // partial marquee hits committed.
      if (dragging) {
        if (additive)
          store.selection.selectMultiple(originalSelection)
        else if (originalSelection.length === 0 && !store.selection.isEmpty)
          store.selection.clear()
      }
      teardown()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  return { onCanvasPointerDown }
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}
