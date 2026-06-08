import { describe, expect, it } from 'vitest'
import {
  projectMinimapClientPointToSurface,
  resolveMinimapRectStyle,
  resolveMinimapViewportRect,
} from './minimap-viewport'

describe('minimap viewport geometry', () => {
  it('clips a partially visible viewport without losing its outside offset', () => {
    const rect = resolveMinimapViewportRect(
      { x: -20, y: 10, width: 60, height: 30 },
      { x: 0, y: 0, width: 100, height: 100 },
    )

    expect(rect).toEqual({ x: 0, y: 10, width: 40, height: 30 })
  })

  it('keeps a full-coverage viewport visible', () => {
    const rect = resolveMinimapViewportRect(
      { x: -20, y: -20, width: 140, height: 140 },
      { x: 0, y: 0, width: 100, height: 100 },
    )

    expect(rect).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('projects rects against shifted minimap bounds', () => {
    const style = resolveMinimapRectStyle(
      { x: -25, y: 50, width: 50, height: 100 },
      { x: -50, y: 0, width: 200, height: 400 },
    )

    expect(style).toEqual({
      left: '12.5%',
      top: '12.5%',
      width: '25%',
      height: '25%',
    })
  })

  it('projects client points into surface coordinates', () => {
    const point = projectMinimapClientPointToSurface(
      { x: 150, y: 80 },
      { left: 100, top: 30, width: 200, height: 100 },
      { x: -50, y: 10, width: 400, height: 200 },
    )

    expect(point).toEqual({ x: 50, y: 110 })
  })
})
