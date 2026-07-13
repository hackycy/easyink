import type { MaterialResizeHandle } from '@easyink/core'
import type { DesignerStore } from '../store/designer-store'
import type { SnapLine } from '../types'
import { createEditorSurfacePlan, isInteractable, requireDocumentNode } from '@easyink/core'
import { markRaw } from 'vue'
import { createGeometryService } from '../editing/geometry-service'
import { canResizeHandle } from '../materials/control-policy'
import { collectSnapCandidates, pickBestSnap } from '../snap'

export type ResizeHandle = MaterialResizeHandle

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
 * Lifecycle is owned by GestureCoordinator. Pointer cancellation discards the
 * preview, and pointerup commits the full geometry/model patch as one history item.
 *
 * Material-private resizing (e.g. table row height scaling) is delegated to
 * `MaterialDesignerExtension.resize` (MaterialResizeAdapter) on the draft node.
 */
export function useElementResize(ctx: ElementResizeContext) {
  const geometry = createGeometryService(ctx.store, { getPageEl: ctx.getPageEl })

  function onHandlePointerDown(e: PointerEvent, elementId: string, handle: ResizeHandle) {
    e.stopPropagation()
    e.preventDefault()

    const { store } = ctx
    const node = store.getElementById(elementId)
    if (!node || !isInteractable(node))
      return

    if (!canResizeHandle(store, node, handle))
      return

    const designerExt = store.peekDesignerFacet(node.type)?.value?.extension
    const resizeAdapter = designerExt?.resize

    const zoom = store.workbench.viewport.zoom

    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return

    const startPoint = geometry.screenToDocument({ x: e.clientX, y: e.clientY })

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

    // Pre-compute snap candidates ONCE at pointerdown. The set of other
    // elements (and their geometry) doesn't change during a resize, so
    // re-collecting per pointermove would burn O(n) allocation each frame.
    const snapStateAtStart = store.workbench.snap
    const otherNodes = store.getElements().filter(
      n => n.id !== elementId && !n.editorState?.hidden && !n.editorState?.locked,
    )
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

    let moved = false
    const operationContext = store.documentTransactions.getOperationContext()
    store.gestures.begin({
      target: window as unknown as HTMLElement,
      event: e,
      label: 'Resize',
      mergeKey: `geometry.resize:${elementId}:${handle}`,
      operation: {
        kind: 'geometry.resize',
        sessionPath: [...operationContext.sessionPath],
        targetIds: [`node:${elementId}`],
        fieldPaths: ['/x', '/y', '/width', '/height', '/model'],
        selectionLineage: operationContext.selectionLineage,
        structural: false,
      },
      update(ev, preview) {
        const point = geometry.screenToDocument({ x: ev.clientX, y: ev.clientY })

        let dx = point.x - startPoint.x
        let dy = point.y - startPoint.y

        if (dx === 0 && dy === 0 && !moved)
          return

        if (dx === 0 && dy === 0) {
          store.snapActiveLines = []
          preview.replace((draft) => {
            const draftNode = requireDocumentNode(draft, store.materialProfile, elementId)
            draftNode.x = origX
            draftNode.y = origY
            draftNode.width = origW
            draftNode.height = origH
          })
          return
        }

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

        preview.replace((draft) => {
          const draftNode = requireDocumentNode(draft, store.materialProfile, elementId)
          draftNode.x = newX
          draftNode.y = newY
          draftNode.width = newW
          draftNode.height = newH
          if (resizeAdapter) {
            resizeAdapter.applyResize(draftNode, adapterSnapshot, {
              originalWidth: origW,
              originalHeight: origH,
              newWidth: draftNode.width,
              newHeight: draftNode.height,
            })
          }
        })
      },
      onFinish() {
        store.snapActiveLines = []
      },
    })
  }

  return { onHandlePointerDown }
}
