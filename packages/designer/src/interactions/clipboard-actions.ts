import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import {
  AddMaterialCommand,
  RemoveMaterialCommand,
  UnitManager,
} from '@easyink/core'
import { deepClone, generateId } from '@easyink/shared'
import { clearSelection, selectMany } from './selection-api'

export interface ClipboardActions {
  copySelection: () => void
  cutSelection: () => void
  pasteClipboard: () => void
  duplicateSelection: () => void
  deleteSelection: () => void
}

export function createClipboardActions(
  store: DesignerStore,
  getSelectedNodes: () => readonly MaterialNode[],
): ClipboardActions {
  function snapshotSelectedNodes(): MaterialNode[] {
    return [...getSelectedNodes()]
  }

  function cloneNodes(nodes: readonly MaterialNode[]): MaterialNode[] {
    return nodes.map(node => deepClone(node))
  }

  function pasteOffset(): number {
    return new UnitManager(store.schema.unit).fromPixels(10, 96, 1)
  }

  function runTransaction<T>(label: string, fn: () => T): T {
    store.commands.beginTransaction(label)
    try {
      const result = fn()
      store.commands.commitTransaction()
      return result
    }
    catch (error) {
      store.commands.rollbackTransaction()
      throw error
    }
  }

  function copySelection() {
    const nodes = snapshotSelectedNodes()
    if (nodes.length === 0)
      return
    store.clipboard = cloneNodes(nodes)
  }

  function cutSelection() {
    const nodes = snapshotSelectedNodes()
    if (nodes.length === 0)
      return

    store.clipboard = cloneNodes(nodes)
    const elements = store.schema.elements

    runTransaction('Cut', () => {
      for (const node of nodes)
        store.commands.execute(new RemoveMaterialCommand(elements, node.id))
    })

    clearSelection(store)
  }

  function pasteClipboard() {
    if (store.clipboard.length === 0)
      return

    const elements = store.schema.elements
    const offset = pasteOffset()
    const newIds: string[] = []

    runTransaction('Paste', () => {
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
    })

    selectMany(store, newIds)
  }

  function duplicateSelection() {
    const nodes = snapshotSelectedNodes()
    if (nodes.length === 0)
      return

    const elements = store.schema.elements
    const offset = pasteOffset()
    const newIds: string[] = []

    runTransaction('Duplicate', () => {
      for (const node of nodes) {
        const duplicate: MaterialNode = {
          ...deepClone(node),
          id: generateId('el'),
          x: node.x + offset,
          y: node.y + offset,
        }
        store.commands.execute(new AddMaterialCommand(elements, duplicate))
        newIds.push(duplicate.id)
      }
    })

    selectMany(store, newIds)
  }

  function deleteSelection() {
    const nodes = snapshotSelectedNodes().filter(node => !node.locked)
    if (nodes.length === 0)
      return

    const elements = store.schema.elements

    runTransaction('Delete', () => {
      for (const node of nodes)
        store.commands.execute(new RemoveMaterialCommand(elements, node.id))
    })

    clearSelection(store)
  }

  return {
    copySelection,
    cutSelection,
    pasteClipboard,
    duplicateSelection,
    deleteSelection,
  }
}
