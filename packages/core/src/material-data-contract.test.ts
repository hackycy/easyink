import { describe, expect, it } from 'vitest'
import { resolveMaterialDataContract } from './material-data-contract'

describe('material data contract', () => {
  const contract = {
    version: 3,
    model: {
      kind: 'tabular',
      fields: {
        category: { labelKey: 'materials.chartBar.data.category', type: 'string', required: true, format: 'display' },
        value: { labelKey: 'materials.chartBar.data.value', type: 'number', required: true, format: 'raw' },
      },
    },
  } as const

  it('resolves mappings that share a record collection', () => {
    const binding = {
      kind: 'data-contract',
      mappings: {
        category: { sourceId: 'report', select: { path: 'monthlySales/month' } },
        value: { sourceId: 'report', select: { path: 'monthlySales/revenue' } },
      },
      relation: { kind: 'auto' },
    } as const

    const resolution = resolveMaterialDataContract(contract, binding, {
      monthlySales: [
        { month: '1月', revenue: 98 },
        { month: '2月', revenue: '112' },
      ],
    })

    expect(resolution.mode).toBe('record')
    expect(resolution.records).toEqual([
      { category: '1月', value: 98 },
      { category: '2月', value: 112 },
    ])
    expect(resolution.diagnostics).toEqual([])
  })

  it('resolves root record collections when source metadata exists beside runtime data', () => {
    const binding = {
      kind: 'data-contract',
      mappings: {
        category: { sourceId: 'report', select: { path: 'monthlySales/month' } },
        value: { sourceId: 'report', select: { path: 'monthlySales/revenue' } },
      },
      relation: { kind: 'auto' },
    } as const

    const resolution = resolveMaterialDataContract(contract, binding, {
      report: { name: 'Sales Report' },
      monthlySales: [
        { month: '1月', revenue: 98 },
        { month: '2月', revenue: '112' },
      ],
    })

    expect(resolution.mode).toBe('record')
    expect(resolution.records).toEqual([
      { category: '1月', value: 98 },
      { category: '2月', value: 112 },
    ])
    expect(resolution.diagnostics).toEqual([])
  })

  it('resolves source-scoped record collections when source data owns the selected path', () => {
    const binding = {
      kind: 'data-contract',
      mappings: {
        category: { sourceId: 'report', select: { path: 'monthlySales/month' } },
        value: { sourceId: 'report', select: { path: 'monthlySales/revenue' } },
      },
      relation: { kind: 'auto' },
    } as const

    const resolution = resolveMaterialDataContract(contract, binding, {
      report: {
        monthlySales: [
          { month: '1月', revenue: 98 },
          { month: '2月', revenue: '112' },
        ],
      },
    })

    expect(resolution.mode).toBe('record')
    expect(resolution.records).toEqual([
      { category: '1月', value: 98 },
      { category: '2月', value: 112 },
    ])
    expect(resolution.diagnostics).toEqual([])
  })

  it('resolves top-level arrays by index', () => {
    const binding = {
      kind: 'data-contract',
      mappings: {
        category: { sourceId: 'report', select: { path: 'category' } },
        value: { sourceId: 'report', select: { path: 'values' } },
      },
      relation: { kind: 'auto' },
    } as const

    const resolution = resolveMaterialDataContract(contract, binding, {
      category: ['1月', '2月'],
      values: [98, '112'],
    })

    expect(resolution.mode).toBe('index')
    expect(resolution.records).toEqual([
      { category: '1月', value: 98 },
      { category: '2月', value: 112 },
    ])
    expect(resolution.diagnostics).toEqual([])
  })

  it('resolves root top-level arrays when source metadata exists beside runtime data', () => {
    const binding = {
      kind: 'data-contract',
      mappings: {
        category: { sourceId: 'report', select: { path: 'category' } },
        value: { sourceId: 'report', select: { path: 'values' } },
      },
      relation: { kind: 'auto' },
    } as const

    const resolution = resolveMaterialDataContract(contract, binding, {
      report: { name: 'Sales Report' },
      category: ['1月', '2月'],
      values: [98, '112'],
    })

    expect(resolution.mode).toBe('index')
    expect(resolution.records).toEqual([
      { category: '1月', value: 98 },
      { category: '2月', value: 112 },
    ])
    expect(resolution.diagnostics).toEqual([])
  })

  it('reports missing required field mappings', () => {
    const resolution = resolveMaterialDataContract(contract, undefined, {})

    expect(resolution.diagnostics.map(diagnostic => diagnostic.fieldId)).toEqual(['category', 'value'])
    expect(resolution.diagnostics.map(diagnostic => diagnostic.code)).toEqual([
      'MATERIAL_DATA_FIELD_MISSING',
      'MATERIAL_DATA_FIELD_MISSING',
    ])
  })
})
