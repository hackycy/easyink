import { describe, expect, it } from 'vitest'
import { createCommittedPageSlotRegistry } from './committed-page-slots'

describe('committed page slot registry', () => {
  it('resolves sparse page indices without scanning DOM', () => {
    const registry = createCommittedPageSlotRegistry()
    const first = document.createElement('div')
    const second = document.createElement('div')

    registry.register(2, first)
    registry.register(100, second)

    expect(registry.get(2)).toBe(first)
    expect(registry.get(100)).toBe(second)
    expect(registry.get(3)).toBeUndefined()
  })

  it('rejects duplicate page indices deterministically', () => {
    const registry = createCommittedPageSlotRegistry()
    registry.register(4, document.createElement('div'))

    expect(() => registry.register(4, document.createElement('div')))
      .toThrow('VIEWER_PAGE_SLOT_INDEX_DUPLICATE')
  })
})
