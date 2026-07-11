import type { CompiledMaterialProfile } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultStaticTableModel, createTableStaticNode, TABLE_STATIC_TYPE } from './schema'

describe('table static schema', () => {
  it('creates a three by three body-only default model', () => {
    const model = createDefaultStaticTableModel()
    expect(model.kind).toBe('static')
    expect(model.columns).toHaveLength(3)
    expect(model.bands.map(band => band.role)).toEqual(['body'])
    expect(model.bands[0]!.rows).toHaveLength(3)
  })

  it('delegates node creation exactly to the compiled profile', () => {
    const result = { id: 'result' }
    const createNode = vi.fn(() => result)
    const profile = { createNode } as unknown as CompiledMaterialProfile
    const input = { width: 42 }
    expect(createTableStaticNode(profile, input, 'px')).toBe(result)
    expect(createNode).toHaveBeenCalledExactlyOnceWith(TABLE_STATIC_TYPE, input, 'px')
  })
})
