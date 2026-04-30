import type { DesignerStore } from '../store/designer-store'
import type { SnapLine } from '../types'
import { ResizeMaterialCommand, UnitManager } from '@easyink/core'
import { markRaw } from 'vue'
import { collectSnapCandidates, pickBestSnap } from '../snap'

export type ResizeHandle
  = 'nw' | 'n' | 'ne'
    | 'w' | 'e'
    | 'sw' | 's' | 'se'

export interface ElementResizeContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
}

/**
 * Element resize via 8 directional handles.
 *
 * Snap behavior (drag and resize share the snap engine):
 * - Only the edge(s) actually moved by the active handle participate in snapping.
 *   Fixed edges never pull (avoids visual confusion when both edges are near a guide).
 * - Threshold is normalized for zoom: `snapState.threshold / max(zoom, ε)`.
 * - Hold Cmd / Ctrl during resize to bypass snapping for the current frame.
 *
 * Lifecycle:
 * - Pointer events bound on `window` so resize continues across canvas boundaries.
 * - `pointercancel` rolls geometry back to origin and skips the command commit
 *   (no half-resize entry in undo history).
 *
 * Material-private side effects (e.g. table row height scaling) are delegated
 * to `MaterialDesignerExtension.resize` (MaterialResizeAdapter) — designer code
 * remains material-agnostic.
 */
export function useElementResize(ctx: ElementResizeContext) {
  function onHandlePointerDown(e: PointerEvent, elementId: string, handle: ResizeHandle) {
    e.stopPropagation()
    e.preventDefault()

    const { store } = ctx
    const node = store.getElementById(elementId)
    if (!node || node.locked)
      return

    const material = store.getMaterial(node.type)
    if (material && material.capabilities.resizable === false)
      return

    const designerExt = store.getDesignerExtension(node.type)
    const resizeAdapter = designerExt?.resize

    const unitManager = new UnitManager(store.schema.unit)
    const zoom = store.workbench.viewport.zoom

    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return

    const pageRect = pageEl.getBoundingClientRect()
    const canvasOffsetX = pageRect.left
    const canvasOffsetY = pageRect.top

    const startDocX = unitManager.screenToDocument(e.clientX, canvasOffsetX, 0, zoom)
    const startDocY = unitManager.screenToDocument(e.clientY, canvasOffsetY, 0, zoom)

    const origX = node.x
    const origY = node.y
    const origW = node.width
    const origH = node.height

    const adapterSnapshot = resizeAdapter ? resizeAdapter.beginResize(node) : undefined

    const MIN_SIZE = 1

    // Decide which edge moves per axis.
    // 'min' = west / north edge moves (origin shifts), 'max' = east / south edge moves.
    const movingX: 'min' | 'max' | null
      = handle === 'w' || handle === 'nw' || handle === 'sw'
        ? 'min'
        : handle === 'e' || handle === 'ne' || handle === 'se'
          ? 'max'
          : null
    const movingY: 'min' | 'max' | null
      = handle === 'n' || handle === 'nw' || handle === 'ne'
        ? 'min'
        : handle === 's' || handle === 'sw' || handle === 'se'
          ? 'max'
          : null

    let moved = false
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(pointerId)

    // Pre-compute snap candidates ONCE at pointerdown. The set of other
    // elements (and their geometry) doesn't change during a resize, so
    // re-collecting per pointermove would burn O(n) allocation each frame.
    const snapStateAtStart = store.workbench.snap
    const otherNodes = store.getElements().filter(
      n => n.id !== elementId && !n.hidden && !n.locked,
    )
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

    function rollback() {
      node!.x = origX
      node!.y = origY
      node!.width = origW
      node!.height = origH
      if (resizeAdapter) {
        resizeAdapter.applyResize(node!, adapterSnapshot, {
          originalWidth: origW,
          originalHeight: origH,
          newWidth: origW,
          newHeight: origH,
        })
      }
    }

    function applySnap(dx: number, dy: number, ev: PointerEvent): { dx: number, dy: number, lines: SnapLine[] } {
      const snapState = store.workbench.snap
      const bypass = ev.metaKey || ev.ctrlKey
      if (bypass || !snapState.enabled)
        return { dx, dy, lines: [] }

      const grid = snapState.gridSnap && store.schema.page.grid?.enabled ? store.schema.page.grid : undefined
      const threshold = snapState.threshold / Math.max(zoom, 0.0001)
      const lines: SnapLine[] = []

      let outDx = dx
      let outDy = dy

      if (movingX) {
        const edgeX = movingX === 'min' ? origX + dx : origX + origW + dx
        const pick = pickBestSnap(
          [edgeX],
          snapCandidates.x,
          threshold,
          grid && grid.width > 0 ? { step: grid.width } : undefined,
        )
        if (pick) {
          outDx += pick.snapTo - pick.testValue
          const fixedTop = movingY === 'min' ? origY + outDy : origY
          const fixedBot = movingY === 'max' ? origY + origH + outDy : origY + origH
          const ext = pick.candidate.segmentExtent
          lines.push({
            orientation: 'vertical',
            position: pick.snapTo,
            from: ext ? Math.min(fixedTop, ext.min) : fixedTop,
            to: ext ? Math.max(fixedBot, ext.max) : fixedBot,
            source: pick.candidate.source,
            targetId: pick.candidate.targetId,
          })
        }
      }

      if (movingY) {
        const edgeY = movingY === 'min' ? origY + dy : origY + origH + dy
        const pick = pickBestSnap(
          [edgeY],
          snapCandidates.y,
          threshold,
          grid && grid.height > 0 ? { step: grid.height } : undefined,
        )
        if (pick) {
          outDy += pick.snapTo - pick.testValue
          const fixedL = movingX === 'min' ? origX + outDx : origX
          const fixedR = movingX === 'max' ? origX + origW + outDx : origX + origW
          const ext = pick.candidate.segmentExtent
          lines.push({
            orientation: 'horizontal',
            position: pick.snapTo,
            from: ext ? Math.min(fixedL, ext.min) : fixedL,
            to: ext ? Math.max(fixedR, ext.max) : fixedR,
            source: pick.candidate.source,
            targetId: pick.candidate.targetId,
          })
        }
      }

      return { dx: outDx, dy: outDy, lines }
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId)
        return

      const docX = unitManager.screenToDocument(ev.clientX, canvasOffsetX, 0, zoom)
      const docY = unitManager.screenToDocument(ev.clientY, canvasOffsetY, 0, zoom)

      let dx = docX - startDocX
      let dy = docY - startDocY

      if (dx === 0 && dy === 0)
        return

      moved = true

      const snapped = applySnap(dx, dy, ev)
      dx = snapped.dx
      dy = snapped.dy
      // markRaw avoids deep-tracking each SnapLine through the reactive
      // store proxy; only the property reassignment is reactive.
      store.snapActiveLines = markRaw(snapped.lines)

      let newX = origX
      let newY = origY
      let newW = origW
      let newH = origH

      if (movingX === 'min') {
        newX = origX + dx
        newW = origW - dx
        if (newW < MIN_SIZE) {
          newW = MIN_SIZE
          newX = origX + origW - MIN_SIZE
        }
      }
      else if (movingX === 'max') {
        newW = origW + dx
        if (newW < MIN_SIZE)
          newW = MIN_SIZE
      }

      if (movingY === 'min') {
        newY = origY + dy
        newH = origH - dy
        if (newH < MIN_SIZE) {
          newH = MIN_SIZE
          newY = origY + origH - MIN_SIZE
        }
      }
      else if (movingY === 'max') {
        newH = origH + dy
        if (newH < MIN_SIZE)
          newH = MIN_SIZE
      }

      node!.x = newX
      node!.y = newY
      node!.width = newW
      node!.height = newH

      if (resizeAdapter) {
        resizeAdapter.applyResize(node!, adapterSnapshot, {
          originalWidth: origW,
          originalHeight: origH,
          newWidth: newW,
          newHeight: newH,
        })
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

      const finalX = node!.x
      const finalY = node!.y
      const finalW = node!.width
      const finalH = node!.height

      // Capture material-private side effect (e.g. row heights) before we reset
      // node fields to original; commitResize must read post-resize state.
      const sideEffect = resizeAdapter
        ? resizeAdapter.commitResize(node!, adapterSnapshot)
        : null

      // Reset to original before command (the command re-applies geometry + side effect).
      node!.x = origX
      node!.y = origY
      node!.width = origW
      node!.height = origH

      // Revert material-private state so command.execute() applies cleanly from origin.
      sideEffect?.undo(node!)

      const cmd = new ResizeMaterialCommand(
        store.schema.elements,
        elementId,
        { x: finalX, y: finalY, width: finalW, height: finalH },
        sideEffect,
      )
      store.commands.execute(cmd)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  return { onHandlePointerDown }
}
