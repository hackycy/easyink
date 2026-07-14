import type { LayoutConstraints, ViewerCssUnit } from './index'
import type { ViewerRenderContext } from './material-viewer'
import { describe, expect, it } from 'vitest'
import { toViewerCssUnit } from './index'

describe('viewer render context', () => {
  it('exposes resolvedModel without a resolvedProps compatibility alias', () => {
    const context = { resolvedModel: { value: 1 } } as unknown as ViewerRenderContext
    const hasLegacyAlias: 'resolvedProps' extends keyof ViewerRenderContext ? true : false = false

    expect(context.resolvedModel.value).toBe(1)
    expect(hasLegacyAlias).toBe(false)
  })
})

describe('viewer CSS unit public API', () => {
  it('exports the canonical CSS unit type and converts inch to in', () => {
    const convert: (unit: LayoutConstraints['unit']) => ViewerCssUnit = toViewerCssUnit

    expect(convert('inch')).toBe('in')
    expect(convert('mm')).toBe('mm')
    expect(convert('pt')).toBe('pt')
    expect(convert('px')).toBe('px')
  })
})
