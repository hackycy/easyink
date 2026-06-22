import type { MaterialNode } from '@easyink/schema'
import type { LayoutDiagnostic } from './layout-plan'
import { rectsIntersect } from './geometry'
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
  measured?: MaterialNode
}

interface ReflowNodePartition {
  flowNodes: MaterialNode[]
  fixedNodes: MaterialNode[]
}

export function runFlowYReflow(input: ReflowEngineInput): ReflowEngineResult {
  const measuredById = new Map(input.measuredElements.map(node => [node.id, node]))
  const originalById = new Map(input.originalElements.map(node => [node.id, node]))

  const ordered = input.originalElements
    .map((original, index): OrderedNode => ({
      index,
      original,
      measured: measuredById.get(original.id),
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
  const participatesById = new Map<string, boolean>()

  for (const entry of ordered) {
    if (currentBandY === null) {
      currentBandY = entry.original.y
    }
    else if (entry.original.y !== currentBandY) {
      accumulatedDelta += pendingBandDelta
      pendingBandDelta = 0
      currentBandY = entry.original.y
    }

    const flow = readNodeFlowConstraints(entry.measured ?? entry.original)
    participatesById.set(entry.original.id, flow.participates)
    const nextY = flow.participates
      ? entry.original.y + accumulatedDelta
      : entry.original.y

    if (entry.measured) {
      const laidOutNode = nextY === entry.measured.y
        ? entry.measured
        : { ...entry.measured, y: nextY }

      laidOutById.set(entry.original.id, laidOutNode)
    }

    if (flow.participates) {
      pendingBandDelta += (entry.measured?.height ?? 0) - entry.original.height
    }
  }

  const elements = input.measuredElements.map(node => laidOutById.get(node.id) ?? node)
  const partition = partitionReflowNodes(elements, participatesById)
  return {
    elements,
    diagnostics: collectFixedOverlapDiagnostics(partition, originalById),
  }
}

function partitionReflowNodes(
  elements: MaterialNode[],
  participatesById: ReadonlyMap<string, boolean>,
): ReflowNodePartition {
  const flowNodes: MaterialNode[] = []
  const fixedNodes: MaterialNode[] = []

  for (const node of elements) {
    const participates = participatesById.get(node.id) ?? readNodeFlowConstraints(node).participates
    if (participates)
      flowNodes.push(node)
    else
      fixedNodes.push(node)
  }

  return { flowNodes, fixedNodes }
}

function collectFixedOverlapDiagnostics(
  partition: ReflowNodePartition,
  originalById: Map<string, MaterialNode>,
): LayoutDiagnostic[] {
  const { flowNodes, fixedNodes } = partition
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
