import type { CompareOperator, ConditionNode, MaterialNode, ValueExpression } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { evaluateCondition, resolveConditionalNode } from './condition'

const field = (path: string, cast?: 'number' | 'datetime') => ({ kind: 'field' as const, path, cast })
const literal = (value: string | number | boolean | null) => ({ kind: 'literal' as const, value })
const compare = (operator: CompareOperator, ...operands: ValueExpression[]): ConditionNode => ({ kind: 'compare', operator, operands })

describe('condition evaluator', () => {
  it('evaluates comparisons, explicit casts, and case options', () => {
    expect(evaluateCondition(compare('gt', field('qty', 'number'), literal(2)), { qty: '3' }).value).toBe(true)
    expect(evaluateCondition({ kind: 'compare', operator: 'eq', operands: [field('name'), literal('INK')], options: { caseSensitive: false } }, { name: 'ink' }).value).toBe(true)
  })

  it.each([
    ['eq', [literal(2), literal(2)], true],
    ['neq', [literal(2), literal(3)], true],
    ['gte', [literal(2), literal(2)], true],
    ['lt', [literal(1), literal(2)], true],
    ['lte', [literal(2), literal(2)], true],
    ['between', [literal(2), literal(1), literal(2)], true],
    ['notBetween', [literal(3), literal(1), literal(2)], true],
    ['in', [literal('a'), literal('a'), literal('b')], true],
    ['notIn', [literal('c'), literal('a'), literal('b')], true],
    ['contains', [literal('easyink'), literal('ink')], true],
    ['notContains', [literal('easyink'), literal('hard')], true],
    ['startsWith', [literal('easyink'), literal('easy')], true],
    ['endsWith', [literal('easyink'), literal('ink')], true],
    ['notExists', [field('missing')], true],
    ['isNotEmpty', [literal('value')], true],
  ] as Array<[CompareOperator, ValueExpression[], boolean]>)('evaluates %s', (operator, operands, expected) => {
    expect(evaluateCondition({ kind: 'compare', operator, operands }, {}).value).toBe(expected)
  })

  it('distinguishes missing, null, and empty values', () => {
    expect(evaluateCondition(compare('exists', field('value')), { value: null }).value).toBe(true)
    expect(evaluateCondition(compare('exists', field('value')), {}).value).toBe(false)
    expect(evaluateCondition(compare('isEmpty', field('value')), { value: [] }).value).toBe(true)
    expect(evaluateCondition(compare('exists', { ...field('value'), cast: 'number' }), { value: 'not-a-number' }).value).toBe(true)
  })

  it('uses Kleene logic and short circuits decisive results', () => {
    const missing = compare('eq', field('missing'), literal(1))
    expect(evaluateCondition({ kind: 'group', operator: 'and', children: [compare('eq', literal(1), literal(2)), missing] }, {}).value).toBe(false)
    expect(evaluateCondition({ kind: 'group', operator: 'or', children: [missing, compare('eq', literal(1), literal(1))] }, {}).value).toBe(true)
    expect(evaluateCondition({ kind: 'not', child: missing }, {}).value).toBe('unknown')
  })

  it('evaluates nested quantifiers and standard empty collection semantics', () => {
    const anyPositive: ConditionNode = {
      kind: 'quantifier',
      operator: 'any',
      collection: field('items'),
      as: 'item',
      condition: { kind: 'compare', operator: 'gt', operands: [{ kind: 'variable', name: 'item', path: 'qty' }, literal(0)] },
    }
    expect(evaluateCondition(anyPositive, { items: [{ qty: 0 }, { qty: 2 }] }).value).toBe(true)
    expect(evaluateCondition(anyPositive, { items: [] }).value).toBe(false)
    expect(evaluateCondition({ ...anyPositive, operator: 'all' }, { items: [] }).value).toBe(true)
    expect(evaluateCondition({ ...anyPositive, operator: 'none' }, { items: [] }).value).toBe(true)
  })

  it('blocks prototype paths and reports failures without exposing values', () => {
    const result = evaluateCondition(compare('eq', field('__proto__.polluted'), literal('secret')), {})
    expect(result.value).toBe('unknown')
    expect(result.diagnostics[0]).toMatchObject({ code: 'CONDITION_FIELD_MISSING', fieldPath: '__proto__.polluted' })
    expect(JSON.stringify(result.diagnostics)).not.toContain('secret')
  })

  it('applies hidden priority and unknown policy to final node state', () => {
    const node = {
      id: 'n',
      type: 'text',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      props: {},
      renderCondition: { rule: compare('eq', field('missing'), literal(1)), onUnknown: 'exclude' as const, whenFalse: 'reserve' as const },
    } satisfies MaterialNode
    expect(resolveConditionalNode(node, {}).state).toBe('reserve')
    expect(resolveConditionalNode({ ...node, hidden: true }, {}).diagnostics).toEqual([])
  })

  it('validates datetime timezone rules through explicit casts', () => {
    const rule: ConditionNode = { kind: 'compare', operator: 'eq', operands: [field('left', 'datetime'), field('right', 'datetime')] }
    expect(evaluateCondition(rule, { left: '2025-01-01', right: '2025-01-01T00:00:00Z' }).value).toBe(true)
    expect(evaluateCondition(rule, { left: '2025-01-01T00:00:00', right: '2025-01-01T00:00:00Z' }).value).toBe('unknown')
    expect(evaluateCondition(rule, { left: '2025-02-30', right: '2025-03-02' }).value).toBe('unknown')
  })

  it('supports count and stops quantifiers at the fixed step budget', () => {
    expect(evaluateCondition(compare('eq', { kind: 'count', value: field('items') }, literal(2)), { items: [1, 2] }).value).toBe(true)
    const rule: ConditionNode = {
      kind: 'quantifier',
      operator: 'all',
      collection: field('items'),
      as: 'item',
      condition: compare('gt', { kind: 'variable', name: 'item' }, literal(0)),
    }
    const result = evaluateCondition(rule, { items: Array.from({ length: 10_001 }).fill(1) })
    expect(result.value).toBe('unknown')
    expect(result.diagnostics.filter(item => item.code === 'CONDITION_LIMIT_EXCEEDED')).toHaveLength(1)
  })
})
