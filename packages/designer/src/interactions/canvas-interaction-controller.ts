import type { DesignerStore } from '../store/designer-store'
import type { GestureContext } from './gesture-context'
import { isInteractable, UnitManager } from '@easyink/core'
import { ref } from 'vue'
import { useElementDrag } from '../composables/use-element-drag'
import { createGestureContext } from './gesture-context'
import { applySelectionIntent } from './selection-intent'

export interface CanvasInteractionControllerContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
  getScrollEl: () => HTMLElement | null
  /**
   * Optional hook fired after a marquee/empty-canvas pointerdown so the
   * caller can wire its existing useMarqueeSelect executor into the same
   * gesture pipeline. The controller intentionally does NOT own the marquee
   * executor itself: marquee semantics (rubber-band rectangle, additive
   * mode) live in the executor and are stable.
   */
  onCanvasBackgroundPointerDown?: (e: PointerEvent) => void
}

/**
 * CanvasInteractionController — the single decision point that translates
 * raw pointer / click events on the canvas into explicit intents.
 *
 * Entry trigger uniformity (audit/202605011431.md item 1)
 * --------------------------------------------------------
 * Editing-session entry is dblclick-only for every material. The previous
 * `enterTrigger: 'click'` path on table materials made pointerdown silently
 * enter the session, which (a) stole the first gesture from canvas-level
 * select / drag, and (b) forced the click handler to compensate with cross-
 * event boolean locks. Removing that path means single-click on every
 * material — table, rect, text alike — produces the same canvas semantics:
 * select + drag-eligible. dblclick uniformly opens the editing session.
 *
 * Deep-edit move policy (audit item 2)
 * ------------------------------------
 * While an editing-session is active, the element root's pointerdown is
 * routed entirely into the session (see `handleElementPointerDown` early
 * return). Moving the element while in deep-edit requires exiting first
 * (Esc / click outside), matching Figma / PowerPoint semantics. The prior
 * external `DeepEditDragHandle` (a 14×14 hit target sitting outside the
 * element) was removed: a small hidden affordance on the wrong axis is
 * worse than no affordance at all.
 */
export function useCanvasInteractionController(ctx: CanvasInteractionControllerContext) {
  const { store } = ctx

  const currentGesture = ref<GestureContext | null>(null)

  const drag = useElementDrag({
    store,
    getPageEl: ctx.getPageEl,
    getScrollEl: ctx.getScrollEl,
    onDragMoved: () => {
      const g = currentGesture.value
      if (g)
        g.dragMoved = true
    },
  })

  function pointToDocument(e: { clientX: number, clientY: number }): { x: number, y: number } | null {
    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return null
    const rect = pageEl.getBoundingClientRect()
    const zoom = store.workbench.viewport.zoom
    const um = new UnitManager(store.schema.unit)
    return {
      x: um.screenToDocument(e.clientX, rect.left, 0, zoom),
      y: um.screenToDocument(e.clientY, rect.top, 0, zoom),
    }
  }

  function handleElementPointerDown(e: PointerEvent, elementId: string) {
    e.stopPropagation()

    const gesture = createGestureContext(elementId, e)
    currentGesture.value = gesture

    // Right-click: keep the existing selection intact (or collapse to this
    // element if it was not selected). Skip drag and editing entirely so the
    // context menu opens against a stable selection.
    if (gesture.rightButton) {
      applySelectionIntent(store, { kind: 'preserve-for-context-menu', elementId })
      return
    }

    const activeNodeId = store.editingSession.activeNodeId

    // Inside an active editing session for this same node: route the pointer
    // event into the session, do not touch top-level selection. Element-
    // range pointerdown is fully owned by the session — moving the element
    // requires exiting first.
    if (store.editingSession.isActive && activeNodeId === elementId) {
      const point = pointToDocument(e)
      if (point) {
        store.editingSession.dispatch({ kind: 'pointer-down', point, originalEvent: e })
      }
      return
    }

    // Editing another element: exit before reinterpreting this gesture so the
    // session lifecycle is independent of selection mutation order.
    if (store.editingSession.isActive && activeNodeId !== elementId) {
      store.editingSession.exit()
    }

    // Decide top-level selection BEFORE handing off to the drag executor.
    // Drag is a pure executor that reads `store.selection` to know what to
    // move; it does not write to the model.
    const node = store.getElementById(elementId)
    if (!node || !isInteractable(node))
      return

    if (!store.selection.has(elementId)) {
      if (gesture.modifier) {
        applySelectionIntent(store, { kind: 'add', elementId })
        gesture.selectionAddedViaPrime = true
      }
      else {
        applySelectionIntent(store, { kind: 'single', elementId })
      }
    }

    drag.onPointerDown(e, elementId)
  }

  function handleElementClick(e: MouseEvent, elementId: string) {
    e.stopPropagation()

    const gesture = currentGesture.value

    // No matching gesture: synthesised click without a paired pointerdown
    // (rare — e.g. keyboard-driven activation). Fall through to the default
    // single-select path.
    if (!gesture || gesture.targetElementId !== elementId) {
      applySelectionIntent(store, { kind: 'single', elementId })
      return
    }

    // Order matters: each early-exit corresponds to a pointerdown decision
    // that already wrote what was needed. This is what the GestureContext
    // exists for — click does not have to re-derive intent from scratch.
    if (gesture.dragMoved)
      return
    if (gesture.selectionAddedViaPrime)
      return
    if (gesture.rightButton)
      return

    if (gesture.modifier) {
      applySelectionIntent(store, { kind: 'toggle', elementId })
      return
    }

    if (!store.selection.has(elementId) || store.selection.count > 1)
      applySelectionIntent(store, { kind: 'single', elementId })
  }

  function handleElementDblClick(e: MouseEvent, elementId: string) {
    e.stopPropagation()

    if (store.editingSession.isActive && store.editingSession.activeNodeId === elementId) {
      store.editingSession.dispatch({ kind: 'command', command: 'enter-edit' })
      return
    }

    const node = store.getElementById(elementId)
    const ext = node ? store.getDesignerExtension(node.type) : undefined
    // Uniform dblclick entry: any material that declares a `geometry`
    // protocol (table / chart / svg / container …) is openable via
    // dblclick. Materials without geometry have nothing to edit and remain
    // inert here.
    if (ext?.geometry) {
      const initialPoint = pointToDocument(e)
      if (!initialPoint)
        return
      const session = store.editingSession.enter(elementId, ext, initialPoint)
      if (session && session.selectionStore.selection)
        store.editingSession.dispatch({ kind: 'command', command: 'enter-edit' })
    }
  }

  function handleScrollPointerDown(e: PointerEvent) {
    const pageEl = ctx.getPageEl()
    const scrollEl = ctx.getScrollEl()
    // Only accept the gesture on actual canvas background (not on overlay
    // children). The empty-space contract is shared with marquee.
    if (e.target !== scrollEl && e.target !== pageEl)
      return

    currentGesture.value = createGestureContext(null, e)

    if (store.editingSession.isActive)
      store.editingSession.exit()

    ctx.onCanvasBackgroundPointerDown?.(e)
  }

  return {
    handleElementPointerDown,
    handleElementClick,
    handleElementDblClick,
    handleScrollPointerDown,
    /** Exposed only for tests / debug. Production code MUST NOT read this. */
    _currentGesture: currentGesture,
  }
}
