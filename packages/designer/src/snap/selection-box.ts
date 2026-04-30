import type { Rect } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { getBoundingRect, getRotatedAABB } from '@easyink/core'

/**
 * Compute the bounding box of the given nodes using their visual size
 * (which may differ from `node.width / node.height` for materials with
 * virtual content, e.g. data-driven tables with placeholder rows). Each
 * node's contribution is its rotated AABB so that rotated elements
 * report their true visual extent.
 *
 * Returns `undefined` when the input list is empty.
 */
export function getSelectionBox(
  nodes: MaterialNode[],
  getVisualSize: (n: MaterialNode) => { width: number, height: number },
): Rect | undefined {
  if (nodes.length === 0)
    return undefined

  const rects: Rect[] = nodes.map((n) => {
    const size = getVisualSize(n)
    return getRotatedAABB(
      { x: n.x, y: n.y, width: size.width, height: size.height },
      n.rotation,
    )
  })

  return getBoundingRect(rects)
}
