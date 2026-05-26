import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { RemoveMaterialCommand, UpdateMaterialMetaCommand } from '@easyink/core'
import { removeFromSelection } from './selection-api'

type MaterialMetaUpdates = Partial<Record<'hidden' | 'locked', boolean | undefined>>

function runTransaction<T>(store: DesignerStore, label: string, fn: () => T): T {
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

export function updateMaterialMeta(
  store: DesignerStore,
  label: string,
  nodes: readonly MaterialNode[],
  updates: MaterialMetaUpdates,
): number {
  if (nodes.length === 0)
    return 0

  runTransaction(store, label, () => {
    for (const node of nodes)
      store.commands.execute(new UpdateMaterialMetaCommand(store.schema.elements, node.id, updates))
  })
  return nodes.length
}

export function toggleMaterialHidden(store: DesignerStore, node: MaterialNode): boolean {
  if (node.locked)
    return false
  const hidden = node.hidden !== true
  updateMaterialMeta(store, hidden ? 'Hide' : 'Show', [node], { hidden })
  return true
}

export function deleteMaterialNodes(store: DesignerStore, nodes: readonly MaterialNode[]): number {
  const deletableNodes = nodes.filter(node => !node.locked)
  if (deletableNodes.length === 0)
    return 0

  runTransaction(store, 'Delete', () => {
    for (const node of deletableNodes)
      store.commands.execute(new RemoveMaterialCommand(store.schema.elements, node.id, store.schema))
  })

  removeFromSelection(store, deletableNodes.map(node => node.id))
  return deletableNodes.length
}
