import { describe, expect, it } from 'vitest'
import { prepareDesignerFacetMetadata } from './designer-facet-metadata'

describe('prepareDesignerFacetMetadata', () => {
  it('preserves the published layout facet identity', () => {
    const layout = Object.freeze({ fragment: Object.freeze({ createFragment: () => ({}) }) })

    const prepared = prepareDesignerFacetMetadata({
      extension: {},
      catalog: { group: 'test', order: 1 },
      layout,
    }, 'designer') as { layout?: unknown }

    expect(prepared.layout).toBe(layout)
  })
})
