/**
 * Pointer-gesture lifecycle helper.
 *
 * Why this exists
 * ---------------
 * Several material-internal interactions (table column/row resize,
 * cell-decoration hit dragging, etc.) need to follow the same
 * pointerdown → pointermove* → (pointerup | pointercancel) → teardown
 * lifecycle. Audit/202605011431.md item 3 called out that those sites
 * historically wired pointermove + pointerup but skipped pointercancel,
 * leaving session meta in a dirty state when the OS interrupted the
 * gesture (touch palm-rejection, focus loss, device switch).
 *
 * `createPointerGesture` provides one teardown path used uniformly for
 * pointerup AND pointercancel (and is also wired to release pointer
 * capture). Callers supply the per-event work; the helper guarantees the
 * teardown runs exactly once.
 *
 * Design constraints
 * ------------------
 * - No Vue dependency: usable from `@easyink/material-table-kernel`
 *   (which has Vue as an optional peer) and any non-Vue executor.
 * - Pure function, no module-level state — multiple concurrent gestures
 *   on different elements coexist safely.
 * - Caller-owned target element: the helper does not assume any DOM
 *   ownership beyond the one element passed in.
 */

export interface CreatePointerGestureOptions {
  /** Element that captured the original pointerdown. setPointerCapture / event listeners are bound here. */
  target: HTMLElement
  /** The originating pointerdown event. Provides pointerId for capture. */
  event: PointerEvent
  /** Called on every pointermove until teardown. */
  onMove: (e: PointerEvent) => void
  /**
   * Called on pointerup with `reason: 'commit'` and on pointercancel with
   * `reason: 'cancel'`. Use this to commit / roll back any in-progress
   * mutation (resize meta, drag preview, etc.). Always runs exactly once.
   */
  onEnd: (e: PointerEvent, reason: 'commit' | 'cancel') => void
}

export interface PointerGestureHandle {
  /** Tear down listeners and release pointer capture early (e.g. unmount). */
  abort: () => void
}

export function createPointerGesture(options: CreatePointerGestureOptions): PointerGestureHandle {
  const { target, event, onMove, onEnd } = options
  const pointerId = event.pointerId

  try {
    target.setPointerCapture(pointerId)
  }
  catch {
    // Capture can fail in headless tests or when the pointer was already
    // released by the platform. Continuing without capture is safe — events
    // will still bubble through the document tree.
  }

  let torndown = false

  function teardown(e: PointerEvent, reason: 'commit' | 'cancel'): void {
    if (torndown)
      return
    torndown = true
    target.removeEventListener('pointermove', handleMove)
    target.removeEventListener('pointerup', handleUp)
    target.removeEventListener('pointercancel', handleCancel)
    try {
      target.releasePointerCapture(pointerId)
    }
    catch {
      // Capture may have been lost by the platform already; release is best-effort.
    }
    onEnd(e, reason)
  }

  function handleMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId)
      return
    onMove(e)
  }

  function handleUp(e: PointerEvent): void {
    if (e.pointerId !== pointerId)
      return
    teardown(e, 'commit')
  }

  function handleCancel(e: PointerEvent): void {
    if (e.pointerId !== pointerId)
      return
    teardown(e, 'cancel')
  }

  target.addEventListener('pointermove', handleMove)
  target.addEventListener('pointerup', handleUp)
  target.addEventListener('pointercancel', handleCancel)

  return {
    abort(): void {
      if (torndown)
        return
      // Synthesize a cancel-shaped teardown using the originating event.
      teardown(event, 'cancel')
    },
  }
}
