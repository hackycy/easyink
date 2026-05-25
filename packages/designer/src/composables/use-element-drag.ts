import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { createEditorSurfacePlan, isInteractable, MoveMaterialCommand } from '@easyink/core'
import { markRaw } from 'vue'
import { createGeometryService } from '../editing/geometry-service'
import { collectSnapCandidates, computeSnap, getSelectionBox } from '../snap'

export interface ElementDragContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
  getScrollEl: () => HTMLElement | null
  /**
   * Optional callback invoked the first time the pointer actually moves
   * during a drag. Used by the canvas interaction controller to mark the
   * current GestureContext as "drag occurred", so the synthesised click
   * after pointerup can be ignored.
   *
   * Drag is purely a geometric executor here: it does NOT mutate the
   * top-level SelectionModel or own any cross-event interpretation. All
   * selection decisions (single / add / toggle / preserve) are taken
   * upstream by the controller before `onPointerDown` is called.
   */
  onDragMoved?: () => void
}

/**
 * Element drag-to-move executor.
 *
 * Snap behavior is delegated to the snap engine (`packages/designer/src/snap`),
 * which evaluates grid / guide / element candidates uniformly and picks the
 * closest within threshold.
 *
 * Conventions:
 * - The caller (CanvasInteractionController) MUST already have applied the
 *   correct SelectionIntent before invoking `onPointerDown`. This composable
 *   reads `store.selection` to know what to move, but never writes to it.
 * - Selection bounding box uses schema element width / height.
 * - Threshold is normalized for zoom: `snapState.threshold / max(zoom, ε)`.
 * - Hold Cmd / Ctrl during drag to bypass snapping for the current frame.
 * - Pointer events are bound on `window` so dragging continues across canvas
 *   boundaries; `pointercancel` rolls back geometry and skips command commit.
 */
export function useElementDrag(ctx: ElementDragContext) {
  const geometry = createGeometryService(ctx.store, { getPageEl: ctx.getPageEl })

  function onPointerDown(e: PointerEvent, elementId: string) {
    const { store } = ctx
    const node = store.getElementById(elementId)
    if (!node || !isInteractable(node))
      return

    const selectedIds = store.selection.ids
    const selectedNodes = selectedIds
      .map(id => store.getElementById(id))
      .filter((n): n is MaterialNode => n != null && isInteractable(n))

    if (selectedNodes.length === 0)
      return

    const zoom = store.workbench.viewport.zoom

    const pageEl = ctx.getPageEl()
    const scrollEl = ctx.getScrollEl()
    if (!pageEl || !scrollEl)
      return

    const startPoint = geometry.screenToDocument({ x: e.clientX, y: e.clientY })

    const origPositions = selectedNodes.map(n => ({ id: n.id, x: n.x, y: n.y }))
    const selectionBox = getSelectionBox(selectedNodes, n => store.getElementSize(n))
    if (!selectionBox)
      return

    const otherNodes = store.getElements().filter(
      el => !store.selection.has(el.id) && isInteractable(el),
    )

    // Collect snap candidates ONCE at pointerdown — element set and their
    // geometry don't change during a drag, so re-collecting per pointermove
    // would burn O(n) allocation each frame on dense canvases. Toggles are
    // captured at drag start (changing them mid-drag is not a supported flow).
    const snapStateAtStart = store.workbench.snap
    const pageRects = createEditorSurfacePlan(store.schema).pages.map(page => ({
      x: 0,
      y: page.yOffset,
      width: page.width,
      height: page.height,
    }))
    const snapCandidates = collectSnapCandidates({
      page: store.schema.page,
      pageRects,
      guidesX: store.schema.guides.x,
      guidesY: store.schema.guides.y,
      otherNodes,
      getElementSize: n => store.getElementSize(n),
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

      const currentPoint = geometry.screenToDocument({ x: ev.clientX, y: ev.clientY })

      let dx = currentPoint.x - startPoint.x
      let dy = currentPoint.y - startPoint.y

      if (dx === 0 && dy === 0)
        return

      if (!moved) {
        moved = true
        ctx.onDragMoved?.()
      }

      const snapState = store.workbench.snap
      const bypassSnap = ev.metaKey || ev.ctrlKey

      const snapResult = (!bypassSnap && snapState.enabled)
        ? computeSnap(
            {
              page: store.schema.page,
              pageRects,
              guidesX: store.schema.guides.x,
              guidesY: store.schema.guides.y,
              otherNodes,
              getElementSize: n => store.getElementSize(n),
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

      // Group every per-node MoveMaterialCommand into a single undo step so
      // multi-selection moves are reversed by one Cmd+Z. Single-selection
      // drags also benefit (the batch wraps a single command, which the
      // command manager collapses transparently).
      store.commands.beginTransaction('Move')
      try {
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
        store.commands.commitTransaction()
      }
      catch (err) {
        store.commands.rollbackTransaction()
        // Boundary policy (see 22-editing-behavior.md): user-driven errors
        // must not bubble back into the DOM event loop in a half-applied
        // state. Rollback already restored geometry; surface the diagnostic
        // and stop. A throw here previously left the snap-line overlay
        // state inconsistent with the model.
        console.error('[useElementDrag] Move transaction failed; rolled back.', err)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  return { onPointerDown }
}
