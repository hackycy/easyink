import { describe, expect, it } from 'vitest'
import { createConditionGroup, createRenderCondition, isRenderConditionComplete, normalizeRenderCondition, updateRowOperator } from './editor-model'

describe('condition editor model', () => {
  it('keeps incomplete rows local and normalizes blank groups to empty conditions', () => {
    const empty = createRenderCondition()
    empty.groups.push(createConditionGroup())
    expect(isRenderConditionComplete(empty)).toBe(true)
    expect(normalizeRenderCondition(empty).groups).toEqual([])

    const dropped = createRenderCondition()
    dropped.groups = [{ conditions: [{ source: { path: 'customer/name' }, operator: { compare: 'eq' }, valueType: 'string', value: { kind: 'literal', value: 'Ada' } }] }]
    expect(isRenderConditionComplete(dropped)).toBe(true)
  })

  it('normalizes operator values without discarding the first value', () => {
    const row = { source: { path: 'total' }, operator: { compare: 'eq' as const }, valueType: 'number' as const, value: { kind: 'literal' as const, value: 1 } }
    expect(updateRowOperator(row, { compare: 'exists' })).toEqual({ source: { path: 'total' }, operator: { compare: 'exists' } })
    expect(updateRowOperator(row, { compare: 'between' }).value).toEqual([{ kind: 'literal', value: 1 }, { kind: 'literal', value: '' }])
  })
})
