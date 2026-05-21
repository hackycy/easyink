import type { MaterialNode } from '@easyink/schema'
import type { BindingFormatDiagnostic } from './binding-format'
import type { LayoutDiagnostic, LayoutFragment } from './layout-plan'

export type TrustedViewerHtmlSource = 'material-internal' | 'sanitized-rich-text'

export interface TrustedViewerHtml {
  readonly __easyinkTrustedViewerHtml: true
  readonly value: string
  readonly source: TrustedViewerHtmlSource
}

export function trustedViewerHtml(
  value: string,
  source: TrustedViewerHtmlSource = 'material-internal',
): TrustedViewerHtml {
  return {
    __easyinkTrustedViewerHtml: true,
    value,
    source,
  }
}

export function readTrustedViewerHtml(html: TrustedViewerHtml): string {
  return html.value
}

/**
 * Viewer render context passed to each material's render function.
 * Provides document-level unit and zoom for physical unit calculations.
 */
export interface ViewerRenderContext {
  data: Record<string, unknown>
  resolvedProps: Record<string, unknown>
  pageIndex: number
  /** Document unit: 'mm' | 'pt' | 'px'. CSS unit suffix equals this value. */
  unit: string
  zoom: number
  reportDiagnostic?: (diagnostic: BindingFormatDiagnostic & { nodeId?: string }) => void
}

export interface ViewerRenderOutput {
  html?: TrustedViewerHtml
  element?: HTMLElement
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
  /** When true, the element is replicated to every page by the pageAware post-processing step. */
  pageAware?: boolean
}
