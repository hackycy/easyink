import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { LayoutDocument, LayoutFragment } from './layout-plan'
import { createFragmentFromNode } from './layout-plan'
import { resolvePageModel } from './page-model'
import { runFlowYReflow } from './reflow-engine'

export interface RunLayoutPipelineOptions {
  originalSchema?: DocumentSchema
  measured?: Map<string, { width: number, height: number, overflow?: boolean }>
}

export function runLayoutPipeline(
  schema: DocumentSchema,
  options: RunLayoutPipelineOptions = {},
): LayoutDocument {
  const measuredElements = applyMeasurements(schema.elements, options.measured)
  const reflowStrategy = schema.page.reflow?.strategy ?? inferReflowStrategy(schema)
  const originalElements = options.originalSchema?.elements ?? schema.elements
  const reflowResult = reflowStrategy === 'flow-y'
    ? runFlowYReflow({ originalElements, measuredElements })
    : { elements: measuredElements, diagnostics: [] }
  const pageModel = resolvePageModel(schema)
  const fragments = reflowResult.elements.map(node => createFragmentFromNode(node, options.measured?.get(node.id)))

  return {
    width: pageModel.width,
    height: resolveDocumentHeight(schema, fragments),
    fragments,
    diagnostics: reflowResult.diagnostics,
  }
}

function applyMeasurements(
  elements: MaterialNode[],
  measured: RunLayoutPipelineOptions['measured'],
): MaterialNode[] {
  if (!measured || measured.size === 0)
    return elements

  return elements.map((node) => {
    const result = measured.get(node.id)
    if (!result)
      return node
    if (result.width === node.width && result.height === node.height)
      return node
    return { ...node, width: result.width, height: result.height }
  })
}

function inferReflowStrategy(schema: DocumentSchema): NonNullable<DocumentSchema['page']['reflow']>['strategy'] {
  if (schema.page.layout?.strategy === 'stack-flow')
    return 'flow-y'
  return 'measure-only'
}

function resolveDocumentHeight(schema: DocumentSchema, fragments: LayoutFragment[]): number {
  let contentBottom = 0
  for (const fragment of fragments) {
    const bottom = fragment.box.y + fragment.box.height
    if (bottom > contentBottom)
      contentBottom = bottom
  }
  return Math.max(schema.page.height, contentBottom)
}
