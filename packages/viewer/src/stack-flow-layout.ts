import type { MaterialNode } from '@easyink/schema'
import type { ViewerDiagnosticEvent } from './types'
import { getTableDataDesignerVisualHeight, isTableDataNodeForLayout } from '@easyink/material-table-data'

export type StackLayoutMode = 'flow' | 'fixed'

export interface StackFlowLayoutResult {
  elements: MaterialNode[]
  diagnostics: ViewerDiagnosticEvent[]
}

interface OrderedNode {
  index: number
  original: MaterialNode
  measured: MaterialNode
}

/**
 * Stack-mode flow resolver.
 *
 * Rules for v1:
 * - default every node to flow participation
 * - layoutMode='fixed' keeps original document coordinates
 * - flow nodes shift by the accumulated height delta of earlier y-bands
 * - nodes in the same original y-band do not shift each other
 */
export function applyStackFlowLayout(
  originalElements: MaterialNode[],
  measuredElements: MaterialNode[],
): StackFlowLayoutResult {
  const measuredById = new Map(measuredElements.map(node => [node.id, node]))
  const originalById = new Map(originalElements.map(node => [node.id, node]))

  const ordered = originalElements
    .map((original, index): OrderedNode => ({
      index,
      original,
      measured: measuredById.get(original.id) ?? original,
    }))
    .sort((left, right) => {
      if (left.original.y !== right.original.y)
        return left.original.y - right.original.y
      if (left.original.x !== right.original.x)
        return left.original.x - right.original.x
      return left.index - right.index
    })

  let currentBandY: number | null = null
  let accumulatedDelta = 0
  let pendingBandDelta = 0

  const laidOutById = new Map<string, MaterialNode>()

  for (const entry of ordered) {
    if (currentBandY === null) {
      currentBandY = entry.original.y
    }
    else if (entry.original.y !== currentBandY) {
      accumulatedDelta += pendingBandDelta
      pendingBandDelta = 0
      currentBandY = entry.original.y
    }

    const layoutMode = resolveStackLayoutMode(entry.measured)
    const nextY = layoutMode === 'flow'
      ? entry.original.y + accumulatedDelta
      : entry.original.y

    const laidOutNode = nextY === entry.measured.y
      ? entry.measured
      : { ...entry.measured, y: nextY }

    laidOutById.set(entry.original.id, laidOutNode)

    if (layoutMode === 'flow') {
      pendingBandDelta += getFlowFootprintHeight(entry.measured) - getOriginalFlowFootprintHeight(entry.original)
    }
  }

  const elements = measuredElements.map(node => laidOutById.get(node.id) ?? node)
  const diagnostics = collectFixedOverlapDiagnostics(elements, originalById)

  return { elements, diagnostics }
}

export function resolveStackLayoutMode(node: MaterialNode): StackLayoutMode {
  return node.props.layoutMode === 'fixed' ? 'fixed' : 'flow'
}

function getOriginalFlowFootprintHeight(node: MaterialNode): number {
  if (isTableDataNodeForLayout(node))
    return getTableDataDesignerVisualHeight(node)
  return getFlowFootprintHeight(node)
}

function getFlowFootprintHeight(node: MaterialNode): number {
  return node.height
}

function collectFixedOverlapDiagnostics(
  elements: MaterialNode[],
  originalById: Map<string, MaterialNode>,
): ViewerDiagnosticEvent[] {
  const flowNodes = elements.filter(node => resolveStackLayoutMode(node) === 'flow')
  const fixedNodes = elements.filter(node => resolveStackLayoutMode(node) === 'fixed')
  const diagnostics: ViewerDiagnosticEvent[] = []

  for (const flowNode of flowNodes) {
    const originalFlow = originalById.get(flowNode.id)
    if (!originalFlow || originalFlow.y === flowNode.y)
      continue

    for (const fixedNode of fixedNodes) {
      if (flowNode.id === fixedNode.id)
        continue

      const originalFixed = originalById.get(fixedNode.id)
      if (!originalFixed)
        continue

      const overlappedBefore = rectsIntersect(originalFlow, originalFixed)
      const overlappedAfter = rectsIntersect(flowNode, fixedNode)
      if (overlappedBefore || !overlappedAfter)
        continue

      diagnostics.push({
        category: 'viewer',
        severity: 'warning',
        code: 'STACK_FLOW_FIXED_OVERLAP',
        message: `Flow element ${flowNode.id} overlaps fixed element ${fixedNode.id} after stack reflow`,
        nodeId: flowNode.id,
        scope: 'material',
        detail: { flowNodeId: flowNode.id, fixedNodeId: fixedNode.id },
      })
    }
  }

  return diagnostics
}

function rectsIntersect(left: MaterialNode, right: MaterialNode): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}
