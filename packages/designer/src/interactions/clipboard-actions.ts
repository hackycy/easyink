import type { CompiledMaterialProfile } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import {
  cloneMaterialGraph,
  isInteractable,
  UnitManager,
} from '@easyink/core'
import { deepClone, generateId } from '@easyink/shared'
import { appendDocumentNodes, createDesignerDocumentOperation, normalizeDocumentNodeRoots, removeDocumentNodes } from '../editing/document-recipes'
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

  function copySelection() {
    const nodes = snapshotSelectedNodes().filter(isInteractable)
    if (nodes.length === 0)
      return
    store.clipboard = cloneNodes(nodes, false)
  }

  function cutSelection() {
    const nodes = normalizeDocumentNodeRoots(snapshotSelectedNodes().filter(isInteractable))
    if (nodes.length === 0)
      return

    store.clipboard = cloneNodes(nodes, false)
    const targetIds = nodes.map(node => `node:${node.id}`)
    store.documentTransactions.transact((draft) => {
      removeDocumentNodes(draft, nodes.map(node => node.id))
    }, {
      label: 'Cut',
      operation: createDesignerDocumentOperation(store, 'clipboard.cut', targetIds, ['/elements', '/slots', '/groups'], true),
    })

    clearSelection(store)
  }

  function pasteClipboard() {
    if (store.clipboard.length === 0)
      return

    const offset = pasteOffset()
    const newIds: string[] = []
    const cloned = cloneNodes(store.clipboard, true)

    const pasted = cloned.map(node => ({ ...node, x: node.x + offset, y: node.y + offset }))
    newIds.push(...pasted.map(node => node.id))
    store.documentTransactions.transact((draft) => {
      appendDocumentNodes(draft, pasted)
    }, {
      label: 'Paste',
      operation: createDesignerDocumentOperation(store, 'clipboard.paste', pasted.map(node => `node:${node.id}`), ['/elements'], true),
    })

    selectMany(store, newIds)
  }

  function duplicateSelection() {
    const nodes = snapshotSelectedNodes().filter(isInteractable)
    if (nodes.length === 0)
      return

    const offset = pasteOffset()
    const newIds: string[] = []
    const cloned = cloneNodes(nodes, true)

    const duplicates = cloned.map(node => ({ ...node, x: node.x + offset, y: node.y + offset }))
    newIds.push(...duplicates.map(node => node.id))
    store.documentTransactions.transact((draft) => {
      appendDocumentNodes(draft, duplicates)
    }, {
      label: 'Duplicate',
      operation: createDesignerDocumentOperation(store, 'clipboard.duplicate', duplicates.map(node => `node:${node.id}`), ['/elements'], true),
    })

    selectMany(store, newIds)
  }

  function deleteSelection() {
    const nodes = normalizeDocumentNodeRoots(snapshotSelectedNodes().filter(isInteractable))
    if (nodes.length === 0)
      return

    store.documentTransactions.transact((draft) => {
      removeDocumentNodes(draft, nodes.map(node => node.id))
    }, {
      label: 'Delete',
      operation: createDesignerDocumentOperation(store, 'clipboard.delete', nodes.map(node => `node:${node.id}`), ['/elements', '/slots', '/groups'], true),
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
