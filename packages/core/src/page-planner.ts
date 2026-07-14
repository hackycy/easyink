import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { PageMode } from '@easyink/shared'
import type { LayoutDiagnostic } from './layout-plan'
import type { MaterialFragmentPlan, MaterialLayoutPlan } from './material-layout-plan'
import type { CompiledMaterialProfile } from './material-profile'
import { deepClone } from '@easyink/shared'
import { runLayoutPipeline } from './layout-strategy'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans } from './material-layout-plan'
import { planRepeatedOverlays } from './page-layers'
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
  fragments?: PagePlanFragmentEntry[]
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
  profile?: CompiledMaterialProfile
  paintableNodeIds?: ReadonlySet<string>
}

export interface PagePlanFragmentEntry {
  node: MaterialNode<unknown>
  layoutPlan: MaterialLayoutPlan
  fragmentPlan: MaterialFragmentPlan
}

export function createPagePlan(schema: DocumentSchema, options: PagePlanOptions = {}): PagePlan {
  const repeatedElements = options.profile
    ? schema.elements.filter(node => options.profile!.getManifest(node.type)?.common.layout.pageRepeat === 'every-output-page')
    : []
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
    retainBlankPage: repeatedElements.some(node => options.paintableNodeIds?.has(node.id)) ? () => true : undefined,
  })
  const repeatedById = new Map(repeatedElements.map(node => [node.id, node]))
  const overlayPlacements = options.profile
    ? planRepeatedOverlays({
        nodes: repeatedElements,
        profile: options.profile,
        pageCount: result.pages.length,
        paintableNodeIds: options.paintableNodeIds ?? new Set(),
        occupiedNodeIds: new Set(schema.elements.map(node => node.id)),
      })
    : []
  const overlaysByPage = new Map<number, MaterialNode[]>()
  for (const placement of overlayPlacements) {
    const node = repeatedById.get(placement.nodeId)
    const page = result.pages[placement.pageIndex]
    if (!node || !page)
      continue
    const overlays = overlaysByPage.get(placement.pageIndex) ?? []
    overlays.push({
      ...deepClone(node),
      id: placement.virtualNodeId,
      y: page.yOffset + resolveRepeatedElementLocalY(node, page.height),
    })
    overlaysByPage.set(placement.pageIndex, overlays)
  }

  return {
    mode: result.mode,
    pages: result.pages.map(page => ({
      index: page.index,
      width: page.width,
      height: page.height,
      elements: [
        ...page.fragments.map(fragment => fragment.node),
        ...(overlaysByPage.get(page.index) ?? []),
      ],
      fragments: page.fragments.flatMap(fragment => fragment.fragmentPlan
        ? [{ node: fragment.node as MaterialNode<unknown>, layoutPlan: fragment.plan, fragmentPlan: fragment.fragmentPlan }]
        : []),
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
