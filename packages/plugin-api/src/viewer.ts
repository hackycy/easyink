import type { FragmentPaginator, ViewerMeasureResult, ViewerRenderOutput, ViewerRenderSize } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { MaterialDeclaration, RendererDeclaration } from './material'
import type { DeepReadonly, ResourceContext } from './resources'

export type { MaterialModel } from './material'

export interface ViewerContext extends ResourceContext {
  readonly document: Document
  readonly data: DeepReadonly<Record<string, unknown>>
  readonly resolvedProps: DeepReadonly<Record<string, unknown>>
  readonly unit: string
  readonly zoom: number
  readonly pageIndex: number
  readonly pageNumber: number
  readonly totalPages: number
  readonly copyIndex: number
  readonly reportDiagnostic: (diagnostic: { code: string, message: string, nodeId?: string, cause?: unknown }) => void
}

/** Methods stay synchronous; asynchronous preparation belongs to a session instance. */
export interface ViewerRenderer {
  readonly render: (node: DeepReadonly<MaterialNode>, context: ViewerContext) => ViewerRenderOutput
  readonly measure?: (node: DeepReadonly<MaterialNode>, context: ViewerContext) => ViewerMeasureResult
  readonly getRenderSize?: (node: DeepReadonly<MaterialNode>, context: ViewerContext) => Partial<ViewerRenderSize>
  readonly fragmentPaginator?: FragmentPaginator
}

export interface ViewerSessionRenderer extends ViewerRenderer {
  readonly prepare?: (node: DeepReadonly<MaterialNode>, context: ViewerContext) => void | Promise<void>
}

export type ViewerImplementation = ViewerRenderer | {
  readonly createSession: (context: ResourceContext) => ViewerSessionRenderer
}

export type ViewerMaterial = MaterialDeclaration & RendererDeclaration<ViewerImplementation>
