import type { CompiledMaterialProfile } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import {
  AddMaterialCommand,
  cloneMaterialGraph,
  isInteractable,
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
  // Tasks 11-12 make the active profile mandatory at the Designer host boundary.
  materialProfile?: CompiledMaterialProfile,
): ClipboardActions {
  function snapshotSelectedNodes(): MaterialNode[] {
    return [...getSelectedNodes()]
  }

  function cloneNodes(nodes: readonly MaterialNode[], rekey: boolean): MaterialNode[] {
    if (!materialProfile) {
      const clones = nodes.map(node => deepClone(node))
      if (rekey)
        rekeyFallbackNodes(clones)
      return clones
    }
    const result = cloneMaterialGraph(nodes, materialProfile, {
      createIdentity: identity => rekey ? generateId(identity.kind.replaceAll('.', '-')) : identity.value,
    })
    const error = result.diagnostics.find(item => item.severity === 'error')
    if (error)
      throw new Error(`${error.code}: ${error.message}`)
    return result.roots
  }

  function rekeyFallbackNodes(roots: readonly MaterialNode[]): void {
    const reserved = new Set<string>()
    const existing = [...store.schema.elements]
    while (existing.length > 0) {
      const node = existing.pop()!
      reserved.add(node.id)
      Object.values(node.slots).forEach(children => existing.push(...children))
    }
    const nodes: MaterialNode[] = []
    const stack = [...roots]
    while (stack.length > 0) {
      const node = stack.pop()!
      nodes.push(node)
      Object.values(node.slots).forEach(children => stack.push(...children))
    }
    const identityMap = new Map<MaterialNode, string>()
    for (const node of nodes) {
      let next = generateId('el')
      while (reserved.has(next))
        next = generateId('el')
      reserved.add(next)
      identityMap.set(node, next)
    }
    for (const [node, identity] of identityMap)
      node.id = identity
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
    const nodes = snapshotSelectedNodes().filter(isInteractable)
    if (nodes.length === 0)
      return
    store.clipboard = cloneNodes(nodes, false)
  }

  function cutSelection() {
    const nodes = snapshotSelectedNodes().filter(isInteractable)
    if (nodes.length === 0)
      return

    store.clipboard = cloneNodes(nodes, false)
    const elements = store.schema.elements

    runTransaction('Cut', () => {
      for (const node of nodes)
        store.commands.execute(new RemoveMaterialCommand(elements, node.id, store.schema))
    })

    clearSelection(store)
  }

  function pasteClipboard() {
    if (store.clipboard.length === 0)
      return

    const elements = store.schema.elements
    const offset = pasteOffset()
    const newIds: string[] = []
    const cloned = cloneNodes(store.clipboard, true)

    runTransaction('Paste', () => {
      for (const node of cloned) {
        const pasted: MaterialNode = {
          ...node,
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
    const nodes = snapshotSelectedNodes().filter(isInteractable)
    if (nodes.length === 0)
      return

    const elements = store.schema.elements
    const offset = pasteOffset()
    const newIds: string[] = []
    const cloned = cloneNodes(nodes, true)

    runTransaction('Duplicate', () => {
      for (const node of cloned) {
        const duplicate: MaterialNode = {
          ...node,
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
    const nodes = snapshotSelectedNodes().filter(isInteractable)
    if (nodes.length === 0)
      return

    const elements = store.schema.elements

    runTransaction('Delete', () => {
      for (const node of nodes)
        store.commands.execute(new RemoveMaterialCommand(elements, node.id, store.schema))
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
