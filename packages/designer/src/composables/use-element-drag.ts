import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import type { SnapLine } from '../types'
import { MoveMaterialCommand, snapToGrid, snapToGuide, UnitManager } from '@easyink/core'

export interface ElementDragContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
  getScrollEl: () => HTMLElement | null
}

/**
 * Creates a pointerdown handler that initiates element drag-to-move.
 * Supports:
 * - Single and multi-element drag
 * - Grid snapping
 * - Guide snapping
 * - Element-edge snapping (center/edge alignment)
 * - Snap line visual feedback via store.workbench.snap.activeLines
 * - Command merge for continuous drag (single undo entry)
 */
export function useElementDrag(ctx: ElementDragContext) {
  function onPointerDown(e: PointerEvent, elementId: string) {
    const { store } = ctx
    const node = store.getElementById(elementId)
    if (!node || node.locked)
      return

    // Ensure clicked element is selected
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

    // Capture start positions in document units
    const startDocX = unitManager.screenToDocument(e.clientX, canvasOffsetX, 0, zoom)
    const startDocY = unitManager.screenToDocument(e.clientY, canvasOffsetY, 0, zoom)

    const origPositions = selectedNodes.map(n => ({ id: n.id, x: n.x, y: n.y }))

    // Collect snap targets from non-selected elements
    const otherNodes = store.getElements().filter(
      el => !store.selection.has(el.id) && !el.hidden && !el.locked,
    )

    let moved = false

    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const currentDocX = unitManager.screenToDocument(ev.clientX, canvasOffsetX, 0, zoom)
      const currentDocY = unitManager.screenToDocument(ev.clientY, canvasOffsetY, 0, zoom)

      let dx = currentDocX - startDocX
      let dy = currentDocY - startDocY

      if (dx === 0 && dy === 0)
        return

      moved = true

      const snapState = store.workbench.snap
      const activeLines: SnapLine[] = []

      if (snapState.enabled) {
        // For snapping, use the first node as reference (or bounding box)
        const refOrig = origPositions[0]!
        const refNode = selectedNodes[0]!
        const refX = refOrig.x + dx
        const refY = refOrig.y + dy

        const threshold = snapState.threshold
        let snappedAxisX = false
        let snappedAxisY = false

        // Grid snap
        if (snapState.gridSnap && store.schema.page.grid?.enabled) {
          const gridW = store.schema.page.grid.width
          const gridH = store.schema.page.grid.height
          if (gridW > 0 && gridH > 0) {
            const snappedX = snapToGrid(refX, gridW)
            const snappedY = snapToGrid(refY, gridH)
            if (Math.abs(snappedX - refX) <= threshold) {
              dx += snappedX - refX
              snappedAxisX = true
            }
            if (Math.abs(snappedY - refY) <= threshold) {
              dy += snappedY - refY
              snappedAxisY = true
            }
          }
        }

        // Guide snap (test left/center/right and top/center/bottom edges)
        if (snapState.guideSnap && !snappedAxisX) {
          const guidesX = store.schema.guides.x
          if (guidesX.length > 0) {
            const currentRefX = refOrig.x + dx
            const currentRefCenterX = currentRefX + refNode.width / 2
            const currentRefRight = currentRefX + refNode.width
            for (const testX of [currentRefX, currentRefCenterX, currentRefRight]) {
              const snap = snapToGuide(testX, guidesX, threshold)
              if (snap != null) {
                dx += snap - testX
                activeLines.push({ axis: 'x', position: snap })
                snappedAxisX = true
                break
              }
            }
          }
        }

        if (snapState.guideSnap && !snappedAxisY) {
          const guidesY = store.schema.guides.y
          if (guidesY.length > 0) {
            const refVisualH = store.getVisualHeight(refNode)
            const currentRefY = refOrig.y + dy
            const currentRefCenterY = currentRefY + refVisualH / 2
            const currentRefBottom = currentRefY + refVisualH
            for (const testY of [currentRefY, currentRefCenterY, currentRefBottom]) {
              const snap = snapToGuide(testY, guidesY, threshold)
              if (snap != null) {
                dy += snap - testY
                activeLines.push({ axis: 'y', position: snap })
                snappedAxisY = true
                break
              }
            }
          }
        }

        // Element-edge snap (align to edges/centers of other elements)
        if (snapState.elementSnap && otherNodes.length > 0) {
          const edgesX: number[] = []
          const edgesY: number[] = []
          for (const other of otherNodes) {
            const otherVisualH = store.getVisualHeight(other)
            edgesX.push(other.x, other.x + other.width / 2, other.x + other.width)
            edgesY.push(other.y, other.y + otherVisualH / 2, other.y + otherVisualH)
          }

          // Skip axis if already snapped by grid or guide
          if (!snappedAxisX) {
            const currentRefX = refOrig.x + dx
            const currentRefRight = currentRefX + refNode.width
            const currentRefCenterX = currentRefX + refNode.width / 2
            for (const testX of [currentRefX, currentRefCenterX, currentRefRight]) {
              const snap = snapToGuide(testX, edgesX, threshold)
              if (snap != null) {
                dx += snap - testX
                activeLines.push({ axis: 'x', position: snap })
                break
              }
            }
          }

          if (!snappedAxisY) {
            const refVisualH2 = store.getVisualHeight(refNode)
            const currentRefY = refOrig.y + dy
            const currentRefBottom = currentRefY + refVisualH2
            const currentRefCenterY = currentRefY + refVisualH2 / 2
            for (const testY of [currentRefY, currentRefCenterY, currentRefBottom]) {
              const snap = snapToGuide(testY, edgesY, threshold)
              if (snap != null) {
                dy += snap - testY
                activeLines.push({ axis: 'y', position: snap })
                break
              }
            }
          }
        }
      }

      // Update snap visual feedback
      store.workbench.snap.activeLines = activeLines

      // Apply movement
      for (const orig of origPositions) {
        const n = store.getElementById(orig.id)
        if (!n)
          continue
        n.x = orig.x + dx
        n.y = orig.y + dy
      }
    }

    function onUp() {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)

      // Clear snap lines
      store.workbench.snap.activeLines = []

      if (!moved)
        return

      // Commit final positions as commands (mergeable)
      for (const orig of origPositions) {
        const n = store.getElementById(orig.id)
        if (!n)
          continue
        // Reset to original before command execution
        const finalX = n.x
        const finalY = n.y
        n.x = orig.x
        n.y = orig.y
        const cmd = new MoveMaterialCommand(store.schema.elements, orig.id, { x: finalX, y: finalY })
        store.commands.execute(cmd)
      }
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  return { onPointerDown }
}
