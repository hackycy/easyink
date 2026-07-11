import type { CompiledMaterialProfile } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultDataTableModel, createTableDataNode, TABLE_DATA_TYPE } from './schema'

describe('table data schema', () => {
  it('creates deterministic header, detail, and footer bands with one detail template', () => {
    const first = createDefaultDataTableModel()
    const second = createDefaultDataTableModel()
    expect(second).toEqual(first)
    expect(first.columns).toHaveLength(3)
    expect(first.bands.map(band => band.role)).toEqual(['header', 'detail', 'footer'])
    expect(first.bands.every(band => band.rows.length === 1)).toBe(true)
    const ids = [
      ...first.columns.map(column => column.id),
      ...first.bands.flatMap(band => [band.id, ...band.rows.flatMap(row => [row.id, ...row.cells.map(cell => cell.id)])]),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    expect(first.data).toEqual({ collectionPort: 'records' })
  })

  it('delegates node creation exactly to the compiled profile', () => {
    const result = { id: 'result' }
    const createNode = vi.fn(() => result)
    const profile = { createNode } as unknown as CompiledMaterialProfile
    const input = { height: 42 }
    expect(createTableDataNode(profile, input, 'inch')).toBe(result)
    expect(createNode).toHaveBeenCalledExactlyOnceWith(TABLE_DATA_TYPE, input, 'inch')
  })
})
