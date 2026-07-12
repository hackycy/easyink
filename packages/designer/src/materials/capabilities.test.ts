import { createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { filterRotatableElements, isElementRotatable, isMaterialRotatable } from './capabilities'

describe('material capability helpers', () => {
  it('treats missing material or missing rotatable flag as rotatable', () => {
    const store = {
      getMaterialManifest: (type: string) => type === 'registered'
        ? createTestMaterialManifest({ type })
        : undefined,
    }

    expect(isMaterialRotatable(undefined)).toBe(true)
    expect(isElementRotatable(store, { type: 'registered' })).toBe(true)
    expect(isElementRotatable(store, { type: 'unknown' })).toBe(true)
  })

  it('only blocks elements whose material explicitly disables rotation', () => {
    const store = {
      getMaterialManifest: (type: string) => manifest(type, type !== 'table-data'),
    }

    expect(isElementRotatable(store, { type: 'table-data' })).toBe(false)
    expect(isElementRotatable(store, { type: 'text' })).toBe(true)
  })

  it('filters mixed selections to rotatable elements', () => {
    const store = {
      getMaterialManifest: (type: string) => manifest(type, type !== 'chart'),
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

function manifest(type: string, rotatable: boolean) {
  const base = createTestMaterialManifest({ type })
  return { ...base, common: { ...base.common, interaction: { ...base.common.interaction, rotatable } } }
}
