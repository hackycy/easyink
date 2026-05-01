/**
 * GestureContext — the single, authoritative interpretation of one physical
 * gesture (one pointerdown … pointerup/cancel … click cycle).
 *
 * Background
 * ----------
 * Pre-refactor, three separate booleans (`editEnteredOnPointerDown` on the
 * component, `dragJustOccurred` on useElementDrag, and the modifier-prime ref
 * on useElementDrag) were each carrying a slice of "what just happened on
 * pointerdown that the click handler needs to know". They were created and
 * cleared by different objects on different timelines, which is exactly the
 * "隐式 flag" anti-pattern the audit calls out.
 *
 * Lifecycle
 * ---------
 * - Created in `CanvasInteractionController.beginGesture` on every element/
 *   page pointerdown.
 * - Mutated only by the controller (or by the drag executor through the
 *   `markDragMoved` callback the controller passes into it).
 * - Read by the controller's click handler.
 * - Discarded on the next pointerdown (or after click, whichever comes
 *   first). There is no "next-frame reset" — discarding on the next gesture
 *   is sufficient because click always fires synchronously after pointerup.
 */
export interface GestureContext {
  /** Element under the pointer at pointerdown, or null for canvas background. */
  targetElementId: string | null
  /** Cmd/Ctrl was held at pointerdown. */
  modifier: boolean
  /** Right-click — drag and editing-session are skipped. */
  rightButton: boolean
  /**
   * Pointerdown applied an `add` SelectionIntent for this element because it
   * was previously unselected and modifier was held. The matching click MUST
   * NOT additionally toggle, otherwise the user's "Cmd+click to add" gesture
   * collapses to "Cmd+click to remove" (because pointerdown added it, then
   * click toggles it off).
   */
  selectionAddedViaPrime: boolean
  /** Drag executor reports whether the pointer actually moved. */
  dragMoved: boolean
}

export function createGestureContext(targetElementId: string | null, e: PointerEvent): GestureContext {
  return {
    targetElementId,
    modifier: e.ctrlKey || e.metaKey,
    rightButton: e.button === 2,
    selectionAddedViaPrime: false,
    dragMoved: false,
  }
}
