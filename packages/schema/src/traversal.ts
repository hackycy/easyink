import type { DocumentSchema, MaterialNode } from './types'

/**
 * Traverse all material nodes in a schema (depth-first).
 * Callback receives the node and its parent (undefined for top-level).
 */
export function traverseNodes(
  schema: DocumentSchema,
  callback: (node: MaterialNode, parent?: MaterialNode) => void | false,
): void {
  for (const node of schema.elements) {
    if (walkNode(node, undefined, callback) === false)
      return
  }
}

function walkNode(
  node: MaterialNode,
  parent: MaterialNode | undefined,
  callback: (node: MaterialNode, parent?: MaterialNode) => void | false,
): void | false {
  if (callback(node, parent) === false)
    return false
  for (const children of Object.values(node.slots)) {
    for (const child of children) {
      if (walkNode(child, node, callback) === false)
        return false
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
