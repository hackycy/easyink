import type { MaterialDataContract } from '@easyink/core'
import type { BindingRef } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import {
  applyMaterialDataSlotBinding,
  canBindMaterialDataSlot,
  clearMaterialDataSlotBinding,
  findMaterialDataSlotBinding,
} from './material-data-binding'

describe('material data binding helpers', () => {
  const contract: MaterialDataContract = {
    version: 1,
    slots: [
      { id: 'category', label: '分类字段', required: true, kind: 'field', scope: 'series', bindIndex: 0 },
      { id: 'value', label: '数值字段', required: true, kind: 'field', scope: 'series', valueType: 'number', bindIndex: 1 },
    ],
  }

  it('binds the first field role without creating a collection binding', () => {
    const bindings = applyMaterialDataSlotBinding(contract, undefined, {
      sourceId: 'sales-report',
      fieldPath: 'monthlySales/month',
      fieldLabel: '月份',
    }, 'category')

    expect(bindings).toEqual([
      expect.objectContaining({
        sourceId: 'sales-report',
        fieldPath: 'monthlySales/month',
        bindIndex: 0,
        fieldLabel: '月份',
      }),
    ])
  })

  it('binds a scoped field into its ordered field role only', () => {
    const bindings = applyMaterialDataSlotBinding(contract, undefined, {
      sourceId: 'sales-report',
      fieldPath: 'monthlySales/revenue',
      fieldLabel: '销售额',
    }, 'value')

    expect(bindings).toEqual([
      expect.objectContaining({
        fieldPath: 'monthlySales/revenue',
        bindIndex: 1,
      }),
    ])
  })

  it('rejects scoped fields outside the already bound collection', () => {
    const bindings: BindingRef[] = [
      {
        sourceId: 'sales-report',
        fieldPath: 'monthlySales/month',
        bindIndex: 0,
      },
    ]

    const result = canBindMaterialDataSlot(contract, bindings, {
      sourceId: 'sales-report',
      fieldPath: 'weeklySales/revenue',
      fieldLabel: '周销售额',
    }, 'value')

    expect(result).toEqual({
      accepted: false,
      message: 'Collection path mismatch',
      messageKey: 'designer.dataSource.collectionMismatch',
    })
  })

  it('clears only the selected field role', () => {
    const bindings: BindingRef[] = [
      { sourceId: 'sales-report', fieldPath: 'monthlySales/month', bindIndex: 0 },
      { sourceId: 'sales-report', fieldPath: 'monthlySales/revenue', bindIndex: 1 },
    ]

    expect(clearMaterialDataSlotBinding(contract, bindings, 'category')).toEqual([
      { sourceId: 'sales-report', fieldPath: 'monthlySales/revenue', bindIndex: 1 },
    ])
  })

  it('finds bindings by bind index', () => {
    const bindings: BindingRef[] = [
      { sourceId: 'sales-report', fieldPath: 'monthlySales/month', bindIndex: 0 },
    ]

    expect(findMaterialDataSlotBinding(contract, bindings, 'category')?.fieldPath).toBe('monthlySales/month')
  })
})
