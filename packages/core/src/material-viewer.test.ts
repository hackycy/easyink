import type { ViewerRenderContext } from './material-viewer'
import { describe, expect, it } from 'vitest'

describe('viewer render context', () => {
  it('exposes resolvedModel without a resolvedProps compatibility alias', () => {
    const context = { resolvedModel: { value: 1 } } as unknown as ViewerRenderContext
    const hasLegacyAlias: 'resolvedProps' extends keyof ViewerRenderContext ? true : false = false

    expect(context.resolvedModel.value).toBe(1)
    expect(hasLegacyAlias).toBe(false)
  })
})
