import type { DocumentSchema, MaterialNode } from './types'

/**
 * Traverse all material nodes in a schema (depth-first).
 * Callback receives the node and its parent (undefined for top-level).
 */
export function traverseNodes(
  schema: DocumentSchema,
  callback: (node: MaterialNode, parent?: MaterialNode) => void | false,
): void {
  const stack = schema.elements.map(node => ({ node, parent: undefined as MaterialNode | undefined })).reverse()
  const seen = new WeakSet<object>()
  while (stack.length > 0) {
    const { node, parent } = stack.pop()!
    if (seen.has(node))
      continue
    seen.add(node)
    if (callback(node, parent) === false)
      return
    const slots = Object.values(node.slots)
    for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) {
      const children = slots[slotIndex]!
      for (let index = children.length - 1; index >= 0; index -= 1)
        stack.push({ node: children[index]!, parent: node })
    }
  }
}

/**
 * Find a material node by ID.
 */
export function findNodeById(schema: DocumentSchema, id: string): MaterialNode | undefined {
  let found: MaterialNode | undefined
  traverseNodes(schema, (node) => {
    if (node.id === id) {
      found = node
      return false
    }
  })
  return found
}

/**
 * Find all material nodes matching a predicate.
 */
export function findNodes(
  schema: DocumentSchema,
  predicate: (node: MaterialNode) => boolean,
): MaterialNode[] {
  const results: MaterialNode[] = []
  traverseNodes(schema, (node) => {
    if (predicate(node)) {
      results.push(node)
    }
  })
  return results
}

/**
 * Count total number of material nodes.
 */
export function countNodes(schema: DocumentSchema): number {
  let count = 0
  traverseNodes(schema, () => {
    count++
  })
  return count
}
