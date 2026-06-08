import { describe, expect, it } from 'vitest'
import { resolveScrollPositionForSurfaceCenter, resolveVisibleSurfaceRect } from './canvas-viewport'

describe('canvas viewport geometry', () => {
  it('converts the visible scroll area from css pixels to document units', () => {
    const rect = resolveVisibleSurfaceRect({
      unit: 'mm',
      zoom: 2,
      scrollRect: { left: 100, top: 80 },
      surfaceRect: { left: 24.4094488189, top: -33.3858267717 },
      viewportSize: { width: 377.9527559055, height: 188.9763779528 },
    })

    expect(rect.x).toBeCloseTo(10)
    expect(rect.y).toBeCloseTo(15)
    expect(rect.width).toBeCloseTo(50)
    expect(rect.height).toBeCloseTo(25)
  })

  it('preserves negative visible origins so minimap clipping remains accurate', () => {
    const rect = resolveVisibleSurfaceRect({
      unit: 'px',
      zoom: 1,
      scrollRect: { left: 100, top: 100 },
      surfaceRect: { left: 140, top: 120 },
      viewportSize: { width: 200, height: 100 },
    })

    expect(rect).toEqual({ x: -40, y: -20, width: 200, height: 100 })
  })

  it('converts a minimap surface point to a centered scroll position', () => {
    const scroll = resolveScrollPositionForSurfaceCenter(
      { x: 50, y: 25 },
      {
        unit: 'mm',
        zoom: 2,
        scrollRect: { left: 100, top: 80 },
        surfaceRect: { left: 180, top: 120 },
        scrollOffset: { left: 20, top: 10 },
        viewportSize: { width: 300, height: 200 },
      },
    )

    expect(scroll.left).toBeCloseTo(327.9527559055)
    expect(scroll.top).toBeCloseTo(138.9763779528)
  })
})
