import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { PageMode } from '@easyink/shared'
import type { LayoutDiagnostic } from './layout-plan'
import { deepClone } from '@easyink/shared'
import { readNodeRepeatScope } from './layout-plan'
import { runLayoutPipeline } from './layout-strategy'
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
  elements: MaterialNode[]
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
  const document = runLayoutPipeline(layoutSchema)
  const result = runPagination(layoutSchema, document, {
    originalSchema,
    retainBlankPage: repeatedElements.some(el => !el.hidden) ? () => true : undefined,
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

function resolveRepeatedElementLocalY(node: MaterialNode, pageHeight: number): number {
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
