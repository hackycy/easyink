import type { MaterialNode } from '@easyink/schema'
import type { ViewerMeasureResult } from './material-viewer'

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
  id: string
  sourceNodeId: string
  node: MaterialNode
  box: {
    x: number
    y: number
    width: number
    height: number
  }
  flow: FlowBreakConstraints & {
    participates: boolean
  }
  measured?: ViewerMeasureResult
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
  fragments: LayoutFragment[]
  pageContext: {
    pageNumber: number
    totalPages: number
    copyIndex?: number
  }
}

export function createFragmentFromNode(node: MaterialNode, measured?: ViewerMeasureResult): LayoutFragment {
  return {
    id: node.id,
    sourceNodeId: node.id,
    node,
    box: {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    },
    flow: readNodeFlowConstraints(node),
    measured,
  }
}

export function readNodeFlowConstraints(node: MaterialNode): LayoutFragment['flow'] {
  const props = node.props as Record<string, unknown>
  const placement = node.placement
  const breakConfig = node.break
  const participates = placement?.mode != null ? placement.mode !== 'fixed' : props.layoutMode !== 'fixed'
  return {
    participates,
    keepTogether: participates && (breakConfig?.keepTogether === true || props.keepTogether === true),
    pageBreakBefore: participates && (breakConfig?.before === 'page' || props.pageBreakBefore === true),
    pageBreakAfter: participates && (breakConfig?.after === 'page' || props.pageBreakAfter === true),
  }
}

export function readNodeRepeatScope(node: MaterialNode): 'none' | 'every-output-page' {
  return node.repeat?.scope === 'every-output-page' ? 'every-output-page' : 'none'
}
