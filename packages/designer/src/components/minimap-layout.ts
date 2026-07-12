import type { EditorSurfacePlan, Rect } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { getEditorSurfacePageLeft, projectDocumentPointToEditorSurface } from '@easyink/core'

export interface MinimapPageFrame extends Rect {
  key: string
  index: number
  kind: 'page' | 'continuous'
}

export interface MinimapElementFrame extends Rect {
  id: string
  hidden?: boolean
  locked?: boolean
}

export interface MinimapLayout {
  bounds: Rect
  pageFrames: MinimapPageFrame[]
  elements: MinimapElementFrame[]
}

const MIN_SIZE = 1

export function resolveMinimapLayout(
  schema: DocumentSchema,
  surfacePlan: EditorSurfacePlan,
  elements: readonly MaterialNode[],
): MinimapLayout {
  const projectedElements = elements.map(element => projectElementFrame(surfacePlan, element))
  const bounds = resolveMinimapBounds(schema, surfacePlan, projectedElements)

  return {
    bounds,
    pageFrames: resolvePageFrames(schema, surfacePlan, bounds),
    elements: projectedElements,
  }
}

function projectElementFrame(surfacePlan: EditorSurfacePlan, element: MaterialNode): MinimapElementFrame {
  const point = projectDocumentPointToEditorSurface(surfacePlan, { x: element.x, y: element.y })
  return {
    id: element.id,
    x: point.x,
    y: point.y,
    width: Math.max(element.width, MIN_SIZE),
    height: Math.max(element.height, MIN_SIZE),
    hidden: element.editorState?.hidden,
    locked: element.editorState?.locked,
  }
}

function resolveMinimapBounds(
  schema: DocumentSchema,
  surfacePlan: EditorSurfacePlan,
  elements: readonly MinimapElementFrame[],
): Rect {
  const baseBounds: Rect = {
    x: 0,
    y: 0,
    width: Math.max(surfacePlan.contentBounds.width, MIN_SIZE),
    height: Math.max(surfacePlan.contentBounds.height, MIN_SIZE),
  }

  if (!shouldTrackFlowExtent(schema))
    return baseBounds

  let left = baseBounds.x
  let top = baseBounds.y
  let right = baseBounds.x + baseBounds.width
  let bottom = baseBounds.y + baseBounds.height

  for (const element of elements) {
    left = Math.min(left, element.x)
    top = Math.min(top, element.y)
    right = Math.max(right, element.x + element.width)
    bottom = Math.max(bottom, element.y + element.height)
  }

  return {
    x: left,
    y: top,
    width: Math.max(right - left, MIN_SIZE),
    height: Math.max(bottom - top, MIN_SIZE),
  }
}

function shouldTrackFlowExtent(schema: DocumentSchema): boolean {
  return schema.page.mode === 'continuous'
    || schema.page.layout?.strategy === 'stack-flow'
    || schema.page.pagination?.strategy === 'auto-sheets'
    || schema.page.pagination?.strategy === 'none'
}

function resolvePageFrames(
  schema: DocumentSchema,
  surfacePlan: EditorSurfacePlan,
  bounds: Rect,
): MinimapPageFrame[] {
  if (schema.page.pagination?.strategy === 'auto-sheets') {
    const page = surfacePlan.pages[0]
    const pageWidth = Math.max(page?.width ?? surfacePlan.contentBounds.width, MIN_SIZE)
    const pageHeight = Math.max(page?.height ?? schema.page.height, MIN_SIZE)
    const pageCount = Math.max(Math.ceil((bounds.y + bounds.height) / pageHeight), 1)

    return Array.from({ length: pageCount }, (_, index) => ({
      key: `auto-sheet-${index}`,
      index,
      kind: 'page',
      x: 0,
      y: index * pageHeight,
      width: pageWidth,
      height: pageHeight,
    }))
  }

  if (schema.page.pagination?.strategy === 'none' || schema.page.mode === 'continuous') {
    const page = surfacePlan.pages[0]
    return [{
      key: 'continuous',
      index: 0,
      kind: 'continuous',
      x: page ? getEditorSurfacePageLeft(surfacePlan, page) : 0,
      y: 0,
      width: Math.max(page?.width ?? surfacePlan.contentBounds.width, MIN_SIZE),
      height: Math.max(bounds.y + bounds.height, page?.height ?? surfacePlan.contentBounds.height, MIN_SIZE),
    }]
  }

  return surfacePlan.pages.map(page => ({
    key: `page-${page.index}`,
    index: page.index,
    kind: page.kind,
    x: getEditorSurfacePageLeft(surfacePlan, page),
    y: page.yOffset,
    width: Math.max(page.width, MIN_SIZE),
    height: Math.max(page.height, MIN_SIZE),
  }))
}
