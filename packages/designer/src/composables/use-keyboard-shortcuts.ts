import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { isInteractable, UnitManager } from '@easyink/core'
import { onMounted, onUnmounted } from 'vue'
import { createDesignerDocumentOperation, updateDraftNodeGeometry } from '../editing/document-recipes'
import { createClipboardActions } from '../interactions/clipboard-actions'
import { selectMany } from '../interactions/selection-api'

export interface KeyboardShortcutsContext {
  store: DesignerStore
  /** Container element that owns focus; shortcuts only fire when target is inside it. */
  getContainer: () => HTMLElement | null
}

/**
 * Global designer shortcuts: select-all, copy/cut/paste/duplicate/delete, and
 * arrow-key nudge (Shift = 10x). Registered on `window` so they fire even
 * when focus is on the canvas container or its non-input descendants.
 *
 * Skipped while:
 * - an editing session is active (those keys are owned by behaviors),
 * - the event target is an editable surface (input / textarea / contenteditable),
 *   so users can still type freely in property panels and overlays.
 */
export function useKeyboardShortcuts(ctx: KeyboardShortcutsContext) {
  const { store } = ctx
  const clipboardActions = createClipboardActions(store, selectedNodes)

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement))
      return false
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
      return true
    if (target.isContentEditable)
      return true
    return false
  }

  function withinContainer(target: EventTarget | null): boolean {
    const container = ctx.getContainer()
    if (!container)
      return false
    if (!(target instanceof Node))
      return false
    return container.contains(target) || target === container
  }

  function shortcutsAllowed(target: EventTarget | null): boolean {
    const focus = store.workbench.status.focus

    // Canvas intent is tracked independently from fragile DOM focus on div-
    // based surfaces. Panel/dialog focus must win even though those nodes may
    // still live under the workspace container.
    if (focus === 'panel' || focus === 'dialog')
      return false
    if (focus === 'canvas')
      return true

    return withinContainer(target)
  }

  function selectedNodes(): MaterialNode[] {
    return store.selection.ids
      .map(id => store.getElementById(id))
      .filter((n): n is MaterialNode => n != null)
  }

  function nudgeStep(big: boolean): number {
    // 1 / 10 screen px at zoom 1, converted to current unit. Keeps arrow
    // micro-moves visually consistent across mm/px/pt.
    return new UnitManager(store.schema.unit).fromPixels(big ? 10 : 1, 96, 1)
  }

  function selectAll() {
    selectMany(store, store.schema.elements.filter(isInteractable).map(el => el.id))
  }

  function nudge(dx: number, dy: number) {
    const nodes = selectedNodes().filter(isInteractable)
    if (nodes.length === 0)
      return
    store.documentTransactions.transact((draft) => {
      for (const node of nodes)
        updateDraftNodeGeometry(draft, store, node.id, { x: node.x + dx, y: node.y + dy })
    }, {
      label: 'Nudge',
      operation: createDesignerDocumentOperation(store, 'keyboard.nudge', nodes.map(node => `node:${node.id}`), ['/x', '/y'], false),
    })
  }

  function onKeyDown(e: KeyboardEvent) {
    // Behaviors / input fields take precedence.
    if (store.editingSession.isActive)
      return
    if (isEditableTarget(e.target))
      return
    if (!shortcutsAllowed(e.target))
      return

    const mod = e.metaKey || e.ctrlKey

    if (mod && !e.shiftKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault()
          selectAll()
          return
        case 'c':
          e.preventDefault()
          clipboardActions.copySelection()
          return
        case 'x':
          e.preventDefault()
          clipboardActions.cutSelection()
          return
        case 'v':
          e.preventDefault()
          clipboardActions.pasteClipboard()
          return
        case 'd':
          e.preventDefault()
          clipboardActions.duplicateSelection()
          return
      }
    }

    if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (store.selection.isEmpty)
        return
      e.preventDefault()
      clipboardActions.deleteSelection()
      return
    }

    // Arrow nudge: Shift = 10x step. Ignored when there's no selection so
    // arrow keys still scroll the canvas for navigation in that case.
    if (!mod && !store.selection.isEmpty) {
      const step = nudgeStep(e.shiftKey)
      let dx = 0
      let dy = 0
      switch (e.key) {
        case 'ArrowLeft':
          dx = -step
          break
        case 'ArrowRight':
          dx = step
          break
        case 'ArrowUp':
          dy = -step
          break
        case 'ArrowDown':
          dy = step
          break
        default:
          return
      }
      e.preventDefault()
      nudge(dx, dy)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
  })
}
