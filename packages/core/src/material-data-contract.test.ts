import { describe, expect, it } from 'vitest'
import { getMaterialDataSlot, resolveMaterialDataContract } from './material-data-contract'

describe('material data contract', () => {
  const contract = {
    version: 1,
    slots: [
      { id: 'category', labelKey: 'materials.chartBar.data.category', required: true, kind: 'field', scope: 'series', bindIndex: 0 },
      { id: 'value', labelKey: 'materials.chartBar.data.value', required: true, kind: 'field', scope: 'series', valueType: 'number', bindIndex: 1 },
    ],
  } as const

  it('resolves field role bindings by ordered bind index', () => {
    const bindings = [
      { sourceId: 'report', fieldPath: 'monthlySales/month', bindIndex: 0 },
      { sourceId: 'report', fieldPath: 'monthlySales/value', bindIndex: 1 },
    ]

    const resolution = resolveMaterialDataContract(contract, bindings, {
      monthlySales: [
        { month: '1月', value: 98 },
      ],
    })

    expect(getMaterialDataSlot(resolution, 'category')?.binding?.fieldPath).toBe('monthlySales/month')
    expect(getMaterialDataSlot(resolution, 'value')?.binding?.fieldPath).toBe('monthlySales/value')
    expect(resolution.diagnostics).toEqual([])
  })

  it('reports missing required slots', () => {
    const resolution = resolveMaterialDataContract(contract, undefined, {})

    expect(resolution.diagnostics.map(diagnostic => diagnostic.slotId)).toEqual(['category', 'value'])
    expect(resolution.diagnostics.map(diagnostic => diagnostic.code)).toEqual([
      'MATERIAL_DATA_SLOT_MISSING',
      'MATERIAL_DATA_SLOT_MISSING',
    ])
  })
})
