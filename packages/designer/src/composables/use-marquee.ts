import type { EasyInkEngine } from '@easyink/core'
import type { useCanvas } from './use-canvas'
import type { useSelection } from './use-selection'
import { fromPixels } from '@easyink/core'
import { ref } from 'vue'

export function useMarquee(
  engine: EasyInkEngine,
  selection: ReturnType<typeof useSelection>,
  canvas: ReturnType<typeof useCanvas>,
) {
  const isMarquee = ref(false)
  const marqueeRect = ref<{ x: number, y: number, width: number, height: number } | null>(null)

  let _startScreenX = 0
  let _startScreenY = 0
  let _pageOriginX = 0
  let _pageOriginY = 0

  function _screenToPage(screenX: number, screenY: number) {
    const unit = engine.schema.schema.page.unit
    const zoom = canvas.zoom.value
    return {
      x: fromPixels(screenX - _pageOriginX, unit, 96, zoom),
      y: fromPixels(screenY - _pageOriginY, unit, 96, zoom),
    }
  }

  function startMarquee(e: MouseEvent, pageOriginX: number, pageOriginY: number): void {
    _startScreenX = e.clientX
    _startScreenY = e.clientY
    _pageOriginX = pageOriginX
    _pageOriginY = pageOriginY
    isMarquee.value = true
    marqueeRect.value = null

    document.addEventListener('mousemove', _onMarqueeMove)
    document.addEventListener('mouseup', _onMarqueeEnd)
  }

  function _onMarqueeMove(e: MouseEvent): void {
    if (!isMarquee.value) {
      return
    }
    const start = _screenToPage(_startScreenX, _startScreenY)
    const current = _screenToPage(e.clientX, e.clientY)

    marqueeRect.value = {
      height: Math.abs(current.y - start.y),
      width: Math.abs(current.x - start.x),
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
    }
  }

  function _onMarqueeEnd(): void {
    document.removeEventListener('mousemove', _onMarqueeMove)
    document.removeEventListener('mouseup', _onMarqueeEnd)

    isMarquee.value = false

    if (!marqueeRect.value) {
      selection.deselect()
      return
    }

    const rect = marqueeRect.value
    const materials = engine.schema.schema.materials
    const hitIds: string[] = []

    for (const el of materials) {
      if (el.hidden || el.locked) {
        continue
      }
      const ex = el.layout.x ?? 0
      const ey = el.layout.y ?? 0
      const ew = typeof el.layout.width === 'number' ? el.layout.width : 0
      const eh = typeof el.layout.height === 'number' ? el.layout.height : 0

      // AABB intersection
      if (
        ex < rect.x + rect.width
        && ex + ew > rect.x
        && ey < rect.y + rect.height
        && ey + eh > rect.y
      ) {
        hitIds.push(el.id)
      }
    }

    marqueeRect.value = null

    if (hitIds.length > 0) {
      selection.selectMany(hitIds)
    }
    else {
      selection.deselect()
    }
  }

  return { isMarquee, marqueeRect, startMarquee }
}
