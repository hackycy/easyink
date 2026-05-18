import { describe, expect, it } from 'vitest'
import { resolveContextMenuPosition } from './context-menu-position'

describe('resolveContextMenuPosition', () => {
  it('keeps the menu at the pointer when it fits in the viewport', () => {
    expect(resolveContextMenuPosition(
      { x: 120, y: 140 },
      { width: 180, height: 220 },
      { width: 800, height: 600 },
    )).toEqual({ x: 120, y: 140 })
  })

  it('opens above the pointer when the menu would overflow the viewport bottom', () => {
    expect(resolveContextMenuPosition(
      { x: 240, y: 560 },
      { width: 180, height: 220 },
      { width: 800, height: 600 },
    )).toEqual({ x: 240, y: 340 })
  })

  it('opens left of the pointer when the menu would overflow the viewport right edge', () => {
    expect(resolveContextMenuPosition(
      { x: 790, y: 160 },
      { width: 180, height: 220 },
      { width: 800, height: 600 },
    )).toEqual({ x: 610, y: 160 })
  })

  it('clamps oversized menus inside the viewport margin', () => {
    expect(resolveContextMenuPosition(
      { x: 4, y: 4 },
      { width: 1000, height: 900 },
      { width: 800, height: 600 },
    )).toEqual({ x: 8, y: 8 })
  })
})
