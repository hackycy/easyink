import type { EditorSurfacePlan } from '@easyink/core'
import { getEditorSurfacePageLeft } from '@easyink/core'

export interface PageBreakRulerModel {
  key: string
  x: number
  y: number
  width: number
}

export function resolvePageBreakRulers(plan: EditorSurfacePlan): PageBreakRulerModel[] {
  const rulers: PageBreakRulerModel[] = []
  for (const decoration of plan.decorations) {
    if (decoration.kind !== 'page-break' || !decoration.position)
      continue
    const page = plan.pages.find(item => item.index === decoration.pageIndex)
    if (!page)
      continue
    rulers.push({
      key: `page-break-${decoration.pageIndex}`,
      x: getEditorSurfacePageLeft(plan, page),
      y: decoration.position.y,
      width: page.width,
    })
  }
  return rulers
}
