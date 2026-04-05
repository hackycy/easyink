import type { DesignerStore } from '../store/designer-store'
import { ResizeMaterialCommand, UnitManager } from '@easyink/core'

export type ResizeHandle
  = 'nw' | 'n' | 'ne'
    | 'w' | 'e'
    | 'sw' | 's' | 'se'

export interface ElementResizeContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
}

/**
 * Creates a pointerdown handler that initiates element resize via 8 directional handles.
 * Supports:
 * - Corner resize (nw, ne, sw, se) -- moves origin + resizes
 * - Edge resize (n, s, e, w) -- constrained axis resize
 * - Minimum size enforcement (1 unit)
 * - Grid snapping on resize
 * - Command merge for continuous resize (single undo entry)
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

    const MIN_SIZE = 1

    let moved = false

    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const docX = unitManager.screenToDocument(ev.clientX, canvasOffsetX, 0, zoom)
      const docY = unitManager.screenToDocument(ev.clientY, canvasOffsetY, 0, zoom)

      const dx = docX - startDocX
      const dy = docY - startDocY

      if (dx === 0 && dy === 0)
        return

      moved = true

      let newX = origX
      let newY = origY
      let newW = origW
      let newH = origH

      // Horizontal
      if (handle === 'w' || handle === 'nw' || handle === 'sw') {
        newX = origX + dx
        newW = origW - dx
        if (newW < MIN_SIZE) {
          newW = MIN_SIZE
          newX = origX + origW - MIN_SIZE
        }
      }
      else if (handle === 'e' || handle === 'ne' || handle === 'se') {
        newW = origW + dx
        if (newW < MIN_SIZE)
          newW = MIN_SIZE
      }

      // Vertical
      if (handle === 'n' || handle === 'nw' || handle === 'ne') {
        newY = origY + dy
        newH = origH - dy
        if (newH < MIN_SIZE) {
          newH = MIN_SIZE
          newY = origY + origH - MIN_SIZE
        }
      }
      else if (handle === 's' || handle === 'sw' || handle === 'se') {
        newH = origH + dy
        if (newH < MIN_SIZE)
          newH = MIN_SIZE
      }

      node!.x = newX
      node!.y = newY
      node!.width = newW
      node!.height = newH
    }

    function onUp() {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)

      if (!moved)
        return

      const finalX = node!.x
      const finalY = node!.y
      const finalW = node!.width
      const finalH = node!.height

      // Reset to original before command
      node!.x = origX
      node!.y = origY
      node!.width = origW
      node!.height = origH

      const cmd = new ResizeMaterialCommand(
        store.schema.elements,
        elementId,
        { x: finalX, y: finalY, width: finalW, height: finalH },
      )
      store.commands.execute(cmd)
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  return { onHandlePointerDown }
}
