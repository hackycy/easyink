import type { MaterialNode } from '@easyink/schema'
import type { BindingFormatDiagnostic } from './binding-format'
import type { MaterialConditionCapability } from './condition'
import type { LayoutDiagnostic, LayoutFragment } from './layout-plan'
import type {
  MaterialFragmentPlan,
  MaterialLayoutPlan,
  MaterialRenderBudgetToken,
  MaterialViewerLayoutFacet,
} from './material-layout-plan'
import type { SanitizedMarkup, ViewerRenderTree } from './viewer-render-tree'

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
  data: Readonly<Record<string, unknown>>
  resolvedModel: Readonly<Record<string, unknown>>
  instanceKey: string
  layoutPlan: MaterialLayoutPlan
  fragmentPlan: MaterialFragmentPlan
  renderSlot: (slotInstanceKey: string) => ViewerRenderTree
  renderBudget: MaterialRenderBudgetToken
  /** @deprecated Use resolvedModel. */
  resolvedProps: Record<string, unknown>
  pageIndex: number
  /** Document unit: 'mm' | 'pt' | 'px'. CSS unit suffix equals this value. */
  unit: string
  zoom: number
  capabilities: ViewerRenderCapabilities
  /** Host-rendered slot output keyed by the manifest slot key. */
  slotOutputs?: Readonly<Record<string, readonly ViewerRenderTree[]>>
  reportDiagnostic?: (diagnostic: BindingFormatDiagnostic & { nodeId?: string }) => void
}

export interface ViewerRenderOutput {
  tree: ViewerRenderTree
}

export interface ViewerRenderSize {
  width: number
  height: number
}

export interface ViewerMeasureContext {
  data: Record<string, unknown>
  unit: string
  reportDiagnostic?: (diagnostic: BindingFormatDiagnostic & { nodeId?: string }) => void
}

export interface ViewerMeasureResult {
  width: number
  height: number
  overflow?: boolean
}

export interface FragmentPaginateInput {
  fragment: LayoutFragment
  availableHeight: number
  pageContext: {
    pageIndex: number
  }
}

export interface FragmentPaginateResult {
  currentPage: LayoutFragment
  nextPage?: LayoutFragment
  diagnostics: LayoutDiagnostic[]
}

export interface FragmentPaginator {
  canPaginate: (node: MaterialNode) => boolean
  paginateFragment: (input: FragmentPaginateInput) => FragmentPaginateResult
}

export interface MaterialViewerExtension {
  render: (node: MaterialNode, context: ViewerRenderContext) => ViewerRenderOutput
  measure?: (node: MaterialNode, context: ViewerMeasureContext) => ViewerMeasureResult
  getRenderSize?: (node: MaterialNode, context: ViewerRenderContext) => Partial<ViewerRenderSize>
  fragmentPaginator?: FragmentPaginator
  condition?: MaterialConditionCapability
}

export interface MaterialViewerFacet {
  extension: MaterialViewerExtension
  layout?: MaterialViewerLayoutFacet
  capabilities: ViewerFacetCapabilities
}
