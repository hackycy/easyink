import { viewerText } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { MaterialRendererRegistry } from './material-registry'

describe('material renderer registry page-repeat metadata', () => {
  it('updates metadata on activation, replacement, unregister, and clear', () => {
    const registry = new MaterialRendererRegistry()
    const extension = { render: () => ({ tree: viewerText('marker') }) }

    registry.register('marker', { kind: 'none' }, extension, { pageRepeat: 'every-output-page' })
    expect(registry.isPageAware('marker')).toBe(true)

    registry.register('marker', { kind: 'none' }, extension, { pageRepeat: 'none' })
    expect(registry.isPageAware('marker')).toBe(false)

    registry.register('marker', { kind: 'none' }, extension, { pageRepeat: 'every-output-page' })
    registry.unregister('marker')
    expect(registry.isPageAware('marker')).toBe(false)

    registry.register('marker', { kind: 'none' }, extension, { pageRepeat: 'every-output-page' })
    registry.clear()
    expect(registry.isPageAware('marker')).toBe(false)
  })
})
