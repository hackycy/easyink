import type { ConditionCompareOperator, ConditionGroup, ConditionQuantifier, ConditionRow, ConditionValue, MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { evaluateCondition, resolveConditionalNode } from './condition'

const literal = (value: string | number | boolean | null): ConditionValue => ({ kind: 'literal', value })
function row(operator: ConditionCompareOperator, path: string, value?: ConditionValue | ConditionValue[], valueType: ConditionRow['valueType'] = 'string'): ConditionRow {
  return {
    source: { path },
    operator: { compare: operator },
    ...(value === undefined ? {} : { value, valueType }),
  }
}
function collectionRow(
  quantifier: ConditionQuantifier,
  operator: ConditionCompareOperator,
  path: string,
  value?: ConditionValue | ConditionValue[],
  valueType: ConditionRow['valueType'] = 'string',
): ConditionRow {
  return {
    ...row(operator, path, value, valueType),
    operator: { compare: operator, quantifier },
  }
}
const groups = (...conditions: ConditionRow[]): ConditionGroup[] => [{ conditions }]

describe('condition evaluator', () => {
  it('evaluates group AND, group OR, explicit types, and case options', () => {
    expect(evaluateCondition(groups(row('gt', 'qty', literal(2), 'number')), { qty: '3' }).value).toBe(true)
    expect(evaluateCondition([
      { conditions: [row('eq', 'state', literal('closed'))] },
      { conditions: [{ ...row('eq', 'name', literal('INK')), options: { caseSensitive: false } }, row('gt', 'qty', literal(2), 'number')] },
    ], { state: 'open', name: 'ink', qty: 3 }).value).toBe(true)
  })

  it.each([
    ['eq', 2, literal(2), 'number', true],
    ['neq', 2, literal(3), 'number', true],
    ['gte', 2, literal(2), 'number', true],
    ['lt', 1, literal(2), 'number', true],
    ['lte', 2, literal(2), 'number', true],
    ['between', 2, [literal(1), literal(2)], 'number', true],
    ['notBetween', 3, [literal(1), literal(2)], 'number', true],
    ['in', 'a', [literal('a'), literal('b')], 'string', true],
    ['notIn', 'c', [literal('a'), literal('b')], 'string', true],
    ['contains', 'easyink', literal('ink'), 'string', true],
    ['notContains', 'easyink', literal('hard'), 'string', true],
    ['startsWith', 'easyink', literal('easy'), 'string', true],
    ['endsWith', 'easyink', literal('ink'), 'string', true],
  ] as Array<[ConditionCompareOperator, string | number, ConditionValue | ConditionValue[], ConditionRow['valueType'], boolean]>)('evaluates %s', (operator, actual, value, valueType, expected) => {
    expect(evaluateCondition(groups(row(operator, 'value', value, valueType)), { value: actual }).value).toBe(expected)
  })

  it('treats empty conditions as true and distinguishes missing, null, and empty values', () => {
    expect(evaluateCondition([], {}).value).toBe(true)
    expect(evaluateCondition(groups(row('exists', 'value')), { value: null }).value).toBe(true)
    expect(evaluateCondition(groups(row('exists', 'value')), {}).value).toBe(false)
    expect(evaluateCondition(groups(row('isEmpty', 'value')), { value: [] }).value).toBe(true)
  })

  it('uses Kleene logic and short circuits decisive results', () => {
    const missing = row('eq', 'missing', literal(1), 'number')
    expect(evaluateCondition([{ conditions: [row('eq', 'one', literal(2), 'number'), missing] }], { one: 1 }).value).toBe(false)
    expect(evaluateCondition([{ conditions: [missing] }, { conditions: [row('eq', 'one', literal(1), 'number')] }], { one: 1 }).value).toBe(true)
  })

  it('evaluates quantified operators per full field path rather than as a group scope', () => {
    const conditionGroups: ConditionGroup[] = [{
      conditions: [
        collectionRow('any', 'gt', 'items/price', literal(100), 'number'),
        collectionRow('any', 'gt', 'items/stock', literal(0), 'number'),
      ],
    }]
    expect(evaluateCondition(conditionGroups, { items: [{ price: 120, stock: 0 }, { price: 80, stock: 2 }] }).value).toBe(true)
    expect(evaluateCondition(conditionGroups, { items: [{ price: 80, stock: 0 }] }).value).toBe(false)
  })

  it('implements any, all, none, and empty collection semantics', () => {
    const scoped = (quantifier: ConditionQuantifier): ConditionGroup[] => groups(collectionRow(quantifier, 'gt', 'items', literal(0), 'number'))
    expect(evaluateCondition(scoped('any'), { items: [] }).value).toBe(false)
    expect(evaluateCondition(scoped('all'), { items: [] }).value).toBe(true)
    expect(evaluateCondition(scoped('none'), { items: [] }).value).toBe(true)
    expect(evaluateCondition(scoped('all'), { items: [1, 2] }).value).toBe(true)
    expect(evaluateCondition(scoped('none'), { items: [-1, 0] }).value).toBe(true)
  })

  it('supports field values with quantified operators and reports scalar fields used as collections', () => {
    const conditionGroups: ConditionGroup[] = groups({
      source: { path: 'items/price' },
      operator: { compare: 'gt', quantifier: 'any' },
      valueType: 'number',
      value: { kind: 'field', field: { path: 'threshold' } },
    })
    expect(evaluateCondition(conditionGroups, { threshold: 100, items: [{ price: 120 }] }).value).toBe(true)
    const invalid = evaluateCondition(groups(collectionRow('any', 'gt', 'price', literal(100), 'number')), { price: 120 })
    expect(invalid.value).toBe('unknown')
    expect(invalid.diagnostics[0]?.code).toBe('CONDITION_COLLECTION_EXPECTED')
  })

  it('blocks prototype paths and reports failures without exposing values', () => {
    const result = evaluateCondition(groups(row('eq', '__proto__.polluted', literal('secret'))), {})
    expect(result.value).toBe('unknown')
    expect(result.diagnostics[0]).toMatchObject({ code: 'CONDITION_FIELD_MISSING', fieldPath: '__proto__.polluted' })
    expect(JSON.stringify(result.diagnostics)).not.toContain('secret')
  })

  it('applies matched behavior, hidden effect, unknown policy, and static hidden priority', () => {
    const node = {
      id: 'n',
      type: 'text',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      props: {},
      renderCondition: { whenMatched: 'show' as const, groups: groups(row('eq', 'missing', literal(1), 'number')), onUnknown: 'hide' as const, whenHidden: 'reserve' as const },
    } satisfies MaterialNode
    expect(resolveConditionalNode(node, {}).state).toBe('reserve')
    expect(resolveConditionalNode({ ...node, renderCondition: { ...node.renderCondition, whenMatched: 'hide', groups: [] } }, {}).state).toBe('reserve')
    expect(resolveConditionalNode({ ...node, hidden: true }, {}).diagnostics).toEqual([])
  })

  it('validates datetime timezone rules through explicit types', () => {
    const conditionGroups = groups({ source: { path: 'left' }, operator: { compare: 'eq' }, valueType: 'datetime', value: { kind: 'field', field: { path: 'right' } } })
    expect(evaluateCondition(conditionGroups, { left: '2025-01-01', right: '2025-01-01T00:00:00Z' }).value).toBe(true)
    expect(evaluateCondition(conditionGroups, { left: '2025-01-01T00:00:00', right: '2025-01-01T00:00:00Z' }).value).toBe('unknown')
    expect(evaluateCondition(conditionGroups, { left: '2025-02-30', right: '2025-03-02' }).value).toBe('unknown')
  })

  it('stops oversized collection scans at the fixed limit', () => {
    const conditionGroups: ConditionGroup[] = groups(collectionRow('any', 'eq', 'items', literal(-1), 'number'))
    const result = evaluateCondition(conditionGroups, { items: Array.from({ length: 10_001 }, (_, index) => index) })
    expect(result.value).toBe('unknown')
    expect(result.diagnostics.filter(item => item.code === 'CONDITION_LIMIT_EXCEEDED')).toHaveLength(1)
  })
})
