import type { MaterialNode } from '@easyink/schema'
import type { MaterialFragmentPlan, MaterialLayoutPlan } from './material-layout-plan'

export interface LayoutDiagnostic {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  stage: 'page-model' | 'layout' | 'reflow' | 'pagination'
  sourceNodeId?: string
  detail?: unknown
}

export interface FlowBreakConstraints {
  keepTogether?: boolean
  pageBreakBefore?: boolean
  pageBreakAfter?: boolean
  widows?: number
  orphans?: number
}

export interface LayoutFragment {
  readonly node: Readonly<MaterialNode<unknown>>
  readonly plan: MaterialLayoutPlan
  readonly fragmentPlan?: MaterialFragmentPlan
}

export interface LayoutDocument {
  width: number
  height: number
  fragments: LayoutFragment[]
  diagnostics: LayoutDiagnostic[]
}

export interface OutputPagePlan {
  index: number
  sheetIndex: number
  width: number
  height: number
  yOffset: number
  fragments: readonly LayoutFragment[]
  pageContext: {
    pageNumber: number
    totalPages: number
    copyIndex?: number
  }
}
export function createFragmentFromNode(
  node: MaterialNode<unknown>,
  plan: MaterialLayoutPlan,
): LayoutFragment {
  return {
    node,
    plan,
  }
}

export function readNodeFlowConstraints(node: MaterialNode<unknown>): FlowBreakConstraints & { participates: boolean } {
  const model = node.model as Record<string, unknown>
  const placement = node.output.placement
  const breakConfig = node.output.break
  const participates = placement?.mode != null ? placement.mode !== 'fixed' : model.layoutMode !== 'fixed'
  return {
    participates,
    keepTogether: participates && (breakConfig?.keepTogether === true || model.keepTogether === true),
    pageBreakBefore: participates && (breakConfig?.before === 'page' || model.pageBreakBefore === true),
    pageBreakAfter: participates && (breakConfig?.after === 'page' || model.pageBreakAfter === true),
  }
}
