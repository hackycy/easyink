import type { MaterialDataContract } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import {
  applyMaterialDataFieldMapping,
  canBindMaterialDataField,
  clearMaterialDataFieldMapping,
  findMaterialDataFieldMapping,
} from './material-data-binding'

describe('material data binding helpers', () => {
  const contract: MaterialDataContract = {
    version: 3,
    model: {
      kind: 'tabular',
      fields: {
        category: { labelKey: 'materials.chartBar.data.category', type: 'string', required: true, format: 'display' },
        value: { labelKey: 'materials.chartBar.data.value', type: 'number', required: true, format: 'raw' },
      },
    },
  }

  it('maps a source field to a target model field', () => {
    const binding = applyMaterialDataFieldMapping(contract, undefined, {
      sourceId: 'sales-report',
      fieldPath: 'monthlySales/month',
      fieldLabel: '月份',
    }, 'category')

    expect(binding).toEqual({
      kind: 'data-contract',
      relation: { kind: 'auto' },
      mappings: {
        category: expect.objectContaining({
          sourceId: 'sales-report',
          select: {
            path: 'monthlySales/month',
            key: undefined,
            label: '月份',
            tag: undefined,
          },
        }),
      },
    })
  })

  it('keeps complete source paths for every mapping', () => {
    const first = applyMaterialDataFieldMapping(contract, undefined, {
      sourceId: 'sales-report',
      fieldPath: 'monthlySales/month',
      fieldLabel: '月份',
    }, 'category')

    const binding = applyMaterialDataFieldMapping(contract, first, {
      sourceId: 'sales-report',
      fieldPath: 'monthlySales/revenue',
      fieldLabel: '销售额',
    }, 'value')

    expect(binding?.mappings.category?.select.path).toBe('monthlySales/month')
    expect(binding?.mappings.value?.select.path).toBe('monthlySales/revenue')
  })

  it('does not reject fields from another collection at design time', () => {
    const binding = applyMaterialDataFieldMapping(contract, undefined, {
      sourceId: 'sales-report',
      fieldPath: 'monthlySales/month',
      fieldLabel: '月份',
    }, 'category')

    const result = canBindMaterialDataField(contract, binding, {
      sourceId: 'sales-report',
      fieldPath: 'weeklySales/revenue',
      fieldLabel: '周销售额',
    }, 'value')

    expect(result).toEqual({ accepted: true })
  })

  it('clears only the selected target field mapping', () => {
    const withCategory = applyMaterialDataFieldMapping(contract, undefined, {
      sourceId: 'sales-report',
      fieldPath: 'monthlySales/month',
      fieldLabel: '月份',
    }, 'category')
    const binding = applyMaterialDataFieldMapping(contract, withCategory, {
      sourceId: 'sales-report',
      fieldPath: 'monthlySales/revenue',
      fieldLabel: '销售额',
    }, 'value')

    expect(clearMaterialDataFieldMapping(contract, binding, 'category')).toEqual({
      kind: 'data-contract',
      relation: { kind: 'auto' },
      mappings: {
        value: expect.objectContaining({
          select: expect.objectContaining({ path: 'monthlySales/revenue' }),
        }),
      },
    })
  })

  it('finds mappings by target field id', () => {
    const binding = applyMaterialDataFieldMapping(contract, undefined, {
      sourceId: 'sales-report',
      fieldPath: 'monthlySales/month',
      fieldLabel: '月份',
    }, 'category')

    expect(findMaterialDataFieldMapping(contract, binding, 'category')?.select.path).toBe('monthlySales/month')
  })
})
