import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { PageMode } from '@easyink/shared'
import type { LayoutDiagnostic } from './layout-plan'
import { deepClone } from '@easyink/shared'
import { readNodeRepeatScope } from './layout-plan'
import { runLayoutPipeline } from './layout-strategy'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans } from './material-layout-plan'
import { runPagination } from './pagination-engine'

/**
 * Page plan result -- describes all pages for rendering.
 *
 * Compatibility facade for the orthogonal layout pipeline. New code should
 * prefer LayoutDocument and OutputPagePlan from layout/pagination engines.
 */
export interface PagePlan {
  mode: PageMode
  pages: PagePlanEntry[]
  diagnostics: PagePlanDiagnostic[]
}

export interface PagePlanEntry {
  index: number
  width: number
  height: number
  elements: MaterialNode<unknown>[]
  isBlank?: boolean
  copyIndex?: number
  /** Y offset in document coordinates -- used by the render surface to position elements within the page. */
  yOffset: number
}

export interface PagePlanDiagnostic {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface PagePlanOptions {
  originalSchema?: DocumentSchema
}

export function createPagePlan(schema: DocumentSchema, options: PagePlanOptions = {}): PagePlan {
  const repeatedElements = schema.elements.filter(el => readNodeRepeatScope(el) === 'every-output-page')
  const layoutSchema = repeatedElements.length > 0
    ? { ...schema, elements: schema.elements.filter(el => !repeatedElements.includes(el)) }
    : schema
  const originalSchema = options.originalSchema
    ? {
        ...options.originalSchema,
        elements: options.originalSchema.elements.filter(el => !repeatedElements.some(repeated => repeated.id === el.id)),
      }
    : undefined
  const document = runLayoutPipeline(layoutSchema, { plans: createLegacyNodePlans(layoutSchema) })
  const result = runPagination(layoutSchema, document, {
    originalSchema,
    retainBlankPage: repeatedElements.some(el => !el.editorState?.hidden) ? () => true : undefined,
  })

  return {
    mode: result.mode,
    pages: result.pages.map(page => ({
      index: page.index,
      width: page.width,
      height: page.height,
      elements: [
        ...page.fragments.map(fragment => fragment.node),
        ...repeatedElements.map(node => ({
          ...deepClone(node),
          id: `${node.id}__p${page.index}`,
          y: page.yOffset + resolveRepeatedElementLocalY(node, page.height),
        })),
      ],
      copyIndex: page.pageContext.copyIndex,
      yOffset: page.yOffset,
    })),
    diagnostics: result.diagnostics.map(toPagePlanDiagnostic),
  }
}

function createLegacyNodePlans(schema: DocumentSchema) {
  const constraintKey = createLayoutConstraintKey({
    availableWidth: schema.page.width,
    availableHeight: schema.page.height,
    unit: schema.unit,
    writingMode: 'horizontal-tb',
  })
  return new Map(schema.elements.map((node) => {
    const borderBox = { x: node.x, y: node.y, width: node.width, height: node.height }
    return [node.id, createNonFragmentingMaterialPlans({
      instanceKey: node.id,
      nodeId: node.id,
      nodeRevision: 0,
      constraintKey,
      pageIndex: 0,
      borderBox,
      fragmentBox: borderBox,
    }).layoutPlan]
  }))
}

function resolveRepeatedElementLocalY(node: MaterialNode<unknown>, pageHeight: number): number {
  if (pageHeight <= 0)
    return node.y
  const localY = node.y % pageHeight
  return localY < 0 ? localY + pageHeight : localY
}

function toPagePlanDiagnostic(diagnostic: LayoutDiagnostic): PagePlanDiagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
  }
}
