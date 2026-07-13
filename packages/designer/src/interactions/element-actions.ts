import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { createDesignerDocumentOperation, normalizeDocumentNodeRoots, removeDocumentNodes, updateDraftNodeEditorState } from '../editing/document-recipes'
import { removeFromSelection } from './selection-api'

type MaterialMetaUpdates = Partial<Record<'hidden' | 'locked', boolean | undefined>>

export function updateMaterialMeta(
  store: DesignerStore,
  label: string,
  nodes: readonly MaterialNode[],
  updates: MaterialMetaUpdates,
): number {
  if (nodes.length === 0)
    return 0

  store.documentTransactions.transact((draft) => {
    for (const node of nodes)
      updateDraftNodeEditorState(draft, store, node.id, updates)
  }, {
    label,
    operation: createDesignerDocumentOperation(store, 'material.editor-state', nodes.map(node => `node:${node.id}`), ['/editorState'], false),
  })
  return nodes.length
}

export function toggleMaterialHidden(store: DesignerStore, node: MaterialNode): boolean {
  if (node.editorState?.locked)
    return false
  const hidden = node.editorState?.hidden !== true
  updateMaterialMeta(store, hidden ? 'Hide' : 'Show', [node], { hidden })
  return true
}

export function deleteMaterialNodes(store: DesignerStore, nodes: readonly MaterialNode[]): number {
  const deletableNodes = normalizeDocumentNodeRoots(nodes.filter(node => !node.editorState?.locked))
  if (deletableNodes.length === 0)
    return 0

  store.documentTransactions.transact((draft) => {
    removeDocumentNodes(draft, deletableNodes.map(node => node.id))
  }, {
    label: 'Delete',
    operation: createDesignerDocumentOperation(store, 'material.delete', deletableNodes.map(node => `node:${node.id}`), ['/elements', '/slots', '/groups'], true),
  })

  removeFromSelection(store, deletableNodes.map(node => node.id))
  return deletableNodes.length
}
