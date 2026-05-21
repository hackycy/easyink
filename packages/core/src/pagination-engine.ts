import type { DocumentSchema } from '@easyink/schema'
import type { PageMode } from '@easyink/shared'
import type { LayoutDiagnostic, LayoutDocument, LayoutFragment, OutputPagePlan } from './layout-plan'
import type { FragmentPaginator } from './material-viewer'
import { deepClone } from '@easyink/shared'
import { createFragmentFromNode } from './layout-plan'
import { resolvePageModel } from './page-model'

export interface PaginationOptions {
  originalSchema?: DocumentSchema
  resolveFragmentPaginator?: (fragment: LayoutFragment) => FragmentPaginator | undefined
}

export interface PaginationResult {
  mode: PageMode
  pages: OutputPagePlan[]
  diagnostics: LayoutDiagnostic[]
}

export function runPagination(
  schema: DocumentSchema,
  document: LayoutDocument,
  options: PaginationOptions = {},
): PaginationResult {
  const strategy = schema.page.pagination?.strategy ?? inferPaginationStrategy(schema)
  const diagnostics = [...document.diagnostics]

  if (strategy === 'fixed-sheets')
    return { mode: schema.page.mode, pages: createFixedSheets(schema, document, diagnostics), diagnostics }
  if (strategy === 'auto-sheets')
    return { mode: schema.page.mode, pages: createAutoSheets(schema, document, diagnostics, options), diagnostics }
  if (strategy === 'label-sheets')
    return { mode: schema.page.mode, pages: createLabelSheets(schema, document, diagnostics), diagnostics }
  if (strategy === 'none')
    return { mode: schema.page.mode, pages: createContinuousSheet(schema, document, diagnostics, options.originalSchema), diagnostics }

  diagnostics.push({
    code: 'UNKNOWN_PAGINATION_STRATEGY',
    severity: 'error',
    message: `Unknown pagination strategy: ${strategy}`,
    stage: 'pagination',
  })
  return { mode: schema.page.mode, pages: [], diagnostics }
}

function inferPaginationStrategy(schema: DocumentSchema): NonNullable<DocumentSchema['page']['pagination']>['strategy'] {
  if (schema.page.mode === 'label')
    return 'label-sheets'
  if (schema.page.mode === 'stack' || schema.page.mode === 'continuous')
    return 'none'
  return 'fixed-sheets'
}

function createFixedSheets(
  schema: DocumentSchema,
  document: LayoutDocument,
  diagnostics: LayoutDiagnostic[],
): OutputPagePlan[] {
  const page = schema.page
  const pageModel = resolvePageModel(schema)
  const pageWidth = pageModel.width
  const pageHeight = pageModel.height
  const pageCount = Math.max(page.pagination?.pageCount ?? page.pages ?? 1, 1)
  const entries: OutputPagePlan[] = []

  for (let i = 0; i < pageCount; i++) {
    const pageStart = i * pageHeight
    const pageEnd = (i + 1) * pageHeight
    const fragments = pageCount === 1
      ? document.fragments
      : document.fragments.filter(fragment => fragment.box.y >= pageStart && fragment.box.y < pageEnd)

    entries.push(createPage(i, pageWidth, pageHeight, i * pageHeight, fragments))
  }

  let pages = applyBlankPolicy(entries, page.blankPolicy)
  pages = applyPageCopies(pages, Math.max(page.copies ?? 1, 1))
  resolveTotalPages(pages)

  for (const fragment of document.fragments) {
    if (fragment.flow.pageBreakBefore || fragment.flow.pageBreakAfter) {
      diagnostics.push({
        code: 'FIXED_SHEETS_BREAK_CONSTRAINT_IGNORED',
        severity: 'info',
        message: 'Explicit page-break constraints are diagnostic-only for fixed-sheets pagination.',
        stage: 'pagination',
        sourceNodeId: fragment.sourceNodeId,
      })
    }
  }

  return pages
}

function createAutoSheets(
  schema: DocumentSchema,
  document: LayoutDocument,
  diagnostics: LayoutDiagnostic[],
  options: PaginationOptions,
): OutputPagePlan[] {
  const pageModel = resolvePageModel(schema)
  const pageWidth = pageModel.width
  const pageHeight = pageModel.height
  const pages: OutputPagePlan[] = []
  let currentFragments: LayoutFragment[] = []
  let currentPageStart = 0

  const ordered = [...document.fragments].sort((left, right) => {
    if (left.box.y !== right.box.y)
      return left.box.y - right.box.y
    return left.box.x - right.box.x
  })

  function pushCurrent(): void {
    pages.push(createPage(pages.length, pageWidth, pageHeight, currentPageStart, currentFragments))
    currentFragments = []
    currentPageStart = pages.length * pageHeight
  }

  for (const fragment of ordered) {
    if (fragment.flow.pageBreakBefore && currentFragments.length > 0)
      pushCurrent()

    let nextFragment: LayoutFragment | undefined = fragment
    while (nextFragment) {
      const relativeTop = Math.max(nextFragment.box.y - currentPageStart, 0)
      const relativeBottom = nextFragment.box.y + nextFragment.box.height - currentPageStart
      if (currentFragments.length > 0 && relativeBottom > pageHeight) {
        if (nextFragment.flow.keepTogether || nextFragment.box.height <= pageHeight) {
          pushCurrent()
          nextFragment = moveFragmentToY(nextFragment, Math.max(nextFragment.box.y, currentPageStart))
          continue
        }
      }

      if (relativeTop + nextFragment.box.height > pageHeight) {
        const paginator = options.resolveFragmentPaginator?.(nextFragment)
        if (paginator) {
          const split = paginator.paginateFragment({
            fragment: nextFragment,
            availableHeight: Math.max(pageHeight - relativeTop, 0),
            pageContext: { pageIndex: pages.length },
          })
          diagnostics.push(...split.diagnostics)
          currentFragments.push(split.currentPage)
          if (split.nextPage) {
            pushCurrent()
            nextFragment = moveFragmentToY(split.nextPage, currentPageStart)
            continue
          }
          nextFragment = undefined
          continue
        }

        diagnostics.push({
          code: 'AUTO_SHEETS_FRAGMENT_OVERFLOW',
          severity: 'warning',
          message: `Fragment ${nextFragment.sourceNodeId} is taller than one output page.`,
          stage: 'pagination',
          sourceNodeId: nextFragment.sourceNodeId,
        })
      }

      currentFragments.push(nextFragment)
      nextFragment = undefined
    }

    if (fragment.flow.pageBreakAfter)
      pushCurrent()
  }

  if (currentFragments.length > 0 || pages.length === 0)
    pushCurrent()

  resolveTotalPages(pages)
  return pages
}

function createContinuousSheet(
  schema: DocumentSchema,
  document: LayoutDocument,
  diagnostics: LayoutDiagnostic[],
  originalSchema: DocumentSchema | undefined,
): OutputPagePlan[] {
  for (const fragment of document.fragments) {
    if (fragment.flow.pageBreakBefore || fragment.flow.pageBreakAfter) {
      diagnostics.push({
        code: 'CONTINUOUS_BREAK_CONSTRAINT_IGNORED',
        severity: 'info',
        message: 'Explicit page-break constraints do not cut continuous-paper output.',
        stage: 'pagination',
        sourceNodeId: fragment.sourceNodeId,
      })
    }
  }

  const trailingGap = schema.page.reflow?.preserveTrailingGap === false
    ? 0
    : getTrailingGap(originalSchema)
  const pageModel = resolvePageModel(schema)
  const height = Math.max(pageModel.height, getContentBottom(document.fragments) + trailingGap)
  const page = createPage(0, pageModel.width, height, 0, document.fragments)
  resolveTotalPages([page])
  return [page]
}

function getTrailingGap(originalSchema: DocumentSchema | undefined): number {
  if (!originalSchema || (originalSchema.page.mode !== 'stack' && originalSchema.page.mode !== 'continuous'))
    return 0
  let bottom = 0
  for (const el of originalSchema.elements)
    bottom = Math.max(bottom, el.y + el.height)
  return Math.max(originalSchema.page.height - bottom, 0)
}

function createLabelSheets(
  schema: DocumentSchema,
  document: LayoutDocument,
  diagnostics: LayoutDiagnostic[],
): OutputPagePlan[] {
  const page = schema.page
  const pageModel = resolvePageModel(schema)
  const columns = page.label?.columns || 1
  const rows = page.label?.rows || 1
  const gapX = page.label?.gap || 0
  const gapY = page.label?.rowGap || 0
  const copies = Math.max(page.copies || 1, 1)

  if (columns <= 0 || rows <= 0) {
    diagnostics.push({
      code: 'INVALID_LABEL_GRID',
      severity: 'error',
      message: 'Label columns and rows must be positive',
      stage: 'pagination',
    })
  }

  const cellW = pageModel.width
  const cellH = pageModel.height
  const sheetWidth = cellW * columns + gapX * Math.max(columns - 1, 0)
  const sheetHeight = cellH * rows + gapY * Math.max(rows - 1, 0)
  const perSheet = Math.max(columns * rows, 1)
  const sheetCount = Math.max(Math.ceil(copies / perSheet), 1)
  const entries: OutputPagePlan[] = []
  let remaining = copies

  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
    const cellsOnSheet = Math.min(perSheet, remaining)
    remaining -= cellsOnSheet

    const sheetFragments: LayoutFragment[] = []
    for (let cellIndex = 0; cellIndex < cellsOnSheet; cellIndex++) {
      const col = cellIndex % columns
      const row = Math.floor(cellIndex / columns)
      const xOffset = col * (cellW + gapX)
      const yOffset = row * (cellH + gapY)

      for (const fragment of document.fragments) {
        const clonedNode = deepClone(fragment.node)
        const node = {
          ...clonedNode,
          x: clonedNode.x + xOffset,
          y: clonedNode.y + yOffset,
        }
        sheetFragments.push(createFragmentFromNode(node, fragment.measured))
      }
    }

    entries.push(createPage(sheetIndex, sheetWidth, sheetHeight, 0, sheetFragments, sheetIndex))
  }

  resolveTotalPages(entries)
  return entries
}

function createPage(
  index: number,
  width: number,
  height: number,
  yOffset: number,
  fragments: LayoutFragment[],
  copyIndex?: number,
): OutputPagePlan {
  return {
    index,
    sheetIndex: index,
    width,
    height,
    yOffset,
    fragments,
    pageContext: {
      pageNumber: index + 1,
      totalPages: 1,
      ...(copyIndex != null ? { copyIndex } : {}),
    },
  }
}

function applyBlankPolicy(pages: OutputPagePlan[], blankPolicy: DocumentSchema['page']['blankPolicy']): OutputPagePlan[] {
  if (blankPolicy !== 'remove')
    return pages
  const filtered = pages.filter(page => page.fragments.length > 0)
  return filtered.length > 0 ? filtered : pages.slice(0, 1)
}

function applyPageCopies(pages: OutputPagePlan[], copies: number): OutputPagePlan[] {
  if (copies <= 1)
    return pages

  const result = [...pages]
  const base = [...pages]
  for (let copyIndex = 1; copyIndex < copies; copyIndex++) {
    for (const page of base) {
      result.push({
        ...page,
        index: result.length,
        sheetIndex: result.length,
        pageContext: {
          ...page.pageContext,
          pageNumber: result.length + 1,
          copyIndex,
        },
      })
    }
  }
  return result
}

function moveFragmentToY(fragment: LayoutFragment, y: number): LayoutFragment {
  if (fragment.box.y === y)
    return fragment
  const node = { ...fragment.node, y }
  return {
    ...fragment,
    node,
    box: {
      ...fragment.box,
      y,
    },
  }
}

function resolveTotalPages(pages: OutputPagePlan[]): void {
  for (const page of pages) {
    page.pageContext.totalPages = pages.length
    page.pageContext.pageNumber = page.index + 1
  }
}

function getContentBottom(fragments: LayoutFragment[]): number {
  let bottom = 0
  for (const fragment of fragments)
    bottom = Math.max(bottom, fragment.box.y + fragment.box.height)
  return bottom
}
