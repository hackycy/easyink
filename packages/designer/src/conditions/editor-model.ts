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
  return isConditionNodeComplete(condition.rule)
}

function isConditionNodeComplete(node: ConditionNode): boolean {
  if (node.kind === 'group')
    return node.children.length > 0 && node.children.every(isConditionNodeComplete)
  if (node.kind === 'not')
    return isConditionNodeComplete(node.child)
  return normalizeCompareOperands(node.operator, node.operands).length === node.operands.length && node.operands.every(isValueComplete)
}

function isValueComplete(value: ValueExpression): boolean {
  if (value.kind === 'literal')
    return typeof value.value !== 'string' || value.value.length > 0
  return value.path.trim().length > 0
}
