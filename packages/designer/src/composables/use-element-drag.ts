import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { MoveMaterialCommand, UnitManager } from '@easyink/core'
import { markRaw } from 'vue'
import { collectSnapCandidates, computeSnap, getSelectionBox } from '../snap'

export interface ElementDragContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
  getScrollEl: () => HTMLElement | null
}

/**
 * Element drag-to-move: single + multi selection.
 *
 * Snap behavior is delegated to the snap engine (`packages/designer/src/snap`),
 * which evaluates grid / guide / element candidates uniformly and picks the
 * closest within threshold.
 *
 * Conventions:
 * - Selection bounding box (visual height) drives both reference and overlay.
 * - Threshold is normalized for zoom: `snapState.threshold / max(zoom, ε)`.
 * - Hold Cmd / Ctrl during drag to bypass snapping for the current frame.
 * - Pointer events are bound on `window` so dragging continues across canvas
 *   boundaries; `pointercancel` rolls back geometry and skips command commit.
 */
export function useElementDrag(ctx: ElementDragContext) {
  function onPointerDown(e: PointerEvent, elementId: string) {
    const { store } = ctx
    const node = store.getElementById(elementId)
    if (!node || node.locked)
      return

    if (!store.selection.has(elementId)) {
      if (e.ctrlKey || e.metaKey)
        store.selection.add(elementId)
      else
        store.selection.select(elementId)
    }

    const selectedIds = store.selection.ids
    const selectedNodes = selectedIds
      .map(id => store.getElementById(id))
      .filter((n): n is MaterialNode => n != null && !n.locked)

    if (selectedNodes.length === 0)
      return

    const unitManager = new UnitManager(store.schema.unit)
    const zoom = store.workbench.viewport.zoom

    const pageEl = ctx.getPageEl()
    const scrollEl = ctx.getScrollEl()
    if (!pageEl || !scrollEl)
      return

    const pageRect = pageEl.getBoundingClientRect()
    const canvasOffsetX = pageRect.left
    const canvasOffsetY = pageRect.top

    const startDocX = unitManager.screenToDocument(e.clientX, canvasOffsetX, 0, zoom)
    const startDocY = unitManager.screenToDocument(e.clientY, canvasOffsetY, 0, zoom)

    const origPositions = selectedNodes.map(n => ({ id: n.id, x: n.x, y: n.y }))

    const selectionBox = getSelectionBox(selectedNodes, n => store.getVisualSize(n))
    if (!selectionBox)
      return

    const otherNodes = store.getElements().filter(
      el => !store.selection.has(el.id) && !el.hidden && !el.locked,
    )

    // Collect snap candidates ONCE at pointerdown — element set and their
    // geometry don't change during a drag, so re-collecting per pointermove
    // would burn O(n) allocation each frame on dense canvases. Toggles are
    // captured at drag start (changing them mid-drag is not a supported flow).
    const snapStateAtStart = store.workbench.snap
    const snapCandidates = collectSnapCandidates({
      page: store.schema.page,
      guidesX: store.schema.guides.x,
      guidesY: store.schema.guides.y,
      otherNodes,
      getVisualSize: n => store.getVisualSize(n),
      enabled: true,
      gridSnap: snapStateAtStart.gridSnap,
      guideSnap: snapStateAtStart.guideSnap,
      elementSnap: snapStateAtStart.elementSnap,
    })

    let moved = false
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(pointerId)

    function teardown() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      try {
        el.releasePointerCapture(pointerId)
      }
      catch {
        // capture may already be released by the browser
      }
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId)
        return

      const currentDocX = unitManager.screenToDocument(ev.clientX, canvasOffsetX, 0, zoom)
      const currentDocY = unitManager.screenToDocument(ev.clientY, canvasOffsetY, 0, zoom)

      let dx = currentDocX - startDocX
      let dy = currentDocY - startDocY

      if (dx === 0 && dy === 0)
        return

      moved = true

      const snapState = store.workbench.snap
      const bypassSnap = ev.metaKey || ev.ctrlKey

      const snapResult = (!bypassSnap && snapState.enabled)
        ? computeSnap(
            {
              page: store.schema.page,
              guidesX: store.schema.guides.x,
              guidesY: store.schema.guides.y,
              otherNodes,
              getVisualSize: n => store.getVisualSize(n),
              enabled: snapState.enabled,
              gridSnap: snapState.gridSnap,
              guideSnap: snapState.guideSnap,
              elementSnap: snapState.elementSnap,
            },
            {
              selectionBox: selectionBox!,
              dx,
              dy,
              threshold: snapState.threshold / Math.max(zoom, 0.0001),
              precomputedCandidates: snapCandidates,
            },
          )
        : { dx, dy, lines: [] }

      dx = snapResult.dx
      dy = snapResult.dy
      // markRaw on the new array prevents the surrounding reactive(store)
      // proxy from deep-walking each SnapLine; only the property write
      // itself is reactive (sufficient for the overlay).
      store.snapActiveLines = markRaw(snapResult.lines)

      for (const orig of origPositions) {
        const n = store.getElementById(orig.id)
        if (!n)
          continue
        n.x = orig.x + dx
        n.y = orig.y + dy
      }
    }

    function rollback() {
      for (const orig of origPositions) {
        const n = store.getElementById(orig.id)
        if (!n)
          continue
        n.x = orig.x
        n.y = orig.y
      }
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId)
        return
      teardown()
      store.snapActiveLines = []
      rollback()
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId)
        return
      teardown()
      store.snapActiveLines = []

      if (!moved)
        return

      for (const orig of origPositions) {
        const n = store.getElementById(orig.id)
        if (!n)
          continue
        const finalX = n.x
        const finalY = n.y
        n.x = orig.x
        n.y = orig.y
        const cmd = new MoveMaterialCommand(store.schema.elements, orig.id, { x: finalX, y: finalY })
        store.commands.execute(cmd)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  return { onPointerDown }
}
