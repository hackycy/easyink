import { describe, expect, it } from 'vitest'
import { materialToolbarButtonStyle, materialToolbarDockStyle, materialToolbarShellStyle } from './material-toolbar'

describe('material toolbar helpers', () => {
  it('anchors the toolbar outside the material top-left corner', () => {
    const style = materialToolbarDockStyle({ x: 12, y: 8 }, 'mm')

    expect(style.left).toBe('12mm')
    expect(style.top).toBe('8mm')
    expect(style.transform).toBe('translateY(calc(-100% - 2mm))')
    expect(style.pointerEvents).toBe('auto')
  })

  it('exposes disabled danger button styling without changing layout size', () => {
    const style = materialToolbarButtonStyle(true, true)

    expect(style.width).toBe('24px')
    expect(style.minWidth).toBe('24px')
    expect(style.opacity).toBe('0.36')
    expect(style.color).toContain('#d92d20')
  })

  it('keeps material toolbar actions on a single expanded row', () => {
    const style = materialToolbarShellStyle()

    expect(style.flexWrap).toBe('nowrap')
    expect(style.width).toBe('max-content')
    expect(style.maxWidth).toBe('none')
    expect(style.whiteSpace).toBe('nowrap')
  })
})
