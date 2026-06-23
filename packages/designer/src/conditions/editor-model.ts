import type { ConditionCompareOperator, ConditionFieldRef, ConditionGroup, ConditionOperator, ConditionQuantifier, ConditionRow, ConditionValue, ConditionValueType, RenderCondition } from '@easyink/schema'
import { deepClone } from '@easyink/shared'

export const COMPARE_OPERATORS: ConditionCompareOperator[] = [
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

export const CONDITION_VALUE_TYPES: ConditionValueType[] = ['string', 'trimmed-string', 'case-insensitive-string', 'number', 'boolean', 'datetime']
export const UNARY_OPERATORS: ConditionCompareOperator[] = ['exists', 'notExists', 'isEmpty', 'isNotEmpty']
export const CONDITION_QUANTIFIERS: ConditionQuantifier[] = ['any', 'all', 'none']
export type ConditionOperatorKey = ConditionCompareOperator | `${ConditionQuantifier}:${ConditionCompareOperator}`

export function createConditionRow(source: ConditionFieldRef = { path: '' }): ConditionRow {
  return {
    source,
    operator: { compare: 'eq' },
    valueType: 'string',
    value: { kind: 'literal', value: '' },
  }
}

export function createConditionGroup(): ConditionGroup {
  return { conditions: [] }
}

export function createRenderCondition(): RenderCondition {
  return {
    whenMatched: 'show',
    whenHidden: 'remove',
    onUnknown: 'show',
    groups: [],
  }
}

export function createDialogDraft(condition?: RenderCondition): RenderCondition {
  return deepClone(condition ?? createRenderCondition())
}

export function updateRowOperator(row: ConditionRow, operator: ConditionOperator): ConditionRow {
  const next: ConditionRow = { ...row, operator }
  if (isUnaryOperator(operator)) {
    delete next.value
    delete next.valueType
    return next
  }
  next.valueType ??= 'string'
  const current = Array.isArray(row.value) ? row.value : row.value ? [row.value] : []
  if (isBetweenOperator(operator))
    next.value = [current[0] ?? literal(''), current[1] ?? literal('')]
  else if (isInOperator(operator))
    next.value = current.length > 0 ? current : [literal('')]
  else
    next.value = current[0] ?? literal('')
  return next
}

export function normalizeRenderCondition(condition: RenderCondition): RenderCondition {
  return {
    ...deepClone(condition),
    groups: condition.groups
      .map(group => ({ ...deepClone(group), conditions: group.conditions.filter(row => !isBlankRow(row)) }))
      .filter(group => group.conditions.length > 0),
  }
}

export function isRenderConditionComplete(condition: RenderCondition): boolean {
  return condition.groups.every(group => group.conditions.every(row => isBlankRow(row) || isConditionRowComplete(row)))
}

export function isConditionRowComplete(row: ConditionRow): boolean {
  if (!isFieldComplete(row.source))
    return false
  if (isUnaryOperator(row.operator))
    return true
  if (!row.valueType || row.value == null)
    return false
  const values = Array.isArray(row.value) ? row.value : [row.value]
  if (isBetweenOperator(row.operator) && values.length !== 2)
    return false
  if (isInOperator(row.operator) && values.length === 0)
    return false
  return values.every(value => isConditionValueComplete(value))
}

export function isBlankRow(row: ConditionRow): boolean {
  return row.source.path === ''
    && !row.source.fieldLabel
    && !row.source.sourceId
}

export function literal(value: string | number | boolean | null): ConditionValue {
  return { kind: 'literal', value }
}

export function defaultLiteralForType(type: ConditionValueType): ConditionValue {
  if (type === 'number')
    return literal(0)
  if (type === 'boolean')
    return literal(false)
  return literal('')
}

export function changeRowValueType(row: ConditionRow, type: ConditionValueType): ConditionRow {
  if (isUnaryOperator(row.operator))
    return row
  const value = Array.isArray(row.value)
    ? row.value.map(() => defaultLiteralForType(type))
    : defaultLiteralForType(type)
  return { ...row, valueType: type, value }
}

export function isUnaryOperator(operator: ConditionOperator): boolean {
  return UNARY_OPERATORS.includes(operator.compare)
}

export function isBetweenOperator(operator: ConditionOperator): boolean {
  return operator.compare === 'between' || operator.compare === 'notBetween'
}

export function isInOperator(operator: ConditionOperator): boolean {
  return operator.compare === 'in' || operator.compare === 'notIn'
}

export function conditionOperatorKey(operator: ConditionOperator): ConditionOperatorKey {
  return operator.quantifier ? `${operator.quantifier}:${operator.compare}` : operator.compare
}

export function conditionOperatorFromKey(key: string): ConditionOperator {
  const [first, second] = key.split(':') as [ConditionCompareOperator | ConditionQuantifier, ConditionCompareOperator | undefined]
  if (second)
    return { compare: second, quantifier: first as ConditionQuantifier }
  return { compare: first as ConditionCompareOperator }
}

function isConditionValueComplete(_value: ConditionValue): boolean {
  return true
}

function isFieldComplete(field: ConditionFieldRef): boolean {
  return field.path.trim().length > 0
}
