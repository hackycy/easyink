import type { MaterialNode } from '@easyink/schema'
import type { BindingFormatDiagnostic } from './binding-format'
import type { MaterialConditionCapability } from './condition'
import type { Rect } from './geometry'
import type {
  LayoutConstraints,
  MaterialFragmentPlan,
  MaterialLayoutPlan,
  MaterialRenderBudgetToken,
  MaterialRenderNodeKind,
  MaterialViewerLayoutFacet,
} from './material-layout-plan'
import type { SanitizedMarkup, ViewerRenderTree } from './viewer-render-tree'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans } from './material-layout-plan'
import { VIEWER_TREE_ABSOLUTE_MAX_NODES, viewerFragment } from './viewer-render-tree'

export interface ViewerRenderCapabilities {
  sanitizeMarkup: (input: { format: 'svg', source: string }) => SanitizedMarkup
}

export interface ViewerFacetCapabilities {
  sanitizedMarkup?: boolean
  imperativeDom?: readonly string[]
}

/**
 * Viewer render context passed to each material's render function.
 * Provides document-level unit and zoom for physical unit calculations.
 */
export interface ViewerRenderContext {
  readonly data: Readonly<Record<string, unknown>>
  readonly resolvedModel: Readonly<Record<string, unknown>>
  readonly instanceKey: string
  readonly layoutPlan: MaterialLayoutPlan
  readonly fragmentPlan: MaterialFragmentPlan
  readonly renderSlot: (slotInstanceKey: string) => ViewerRenderTree
  readonly renderBudget: MaterialRenderBudgetToken
  readonly pageIndex: number
  /** Canonical document unit used for geometry and conversion. */
  readonly unit: LayoutConstraints['unit']
  /** Browser CSS length unit. Canonical `inch` is emitted as CSS `in`. */
  readonly cssUnit: ViewerCssUnit
  readonly zoom: number
  readonly capabilities: ViewerRenderCapabilities
  /** Host-rendered slot output keyed by the manifest slot key. */
  readonly slotOutputs?: Readonly<Record<string, readonly ViewerRenderTree[]>>
  readonly reportDiagnostic?: (diagnostic: BindingFormatDiagnostic & { nodeId?: string }) => void
}

export type ViewerCssUnit = 'mm' | 'pt' | 'px' | 'in'

export function toViewerCssUnit(unit: LayoutConstraints['unit']): ViewerCssUnit {
  return unit === 'inch' ? 'in' : unit
}

export interface FallbackViewerRenderContextInput {
  readonly nodeId: string
  readonly nodeRevision: number
  readonly instanceKey: string
  readonly resolvedModel: Readonly<Record<string, unknown>>
  readonly pageIndex: number
  readonly unit: LayoutConstraints['unit']
  readonly width: number
  readonly height: number
  readonly fragmentBox: Readonly<Rect>
  readonly data: Readonly<Record<string, unknown>>
  readonly zoom: number
  readonly capabilities: ViewerRenderCapabilities
  readonly maxNodes?: number
  readonly slotOutputs?: ViewerRenderContext['slotOutputs']
  readonly reportDiagnostic?: ViewerRenderContext['reportDiagnostic']
}

export function createFallbackViewerRenderContext(input: FallbackViewerRenderContextInput): ViewerRenderContext {
  const plans = createNonFragmentingMaterialPlans({
    instanceKey: input.instanceKey,
    nodeId: input.nodeId,
    nodeRevision: input.nodeRevision,
    constraintKey: createLayoutConstraintKey({
      availableWidth: input.width,
      availableHeight: input.height,
      unit: input.unit,
      writingMode: 'horizontal-tb',
    }),
    pageIndex: input.pageIndex,
    borderBox: { x: 0, y: 0, width: input.width, height: input.height },
    fragmentBox: input.fragmentBox,
  })
  const committedSlotInstanceKeys = new Set(plans.layoutPlan.slotBoxes.map(slot => slot.slotInstanceKey))
  const context: ViewerRenderContext = {
    data: input.data,
    resolvedModel: input.resolvedModel,
    instanceKey: input.instanceKey,
    layoutPlan: plans.layoutPlan,
    fragmentPlan: plans.fragmentPlan,
    renderSlot: slotInstanceKey => viewerFragment(
      committedSlotInstanceKeys.has(slotInstanceKey)
        ? input.slotOutputs?.[slotInstanceKey] ?? []
        : [],
    ),
    renderBudget: createFallbackRenderBudget(input.maxNodes),
    pageIndex: input.pageIndex,
    unit: input.unit,
    cssUnit: toViewerCssUnit(input.unit),
    zoom: input.zoom,
    capabilities: input.capabilities,
    slotOutputs: input.slotOutputs,
    reportDiagnostic: input.reportDiagnostic,
  }
  return Object.freeze(context)
}

function createFallbackRenderBudget(configuredMaxNodes?: number): MaterialRenderBudgetToken {
  const maxNodes = configuredMaxNodes === undefined ? VIEWER_TREE_ABSOLUTE_MAX_NODES : configuredMaxNodes
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 0 || maxNodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
    throw new Error('VIEWER_RENDER_BUDGET_INVALID')

  let nodesUsed = 0
  return Object.freeze({
    maxNodes,
    get nodesUsed() {
      return nodesUsed
    },
    reserveNodes(_kind: MaterialRenderNodeKind, count: number) {
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error('VIEWER_RENDER_BUDGET_RESERVATION_INVALID')
      if (nodesUsed + count > maxNodes)
        throw new Error('VIEWER_RENDER_BUDGET_EXCEEDED')
      nodesUsed += count
    },
  })
}

export interface ViewerRenderOutput {
  tree: ViewerRenderTree
}

export interface MaterialViewerExtension {
  render: (node: MaterialNode, context: ViewerRenderContext) => ViewerRenderOutput
  condition?: MaterialConditionCapability
}

export interface MaterialViewerFacet {
  readonly extension: MaterialViewerExtension
  readonly layout?: MaterialViewerLayoutFacet
  readonly capabilities: ViewerFacetCapabilities
}
