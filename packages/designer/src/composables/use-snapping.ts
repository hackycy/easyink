import type { EasyInkEngine } from '@easyink/core'
import type { useCanvas } from './use-canvas'
import { fromPixels } from '@easyink/core'
import { ref } from 'vue'

export interface SnapLine {
  orientation: 'horizontal' | 'vertical'
  position: number
  type: 'center' | 'edge' | 'guide' | 'margin'
}

export interface SnapResult {
  adjustedX: number
  adjustedY: number
  visibleLines: SnapLine[]
}

export function useSnapping(
  engine: EasyInkEngine,
  canvas: ReturnType<typeof useCanvas>,
  options?: { threshold?: number },
) {
  const snapThreshold = ref(options?.threshold ?? 5)
  const activeSnapLines = ref<SnapLine[]>([])

  function _thresholdInUnits(): number {
    const unit = engine.schema.schema.page.unit
    return fromPixels(snapThreshold.value, unit, 96, canvas.zoom.value)
  }

  function calculateSnap(
    _elementId: string,
    proposedX: number,
    proposedY: number,
    proposedW: number,
    proposedH: number,
    excludeIds: string[],
  ): SnapResult {
    const threshold = _thresholdInUnits()
    const excludeSet = new Set(excludeIds)
    const schema = engine.schema.schema

    // Collect snap targets
    const vTargets: Array<{ position: number, type: SnapLine['type'] }> = []
    const hTargets: Array<{ position: number, type: SnapLine['type'] }> = []

    // Other elements
    for (const el of schema.elements) {
      if (excludeSet.has(el.id) || el.hidden) {
        continue
      }
      const ex = el.layout.x ?? 0
      const ey = el.layout.y ?? 0
      const ew = typeof el.layout.width === 'number' ? el.layout.width : 0
      const eh = typeof el.layout.height === 'number' ? el.layout.height : 0

      vTargets.push(
        { position: ex, type: 'edge' },
        { position: ex + ew, type: 'edge' },
        { position: ex + ew / 2, type: 'center' },
      )
      hTargets.push(
        { position: ey, type: 'edge' },
        { position: ey + eh, type: 'edge' },
        { position: ey + eh / 2, type: 'center' },
      )
    }

    // Page margins
    const page = schema.page
    const margins = page.margins
    vTargets.push(
      { position: margins.left, type: 'margin' },
    )
    hTargets.push(
      { position: margins.top, type: 'margin' },
    )

    // Page dimensions for right/bottom margins
    const layout = engine.layout
    const dims = layout.resolvePageDimensions(page)
    vTargets.push(
      { position: dims.width - margins.right, type: 'margin' },
      { position: dims.width / 2, type: 'margin' },
    )
    hTargets.push(
      { position: dims.height - margins.bottom, type: 'margin' },
      { position: dims.height / 2, type: 'margin' },
    )

    // Guide lines from extensions
    const guides = (schema.extensions?.guides ?? []) as Array<{ orientation: string, position: number }>
    for (const g of guides) {
      if (g.orientation === 'vertical') {
        vTargets.push({ position: g.position, type: 'guide' })
      }
      else {
        hTargets.push({ position: g.position, type: 'guide' })
      }
    }

    // Element anchors
    const elLeft = proposedX
    const elRight = proposedX + proposedW
    const elCenterX = proposedX + proposedW / 2
    const elTop = proposedY
    const elBottom = proposedY + proposedH
    const elCenterY = proposedY + proposedH / 2

    let adjustedX = proposedX
    let adjustedY = proposedY
    const visibleLines: SnapLine[] = []

    // Find closest vertical snap
    let bestVDist = threshold + 1
    let bestVAdjust = 0
    let bestVLine: SnapLine | null = null

    for (const target of vTargets) {
      for (const anchor of [elLeft, elRight, elCenterX]) {
        const dist = Math.abs(anchor - target.position)
        if (dist < bestVDist) {
          bestVDist = dist
          bestVAdjust = target.position - anchor
          bestVLine = { orientation: 'vertical', position: target.position, type: target.type }
        }
      }
    }

    if (bestVLine && bestVDist <= threshold) {
      adjustedX = proposedX + bestVAdjust
      visibleLines.push(bestVLine)
    }

    // Find closest horizontal snap
    let bestHDist = threshold + 1
    let bestHAdjust = 0
    let bestHLine: SnapLine | null = null

    for (const target of hTargets) {
      for (const anchor of [elTop, elBottom, elCenterY]) {
        const dist = Math.abs(anchor - target.position)
        if (dist < bestHDist) {
          bestHDist = dist
          bestHAdjust = target.position - anchor
          bestHLine = { orientation: 'horizontal', position: target.position, type: target.type }
        }
      }
    }

    if (bestHLine && bestHDist <= threshold) {
      adjustedY = proposedY + bestHAdjust
      visibleLines.push(bestHLine)
    }

    activeSnapLines.value = visibleLines

    return { adjustedX, adjustedY, visibleLines }
  }

  function clearSnap(): void {
    activeSnapLines.value = []
  }

  return { activeSnapLines, calculateSnap, clearSnap, snapThreshold }
}
