import type { DocumentSchema, MaterialNode } from '@easyink/schema'

/** Remove a node subtree from the canonical document graph. Intended for draft recipes. */
export function removeDocumentNode(document: DocumentSchema, nodeId: string): MaterialNode {
  const location = findDocumentNodeCollection(document.elements, nodeId)
  if (!location)
    throw new Error(`Document node "${nodeId}" not found`)

  const [removed] = location.collection.splice(location.index, 1)
  const removedIds = collectNodeIds(removed!)
  if (document.groups) {
    document.groups = document.groups
      .map(group => ({ ...group, memberIds: group.memberIds.filter(id => !removedIds.has(id)) }))
      .filter(group => group.memberIds.length >= 2)
  }
  return removed!
}

function findDocumentNodeCollection(
  collection: MaterialNode[],
  nodeId: string,
): { collection: MaterialNode[], index: number } | undefined {
  const index = collection.findIndex(node => node.id === nodeId)
  if (index >= 0)
    return { collection, index }
  for (const node of collection) {
    for (const children of Object.values(node.slots)) {
      const nested = findDocumentNodeCollection(children, nodeId)
      if (nested)
        return nested
    }
  }
  return undefined
}

function collectNodeIds(root: MaterialNode): Set<string> {
  const result = new Set<string>()
  const pending = [root]
  while (pending.length > 0) {
    const node = pending.pop()!
    result.add(node.id)
    for (const children of Object.values(node.slots))
      pending.push(...children)
  }
  return result
}
