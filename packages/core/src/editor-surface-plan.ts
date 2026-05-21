import type { DocumentSchema } from '@easyink/schema'

export interface EditorSurfacePagePlan {
  index: number
  width: number
  height: number
  yOffset: number
  kind: 'page' | 'continuous' | 'label-cell'
}

export interface EditorSurfacePlan {
  activePageIndex: number
  pages: EditorSurfacePagePlan[]
}

export function createEditorSurfacePlan(schema: DocumentSchema): EditorSurfacePlan {
  const page = schema.page
  const pageModelKind = page.pageModel?.kind

  if (pageModelKind === 'label-sheet' || page.mode === 'label') {
    return {
      activePageIndex: 0,
      pages: [{
        index: 0,
        width: page.width,
        height: page.height,
        yOffset: 0,
        kind: 'label-cell',
      }],
    }
  }

  if (pageModelKind === 'continuous-paper' || page.mode === 'stack' || page.mode === 'continuous') {
    return {
      activePageIndex: 0,
      pages: [{
        index: 0,
        width: page.width,
        height: resolveContinuousEditorHeight(schema),
        yOffset: 0,
        kind: 'continuous',
      }],
    }
  }

  const pageCount = Math.max(page.pagination?.pageCount ?? page.pages ?? 1, 1)
  return {
    activePageIndex: 0,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      index,
      width: page.width,
      height: page.height,
      yOffset: index * page.height,
      kind: 'page',
    })),
  }
}

function resolveContinuousEditorHeight(schema: DocumentSchema): number {
  let bottom = 0
  for (const node of schema.elements)
    bottom = Math.max(bottom, node.y + node.height)
  return Math.max(schema.page.height, bottom)
}
