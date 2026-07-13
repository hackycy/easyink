import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { LayoutDocument, LayoutFragment } from './layout-plan'
import type { MaterialLayoutPlan } from './material-layout-plan'
import { rectsIntersect } from './geometry'
import { createFragmentFromNode } from './layout-plan'
import { freezeMaterialLayoutPlan } from './material-layout-plan'
import { resolvePageModel } from './page-model'

export interface RunLayoutPipelineOptions {
  originalSchema?: DocumentSchema
  plans?: ReadonlyMap<string, MaterialLayoutPlan>
}

export function runLayoutPipeline(
  schema: DocumentSchema,
  options: RunLayoutPipelineOptions = {},
): LayoutDocument {
  const plans = options.plans ?? new Map()
  const reflowStrategy = schema.page.reflow?.strategy ?? inferReflowStrategy(schema)
  const elements = schema.elements.filter(node => plans.has(node.id))
  const originalElements = (options.originalSchema?.elements ?? schema.elements)
    .filter(node => plans.has(node.id))
  const reflowResult = reflowStrategy === 'flow-y'
    ? reflowPlans(originalElements, elements, plans)
    : { plans, diagnostics: [] }
  const pageModel = resolvePageModel(schema)
  const fragments = elements.map(node => createFragmentFromNode(node, reflowResult.plans.get(node.id)!))

  return {
    width: pageModel.width,
    height: resolveDocumentHeight(schema, fragments),
    fragments,
    diagnostics: reflowResult.diagnostics,
  }
}

function reflowPlans(
  originalElements: MaterialNode[],
  elements: MaterialNode[],
  sourcePlans: ReadonlyMap<string, MaterialLayoutPlan>,
): { plans: ReadonlyMap<string, MaterialLayoutPlan>, diagnostics: LayoutDocument['diagnostics'] } {
  const originalById = new Map(originalElements.map(node => [node.id, node]))
  const order = originalElements.map((node, index) => ({ node, index })).sort((left, right) =>
    left.node.y - right.node.y || left.node.x - right.node.x || left.index - right.index)
  const translations = new Map<string, number>()
  let currentBandY: number | undefined
  let accumulatedDelta = 0
  let pendingBandDelta = 0
  for (const entry of order) {
    if (currentBandY === undefined) {
      currentBandY = entry.node.y
    }
    else if (entry.node.y !== currentBandY) {
      accumulatedDelta += pendingBandDelta
      pendingBandDelta = 0
      currentBandY = entry.node.y
    }
    const plan = sourcePlans.get(entry.node.id)
    const participates = readParticipates(entry.node)
    translations.set(entry.node.id, participates ? accumulatedDelta : 0)
    if (participates)
      pendingBandDelta += (plan?.borderBox.height ?? entry.node.height) - entry.node.height
  }

  const plans = new Map<string, MaterialLayoutPlan>()
  for (const node of elements) {
    const plan = sourcePlans.get(node.id)!
    const delta = translations.get(node.id) ?? 0
    plans.set(node.id, delta === 0 ? plan : translatePlanBlock(plan, delta))
  }

  const diagnostics: LayoutDocument['diagnostics'] = []
  for (const flowNode of elements) {
    if (!readParticipates(flowNode) || (translations.get(flowNode.id) ?? 0) === 0)
      continue
    const originalFlow = originalById.get(flowNode.id)
    const flowPlan = plans.get(flowNode.id)
    if (!originalFlow || !flowPlan)
      continue
    for (const fixedNode of elements) {
      if (fixedNode.id === flowNode.id || readParticipates(fixedNode))
        continue
      const originalFixed = originalById.get(fixedNode.id)
      const fixedPlan = plans.get(fixedNode.id)
      if (!originalFixed || !fixedPlan || rectsIntersect(originalFlow, originalFixed) || !rectsIntersect(flowPlan.borderBox, fixedPlan.borderBox))
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
  return { plans, diagnostics }
}

function translatePlanBlock(plan: MaterialLayoutPlan, delta: number): MaterialLayoutPlan {
  return freezeMaterialLayoutPlan({
    ...plan,
    borderBox: { ...plan.borderBox, y: plan.borderBox.y + delta },
    contentBox: { ...plan.contentBox, y: plan.contentBox.y + delta },
    slotBoxes: plan.slotBoxes.map(slot => ({ ...slot, box: { ...slot.box, y: slot.box.y + delta } })),
  })
}

function readParticipates(node: MaterialNode): boolean {
  const placement = node.output.placement
  return placement?.mode != null ? placement.mode !== 'fixed' : (node.model as Record<string, unknown>).layoutMode !== 'fixed'
}

function inferReflowStrategy(schema: DocumentSchema): NonNullable<DocumentSchema['page']['reflow']>['strategy'] {
  if (schema.page.layout?.strategy === 'stack-flow')
    return 'flow-y'
  return 'measure-only'
}

function resolveDocumentHeight(schema: DocumentSchema, fragments: LayoutFragment[]): number {
  let contentBottom = 0
  for (const fragment of fragments) {
    const bottom = fragment.plan.borderBox.y + fragment.plan.borderBox.height
    if (bottom > contentBottom)
      contentBottom = bottom
  }
  return Math.max(schema.page.height, contentBottom)
}
