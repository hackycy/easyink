import { describe, expect, it } from 'vitest'
import { getNextTopbarZoom } from './topbar-zoom'

describe('topbar zoom', () => {
  it('steps through 100% from nearby 5% zoom levels', () => {
    expect(getNextTopbarZoom(0.95, 1)).toBe(1)
    expect(getNextTopbarZoom(1.05, -1)).toBe(1)
  })

  it('snaps floating zoom values onto the topbar zoom grid', () => {
    expect(getNextTopbarZoom(0.949999999, 1)).toBe(1)
    expect(getNextTopbarZoom(1.050000001, -1)).toBe(1)
  })

  it('clamps to the supported zoom range', () => {
    expect(getNextTopbarZoom(0.25, -1)).toBe(0.25)
    expect(getNextTopbarZoom(4, 1)).toBe(4)
  })
})
