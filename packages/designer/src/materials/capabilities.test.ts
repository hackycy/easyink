import { describe, expect, it } from 'vitest'
import { filterRotatableElements, isElementRotatable, isMaterialRotatable } from './capabilities'

describe('material capability helpers', () => {
  it('treats missing material or missing rotatable flag as rotatable', () => {
    const store = {
      getMaterial: (type: string) => type === 'registered'
        ? { capabilities: {} }
        : undefined,
    }

    expect(isMaterialRotatable(undefined)).toBe(true)
    expect(isElementRotatable(store, { type: 'registered' })).toBe(true)
    expect(isElementRotatable(store, { type: 'unknown' })).toBe(true)
  })

  it('only blocks elements whose material explicitly disables rotation', () => {
    const store = {
      getMaterial: (type: string) => ({
        capabilities: { rotatable: type !== 'table-data' },
      }),
    }

    expect(isElementRotatable(store, { type: 'table-data' })).toBe(false)
    expect(isElementRotatable(store, { type: 'text' })).toBe(true)
  })

  it('filters mixed selections to rotatable elements', () => {
    const store = {
      getMaterial: (type: string) => ({
        capabilities: { rotatable: type !== 'chart' },
      }),
    }
    const nodes = [
      { id: 'text-1', type: 'text' },
      { id: 'chart-1', type: 'chart' },
    ]

    expect(filterRotatableElements(store, nodes)).toEqual([
      { id: 'text-1', type: 'text' },
    ])
  })
})
