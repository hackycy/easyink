import type { CompareOperator, ConditionNode, RenderCondition, ValueExpression } from '@easyink/schema'

export const COMPARE_OPERATORS: CompareOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'notBetween',
  'in',
  'notIn',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'exists',
  'notExists',
  'isEmpty',
  'isNotEmpty',
]

export function createValueExpression(): ValueExpression {
  return { kind: 'field', path: '' }
}

export function createConditionNode(kind: ConditionNode['kind'] = 'compare'): ConditionNode {
  if (kind === 'group')
    return { kind: 'group', operator: 'and', children: [createConditionNode()] }
  if (kind === 'not')
    return { kind: 'not', child: createConditionNode() }
  if (kind === 'quantifier')
    return { kind: 'quantifier', operator: 'any', collection: createValueExpression(), as: 'item', condition: createConditionNode() }
  return { kind: 'compare', operator: 'eq', operands: [createValueExpression(), { kind: 'literal', value: '' }] }
}

export function createRenderCondition(fieldPath = ''): RenderCondition {
  return {
    enabled: true,
    rule: {
      kind: 'compare',
      operator: 'eq',
      operands: [{ kind: 'field', path: fieldPath }, { kind: 'literal', value: '' }],
    },
    whenFalse: 'remove',
    onUnknown: 'include',
  }
}

export function normalizeCompareOperands(operator: CompareOperator, current: ValueExpression[]): ValueExpression[] {
  const count = operator === 'between' || operator === 'notBetween'
    ? 3
    : operator === 'exists' || operator === 'notExists' || operator === 'isEmpty' || operator === 'isNotEmpty'
      ? 1
      : 2
  if (operator === 'in' || operator === 'notIn')
    return current.length >= 2 ? current : [...current, ...Array.from({ length: 2 - current.length }, () => ({ kind: 'literal', value: '' } as ValueExpression))]
  return Array.from({ length: count }, (_, index) => current[index] ?? ({ kind: 'literal', value: '' } as ValueExpression))
}

export function isRenderConditionComplete(condition: RenderCondition): boolean {
  return isConditionNodeComplete(condition.rule, new Set())
}

function isConditionNodeComplete(node: ConditionNode, variables: ReadonlySet<string>): boolean {
  if (node.kind === 'group')
    return node.children.length > 0 && node.children.every(child => isConditionNodeComplete(child, variables))
  if (node.kind === 'not')
    return isConditionNodeComplete(node.child, variables)
  if (node.kind === 'compare')
    return normalizeCompareOperands(node.operator, node.operands).length === node.operands.length && node.operands.every(value => isValueComplete(value, variables))
  if (!node.as.trim() || variables.has(node.as) || !isValueComplete(node.collection, variables))
    return false
  const nested = new Set(variables)
  nested.add(node.as)
  return isConditionNodeComplete(node.condition, nested)
}

function isValueComplete(value: ValueExpression, variables: ReadonlySet<string>): boolean {
  if (value.kind === 'literal')
    return typeof value.value !== 'string' || value.value.length > 0
  if (value.kind === 'count')
    return isPathComplete(value.value, variables)
  return isPathComplete(value, variables)
}

function isPathComplete(value: Exclude<ValueExpression, { kind: 'literal' } | { kind: 'count' }>, variables: ReadonlySet<string>): boolean {
  if (value.kind === 'field')
    return value.path.trim().length > 0
  return variables.has(value.name) && (value.path == null || typeof value.path === 'string')
}
