import type { MaterialRenderBudgetToken, MaterialRenderNodeKind } from '../material-layout-plan'
import type { ViewerRenderContext } from '../material-viewer'
import {
  createLayoutConstraintKey,
  createNonFragmentingMaterialPlans,
} from '../material-layout-plan'
import { viewerFragment } from '../viewer-render-tree'

const DEFAULT_MAX_NODES = 10_000

export function createTestViewerRenderContext(
  overrides: Partial<ViewerRenderContext> = {},
): ViewerRenderContext {
  const resolvedModel = overrides.resolvedModel ?? {}
  const instanceKey = overrides.instanceKey ?? 'test-instance'
  const pageIndex = overrides.pageIndex ?? 0
  const plans = createNonFragmentingMaterialPlans({
    instanceKey,
    nodeId: 'test-node',
    nodeRevision: 0,
    constraintKey: createLayoutConstraintKey({
      availableWidth: 1,
      availableHeight: 1,
      unit: 'mm',
      writingMode: 'horizontal-tb',
    }),
    pageIndex,
    borderBox: { x: 0, y: 0, width: 1, height: 1 },
    fragmentBox: { x: 0, y: 0, width: 1, height: 1 },
  })
  const context: ViewerRenderContext = {
    data: {},
    resolvedModel,
    instanceKey,
    layoutPlan: plans.layoutPlan,
    fragmentPlan: plans.fragmentPlan,
    renderSlot: slotInstanceKey => viewerFragment(
      context.layoutPlan.slotBoxes.some(slot => slot.slotInstanceKey === slotInstanceKey)
        ? context.slotOutputs?.[slotInstanceKey] ?? []
        : [],
    ),
    renderBudget: createTestRenderBudget(),
    pageIndex,
    unit: 'mm',
    zoom: 1,
    capabilities: {
      sanitizeMarkup() {
        throw new Error('TEST_VIEWER_SANITIZED_MARKUP_NOT_CONFIGURED')
      },
    },
    ...overrides,
  }
  return context
}

function createTestRenderBudget(): MaterialRenderBudgetToken {
  let nodesUsed = 0
  return Object.freeze({
    maxNodes: DEFAULT_MAX_NODES,
    get nodesUsed() {
      return nodesUsed
    },
    reserveNodes(_kind: MaterialRenderNodeKind, count: number) {
      if (!Number.isSafeInteger(count) || count < 0 || nodesUsed + count > DEFAULT_MAX_NODES)
        throw new Error('TEST_VIEWER_RENDER_BUDGET_EXCEEDED')
      nodesUsed += count
    },
  })
}
