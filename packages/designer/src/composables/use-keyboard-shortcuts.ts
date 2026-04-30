import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import {
  AddMaterialCommand,
  isInteractable,
  MoveMaterialCommand,
  RemoveMaterialCommand,
  UnitManager,
} from '@easyink/core'
import { deepClone, generateId } from '@easyink/shared'
import { onMounted, onUnmounted } from 'vue'

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

  function selectedNodes(): MaterialNode[] {
    return store.selection.ids
      .map(id => store.getElementById(id))
      .filter((n): n is MaterialNode => n != null)
  }

  function pasteOffset(): number {
    return new UnitManager(store.schema.unit).fromPixels(10, 96, 1)
  }

  function nudgeStep(big: boolean): number {
    // 1 / 10 screen px at zoom 1, converted to current unit. Keeps arrow
    // micro-moves visually consistent across mm/px/pt.
    return new UnitManager(store.schema.unit).fromPixels(big ? 10 : 1, 96, 1)
  }

  function selectAll() {
    // Mirrors CanvasContextMenu: hidden elements stay out of selection so
    // bulk drag/delete cannot mutate invisible nodes.
    store.selection.selectMultiple(
      store.schema.elements.filter(el => !el.hidden).map(el => el.id),
    )
  }

  function copy() {
    const nodes = selectedNodes()
    if (nodes.length === 0)
      return
    store.clipboard = nodes.map(n => deepClone(n))
  }

  function cut() {
    const nodes = selectedNodes()
    if (nodes.length === 0)
      return
    store.clipboard = nodes.map(n => deepClone(n))
    const elements = store.schema.elements
    store.commands.beginTransaction('Cut')
    try {
      for (const node of nodes)
        store.commands.execute(new RemoveMaterialCommand(elements, node.id))
      store.commands.commitTransaction()
    }
    catch (err) {
      store.commands.rollbackTransaction()
      throw err
    }
    store.selection.clear()
  }

  function paste() {
    if (store.clipboard.length === 0)
      return
    const elements = store.schema.elements
    const offset = pasteOffset()
    const newIds: string[] = []
    store.commands.beginTransaction('Paste')
    try {
      for (const node of store.clipboard) {
        const pasted: MaterialNode = {
          ...deepClone(node),
          id: generateId('el'),
          x: node.x + offset,
          y: node.y + offset,
        }
        store.commands.execute(new AddMaterialCommand(elements, pasted))
        newIds.push(pasted.id)
      }
      store.commands.commitTransaction()
    }
    catch (err) {
      store.commands.rollbackTransaction()
      throw err
    }
    store.selection.selectMultiple(newIds)
  }

  function duplicate() {
    const nodes = selectedNodes()
    if (nodes.length === 0)
      return
    const elements = store.schema.elements
    const offset = pasteOffset()
    const newIds: string[] = []
    store.commands.beginTransaction('Duplicate')
    try {
      for (const node of nodes) {
        const dup: MaterialNode = {
          ...deepClone(node),
          id: generateId('el'),
          x: node.x + offset,
          y: node.y + offset,
        }
        store.commands.execute(new AddMaterialCommand(elements, dup))
        newIds.push(dup.id)
      }
      store.commands.commitTransaction()
    }
    catch (err) {
      store.commands.rollbackTransaction()
      throw err
    }
    store.selection.selectMultiple(newIds)
  }

  function remove() {
    const nodes = selectedNodes().filter(n => !n.locked)
    if (nodes.length === 0)
      return
    const elements = store.schema.elements
    store.commands.beginTransaction('Delete')
    try {
      for (const node of nodes)
        store.commands.execute(new RemoveMaterialCommand(elements, node.id))
      store.commands.commitTransaction()
    }
    catch (err) {
      store.commands.rollbackTransaction()
      throw err
    }
    store.selection.clear()
  }

  function nudge(dx: number, dy: number) {
    const nodes = selectedNodes().filter(isInteractable)
    if (nodes.length === 0)
      return
    const elements = store.schema.elements
    store.commands.beginTransaction('Nudge')
    try {
      for (const node of nodes) {
        store.commands.execute(
          new MoveMaterialCommand(elements, node.id, {
            x: node.x + dx,
            y: node.y + dy,
          }),
        )
      }
      store.commands.commitTransaction()
    }
    catch (err) {
      store.commands.rollbackTransaction()
      throw err
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    // Behaviors / input fields take precedence.
    if (store.editingSession.isActive)
      return
    if (isEditableTarget(e.target))
      return
    if (!withinContainer(e.target))
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
          copy()
          return
        case 'x':
          e.preventDefault()
          cut()
          return
        case 'v':
          e.preventDefault()
          paste()
          return
        case 'd':
          e.preventDefault()
          duplicate()
          return
      }
    }

    if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (store.selection.isEmpty)
        return
      e.preventDefault()
      remove()
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
