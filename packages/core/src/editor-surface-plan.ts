import type { DocumentSchema } from '@easyink/schema'

export interface EditorSurfacePagePlan {
  index: number
  width: number
  height: number
  yOffset: number
  visualTop: number
  kind: 'page' | 'continuous' | 'label-cell'
}

export interface EditorSurfacePlan {
  pages: EditorSurfacePagePlan[]
  pageGap: number
  contentBounds: {
    width: number
    height: number
  }
}

export interface EditorSurfacePointProjection {
  x: number
  y: number
  pageIndex: number
  localX: number
  localY: number
  inPage: boolean
}

export const DEFAULT_EDITOR_PAGE_GAP = 24

export function createEditorSurfacePlan(schema: DocumentSchema): EditorSurfacePlan {
  const page = schema.page
  const pageModelKind = page.pageModel?.kind
  const pageGap = resolveEditorPageGap(schema)

  if (pageModelKind === 'label-sheet' || page.mode === 'label') {
    return createPlan([{
      index: 0,
      width: page.width,
      height: page.height,
      yOffset: 0,
      visualTop: 0,
      kind: 'label-cell',
    }], 0)
  }

  const paginationStrategy = page.pagination?.strategy
  if (
    pageModelKind === 'continuous-paper'
    || page.mode === 'continuous'
    || paginationStrategy === 'none'
    || paginationStrategy === 'auto-sheets'
  ) {
    return createPlan([{
      index: 0,
      width: page.width,
      height: resolveContinuousEditorHeight(schema),
      yOffset: 0,
      visualTop: 0,
      kind: 'continuous',
    }], 0)
  }

  const pageCount = Math.max(page.pagination?.pageCount ?? page.pages ?? 1, 1)
  return createPlan(
    Array.from({ length: pageCount }, (_, index) => ({
      index,
      width: page.width,
      height: page.height,
      yOffset: index * page.height,
      visualTop: index * (page.height + pageGap),
      kind: 'page',
    })),
    pageGap,
  )
}

export function resolveEditorPageGap(schema: DocumentSchema): number {
  const configured = schema.page.pagination?.pageGap
  return typeof configured === 'number' && configured >= 0 ? configured : DEFAULT_EDITOR_PAGE_GAP
}

export function getEditorSurfacePageLeft(plan: EditorSurfacePlan, page: EditorSurfacePagePlan): number {
  return Math.max((plan.contentBounds.width - page.width) / 2, 0)
}

export function projectDocumentPointToEditorSurface(
  plan: EditorSurfacePlan,
  point: { x: number, y: number },
): EditorSurfacePointProjection {
  const page = findPageForDocumentY(plan, point.y)
  const pageLeft = getEditorSurfacePageLeft(plan, page)
  const localY = point.y - page.yOffset
  return {
    x: pageLeft + point.x,
    y: page.visualTop + localY,
    pageIndex: page.index,
    localX: point.x,
    localY,
    inPage: point.y >= page.yOffset && point.y <= page.yOffset + page.height,
  }
}

export function projectEditorSurfacePointToDocument(
  plan: EditorSurfacePlan,
  point: { x: number, y: number },
): EditorSurfacePointProjection {
  const page = findPageForVisualPoint(plan, point)
  const pageLeft = getEditorSurfacePageLeft(plan, page)
  const rawLocalY = point.y - page.visualTop
  const localY = Math.min(Math.max(rawLocalY, 0), page.height)
  const localX = point.x - pageLeft
  const inPage = point.y >= page.visualTop
    && point.y <= page.visualTop + page.height
    && point.x >= pageLeft
    && point.x <= pageLeft + page.width
  return {
    x: localX,
    y: page.yOffset + localY,
    pageIndex: page.index,
    localX,
    localY,
    inPage,
  }
}

export function findPageForDocumentY(plan: EditorSurfacePlan, y: number): EditorSurfacePagePlan {
  const pages = plan.pages
  for (const page of pages) {
    if (y >= page.yOffset && y < page.yOffset + page.height)
      return page
  }
  return nearestPageByDocumentY(plan, y)
}

export function findPageForVisualPoint(
  plan: EditorSurfacePlan,
  point: { x: number, y: number },
): EditorSurfacePagePlan {
  let nearest = plan.pages[0]
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const page of plan.pages) {
    const left = getEditorSurfacePageLeft(plan, page)
    const right = left + page.width
    const top = page.visualTop
    const bottom = top + page.height
    if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom)
      return page

    const dx = point.x < left ? left - point.x : point.x > right ? point.x - right : 0
    const dy = point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0
    const distance = Math.hypot(dx, dy)
    if (distance < nearestDistance) {
      nearest = page
      nearestDistance = distance
    }
  }

  return nearest ?? {
    index: 0,
    width: plan.contentBounds.width,
    height: plan.contentBounds.height,
    yOffset: 0,
    visualTop: 0,
    kind: 'page',
  }
}

function resolveContinuousEditorHeight(schema: DocumentSchema): number {
  let bottom = 0
  for (const node of schema.elements)
    bottom = Math.max(bottom, node.y + node.height)
  const trailingGap = schema.page.reflow?.preserveTrailingGap === false
    ? 0
    : Math.max(schema.page.height - bottom, 0)
  const minHeight = schema.page.pageModel?.paper.minHeight ?? schema.page.height
  const maxHeight = schema.page.pageModel?.paper.maxHeight
  const height = Math.max(minHeight, schema.page.height, bottom + trailingGap)
  return typeof maxHeight === 'number' && maxHeight > 0 ? Math.min(height, maxHeight) : height
}

function createPlan(pages: EditorSurfacePagePlan[], pageGap: number): EditorSurfacePlan {
  const width = pages.reduce((max, page) => Math.max(max, page.width), 0)
  const height = pages.reduce((max, page) => Math.max(max, page.visualTop + page.height), 0)
  return {
    pages,
    pageGap,
    contentBounds: {
      width,
      height,
    },
  }
}

function nearestPageByDocumentY(plan: EditorSurfacePlan, y: number): EditorSurfacePagePlan {
  let nearest = plan.pages[0]
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const page of plan.pages) {
    const topDistance = Math.abs(y - page.yOffset)
    const bottomDistance = Math.abs(y - (page.yOffset + page.height))
    const distance = Math.min(topDistance, bottomDistance)
    if (distance < nearestDistance) {
      nearest = page
      nearestDistance = distance
    }
  }
  return nearest ?? {
    index: 0,
    width: plan.contentBounds.width,
    height: plan.contentBounds.height,
    yOffset: 0,
    visualTop: 0,
    kind: 'page',
  }
}
