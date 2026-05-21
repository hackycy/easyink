import type { MaterialNode } from '@easyink/schema'
import type { LayoutDiagnostic } from './layout-plan'
import { readNodeFlowConstraints } from './layout-plan'

export interface ReflowEngineInput {
  originalElements: MaterialNode[]
  measuredElements: MaterialNode[]
}

export interface ReflowEngineResult {
  elements: MaterialNode[]
  diagnostics: LayoutDiagnostic[]
}

interface OrderedNode {
  index: number
  original: MaterialNode
  measured: MaterialNode
}

export function runFlowYReflow(input: ReflowEngineInput): ReflowEngineResult {
  const measuredById = new Map(input.measuredElements.map(node => [node.id, node]))
  const originalById = new Map(input.originalElements.map(node => [node.id, node]))

  const ordered = input.originalElements
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

    const flow = readNodeFlowConstraints(entry.measured)
    const nextY = flow.participates
      ? entry.original.y + accumulatedDelta
      : entry.original.y

    const laidOutNode = nextY === entry.measured.y
      ? entry.measured
      : { ...entry.measured, y: nextY }

    laidOutById.set(entry.original.id, laidOutNode)

    if (flow.participates) {
      pendingBandDelta += entry.measured.height - entry.original.height
    }
  }

  const elements = input.measuredElements.map(node => laidOutById.get(node.id) ?? node)
  return {
    elements,
    diagnostics: collectFixedOverlapDiagnostics(elements, originalById),
  }
}

function collectFixedOverlapDiagnostics(
  elements: MaterialNode[],
  originalById: Map<string, MaterialNode>,
): LayoutDiagnostic[] {
  const flowNodes = elements.filter(node => readNodeFlowConstraints(node).participates)
  const fixedNodes = elements.filter(node => !readNodeFlowConstraints(node).participates)
  const diagnostics: LayoutDiagnostic[] = []

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
        code: 'FLOW_Y_FIXED_OVERLAP',
        severity: 'warning',
        message: `Flow element ${flowNode.id} overlaps fixed element ${fixedNode.id} after flow-y reflow`,
        stage: 'reflow',
        sourceNodeId: flowNode.id,
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
