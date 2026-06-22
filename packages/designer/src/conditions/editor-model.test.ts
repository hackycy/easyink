import { describe, expect, it } from 'vitest'
import { createRenderCondition, isRenderConditionComplete, normalizeCompareOperands } from './editor-model'

describe('condition editor model', () => {
  it('keeps new and dropped-field comparisons local until the literal is completed', () => {
    const empty = createRenderCondition()
    const dropped = createRenderCondition('customer/name')
    expect(isRenderConditionComplete(empty)).toBe(false)
    expect(isRenderConditionComplete(dropped)).toBe(false)

    if (dropped.rule.kind !== 'compare')
      throw new Error('Expected compare rule')
    dropped.rule.operands[1] = { kind: 'literal', value: 'Ada' }
    expect(isRenderConditionComplete(dropped)).toBe(true)
  })

  it('normalizes operator arity without discarding existing operands', () => {
    const operands = [{ kind: 'field' as const, path: 'total' }, { kind: 'literal' as const, value: 1 }]
    expect(normalizeCompareOperands('exists', operands)).toEqual([operands[0]])
    expect(normalizeCompareOperands('between', operands)).toEqual([operands[0], operands[1], { kind: 'literal', value: '' }])
  })
})
