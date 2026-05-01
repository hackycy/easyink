/**
 * Non-canvas selection API.
 *
 * Why a separate surface (audit/202605011431.md item 5)
 * ------------------------------------------------------
 * `applySelectionIntent` is the canvas-pointer-only entry point. Its enum
 * is intentionally narrow: every kind maps to a single pointer-gesture
 * outcome (single / add / toggle / preserve-for-context-menu / collapse-
 * to-session-owner). Forcing non-pointer entry points (TopBar buttons,
 * CanvasContextMenu actions, structure-tree picker, keyboard shortcuts,
 * datasource drop, paste/duplicate) through that enum either pollutes it
 * with pointer-irrelevant kinds or hides the call site behind a misleading
 * name.
 *
 * Instead, this module is the explicit, documented escape hatch for those
 * non-pointer surfaces. The architecture rule is:
 *
 *   - Canvas pointer gestures      → `applySelectionIntent`
 *   - Everything else              → `selectionApi` (this module)
 *   - Direct `store.selection.*`   → forbidden (PR-blocking)
 *
 * Each function here is a thin wrapper that documents *which non-canvas
 * caller* is allowed to use it. Adding a new caller requires either a new
 * named wrapper here, so the exception list stays auditable in one file.
 */

import type { DesignerStore } from '../store/designer-store'

/** Replace selection with a single element. Used by structure-tree, MaterialPanel, datasource-drop, post-group/paste. */
export function selectOne(store: DesignerStore, elementId: string): void {
  store.selection.select(elementId)
}

/** Replace selection with the given ids. Used by select-all, select-by-type, paste/duplicate, ungroup. */
export function selectMany(store: DesignerStore, elementIds: readonly string[]): void {
  if (elementIds.length === 0)
    store.selection.clear()
  else
    store.selection.selectMultiple([...elementIds])
}

/** Clear selection. Used by keyboard Esc, post-cut/delete. */
export function clearSelection(store: DesignerStore): void {
  store.selection.clear()
}
