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

  it('applies custom mapping formatters to indexed records', () => {
    const binding = {
      kind: 'data-contract',
      mappings: {
        category: { sourceId: 'report', select: { path: 'category' }, format: { mode: 'custom', custom: { source: 'value => String(value) + "月"' } } },
        value: { sourceId: 'report', select: { path: 'values' }, format: { mode: 'custom', custom: { source: 'value => Number(value) / 100' } } },
      },
      relation: { kind: 'auto' },
    } as const

    const resolution = resolveMaterialDataContract(contract, binding, {
      category: ['1', '2'],
      values: [9800, '11200'],
    })

    expect(resolution.mode).toBe('index')
    expect(resolution.records).toEqual([
      { category: '1月', value: 98 },
      { category: '2月', value: 112 },
    ])
    expect(resolution.diagnostics).toEqual([])
  })

  it('applies custom mapping formatters to shared record collections', () => {
    const binding = {
      kind: 'data-contract',
      mappings: {
        category: { sourceId: 'report', select: { path: 'monthlySales/month' }, format: { mode: 'custom', custom: { source: 'value => "M" + String(value)' } } },
        value: { sourceId: 'report', select: { path: 'monthlySales/revenue' }, format: { mode: 'custom', custom: { source: 'value => Number(value) / 100' } } },
      },
      relation: { kind: 'auto' },
    } as const

    const resolution = resolveMaterialDataContract(contract, binding, {
      monthlySales: [
        { month: '01', revenue: 9800 },
        { month: '02', revenue: '11200' },
      ],
    })

    expect(resolution.mode).toBe('record')
    expect(resolution.records).toEqual([
      { category: 'M01', value: 98 },
      { category: 'M02', value: 112 },
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
