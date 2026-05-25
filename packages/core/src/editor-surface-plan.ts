import type { DocumentSchema } from '@easyink/schema'
import type { Point, Rect } from './geometry'
import { resolvePageModel } from './page-model'

export interface EditorSurfacePagePlan {
  index: number
  width: number
  height: number
  yOffset: number
  kind: 'page' | 'continuous'
}

export interface EditorSurfaceDecoration {
  kind: 'page-frame' | 'page-break' | 'page-label' | 'page-toolbar-anchor'
  pageIndex: number
  rect?: Rect
  position?: Point
}

export interface EditorSurfacePlan {
  pages: EditorSurfacePagePlan[]
  coordinate: {
    width: number
    height: number
  }
  decorations: EditorSurfaceDecoration[]
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

export function createEditorSurfacePlan(schema: DocumentSchema): EditorSurfacePlan {
  const page = schema.page
  const pageModel = resolvePageModel(schema)

  const paginationStrategy = page.pagination?.strategy
  if (
    pageModel.kind === 'continuous-paper'
    || page.mode === 'continuous'
    || paginationStrategy === 'none'
    || paginationStrategy === 'auto-sheets'
  ) {
    return createPlan([{
      index: 0,
      width: pageModel.width,
      height: pageModel.height,
      yOffset: 0,
      kind: 'continuous',
    }])
  }

  const pageCount = Math.max(page.pagination?.pageCount ?? page.pages ?? 1, 1)
  return createPlan(
    Array.from({ length: pageCount }, (_, index) => ({
      index,
      width: pageModel.width,
      height: pageModel.height,
      yOffset: index * pageModel.height,
      kind: 'page',
    })),
  )
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
    y: page.yOffset + localY,
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
  const rawLocalY = point.y - page.yOffset
  const localX = point.x - pageLeft
  const inPage = point.y >= page.yOffset
    && point.y <= page.yOffset + page.height
    && point.x >= pageLeft
    && point.x <= pageLeft + page.width
  return {
    x: localX,
    y: page.yOffset + rawLocalY,
    pageIndex: page.index,
    localX,
    localY: rawLocalY,
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
    const top = page.yOffset
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
    kind: 'page',
  }
}

function createPlan(pages: EditorSurfacePagePlan[]): EditorSurfacePlan {
  const pageWidth = pages.reduce((max, page) => Math.max(max, page.width), 0)
  const pageStackHeight = pages.reduce((max, page) => Math.max(max, page.yOffset + page.height), 0)
  const width = pageWidth
  const height = pageStackHeight
  const decorations = createDecorations(pages)
  return {
    pages,
    coordinate: {
      width,
      height,
    },
    decorations,
    contentBounds: {
      width,
      height,
    },
  }
}

function createDecorations(pages: EditorSurfacePagePlan[]): EditorSurfaceDecoration[] {
  const decorations: EditorSurfaceDecoration[] = []
  for (const page of pages) {
    decorations.push({
      kind: 'page-frame',
      pageIndex: page.index,
      rect: {
        x: 0,
        y: page.yOffset,
        width: page.width,
        height: page.height,
      },
    })
    if (page.kind === 'page' && page.index < pages.length - 1) {
      decorations.push({
        kind: 'page-break',
        pageIndex: page.index,
        position: {
          x: 0,
          y: page.yOffset + page.height,
        },
      })
      decorations.push({
        kind: 'page-label',
        pageIndex: page.index + 1,
        position: {
          x: 0,
          y: page.yOffset + page.height,
        },
      })
    }
    if (page.kind === 'page') {
      decorations.push({
        kind: 'page-toolbar-anchor',
        pageIndex: page.index,
        position: {
          x: page.width,
          y: page.yOffset,
        },
      })
    }
  }
  return decorations
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
    kind: 'page',
  }
}
