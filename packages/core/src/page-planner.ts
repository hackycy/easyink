import type { DocumentSchema, MaterialNode, PageSchema } from '@easyink/schema'
import type { PageMode } from '@easyink/shared'

/**
 * Page plan result -- describes all pages for rendering.
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
  /** Y offset in document coordinates — used by the render surface to position elements within the page. */
  yOffset: number
}

export interface PagePlanDiagnostic {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

/**
 * Create a page plan for fixed-page mode.
 * Elements are assigned to pages based on their y coordinate.
 */
export function createPagePlan(schema: DocumentSchema): PagePlan {
  const { page, elements } = schema
  const diagnostics: PagePlanDiagnostic[] = []

  switch (page.mode) {
    case 'fixed':
      return createFixedPagePlan(page, elements, diagnostics)
    case 'stack':
      return createStackPagePlan(page, elements, diagnostics)
    case 'label':
      return createLabelPagePlan(page, elements, diagnostics)
    default:
      diagnostics.push({
        code: 'UNKNOWN_PAGE_MODE',
        severity: 'error',
        message: `Unknown page mode: ${page.mode}`,
      })
      return { mode: 'fixed', pages: [], diagnostics }
  }
}

function createFixedPagePlan(
  page: PageSchema,
  elements: MaterialNode[],
  diagnostics: PagePlanDiagnostic[],
): PagePlan {
  const pageCount = page.pages || 1
  const entries: PagePlanEntry[] = []

  for (let i = 0; i < pageCount; i++) {
    const pageElements = elements.filter((el) => {
      const pageStart = i * page.height
      const pageEnd = (i + 1) * page.height
      return el.y >= pageStart && el.y < pageEnd
    })

    entries.push({
      index: i,
      width: page.width,
      height: page.height,
      elements: pageElements,
      yOffset: i * page.height,
    })
  }

  // Handle elements beyond declared pages
  if (pageCount === 1) {
    // Single page: all elements go on page 0
    entries[0] = {
      index: 0,
      width: page.width,
      height: page.height,
      elements,
      yOffset: 0,
    }
  }

  // Apply blank page policy
  if (page.blankPolicy === 'remove') {
    const filtered = entries.filter(e => e.elements.length > 0)
    if (filtered.length === 0 && entries.length > 0) {
      return { mode: 'fixed', pages: [entries[0]!], diagnostics }
    }
    return { mode: 'fixed', pages: filtered, diagnostics }
  }

  // Apply copies
  if (page.copies && page.copies > 1) {
    const base = [...entries]
    for (let c = 1; c < page.copies; c++) {
      for (const entry of base) {
        entries.push({
          ...entry,
          index: entries.length,
          copyIndex: c,
          yOffset: entry.yOffset,
        })
      }
    }
  }

  return { mode: 'fixed', pages: entries, diagnostics }
}

function createStackPagePlan(
  page: PageSchema,
  elements: MaterialNode[],
  diagnostics: PagePlanDiagnostic[],
): PagePlan {
  // Stack mode: single continuous page
  let totalHeight = page.height
  for (const el of elements) {
    const bottom = el.y + el.height
    if (bottom > totalHeight) {
      totalHeight = bottom
    }
  }

  return {
    mode: 'stack',
    pages: [{
      index: 0,
      width: page.width,
      height: totalHeight,
      elements,
      yOffset: 0,
    }],
    diagnostics,
  }
}

function createLabelPagePlan(
  page: PageSchema,
  elements: MaterialNode[],
  diagnostics: PagePlanDiagnostic[],
): PagePlan {
  const columns = page.label?.columns || 1
  const gap = page.label?.gap || 0
  const copies = page.copies || 1

  if (columns <= 0) {
    diagnostics.push({
      code: 'INVALID_LABEL_COLUMNS',
      severity: 'error',
      message: 'Label columns must be positive',
    })
  }

  const labelWidth = (page.width - gap * (columns - 1)) / columns
  const entries: PagePlanEntry[] = []

  for (let c = 0; c < copies; c++) {
    entries.push({
      index: entries.length,
      width: labelWidth,
      height: page.height,
      elements,
      copyIndex: c,
      yOffset: 0,
    })
  }

  return { mode: 'label', pages: entries, diagnostics }
}
