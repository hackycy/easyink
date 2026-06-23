import type { CompareOperator, ConditionFieldRef, ConditionGroup, ConditionRow, ConditionValue, ConditionValueType, RenderCondition } from '@easyink/schema'
import { deepClone } from '@easyink/shared'

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

export const CONDITION_VALUE_TYPES: ConditionValueType[] = ['string', 'trimmed-string', 'number', 'boolean', 'datetime']
export const UNARY_OPERATORS: CompareOperator[] = ['exists', 'notExists', 'isEmpty', 'isNotEmpty']

export function createConditionRow(source: ConditionFieldRef = { path: '' }): ConditionRow {
  return {
    source,
    operator: 'eq',
    valueType: 'string',
    value: { kind: 'literal', value: '' },
  }
}

export function createConditionGroup(): ConditionGroup {
  return { conditions: [createConditionRow()] }
}

export function createRenderCondition(): RenderCondition {
  return {
    enabled: true,
    whenMatched: 'show',
    whenHidden: 'remove',
    onUnknown: 'show',
    groups: [],
  }
}

export function createDialogDraft(condition?: RenderCondition): RenderCondition {
  const draft = deepClone(condition ?? createRenderCondition())
  if (draft.groups.length === 0)
    draft.groups.push(createConditionGroup())
  return draft
}

export function updateRowOperator(row: ConditionRow, operator: CompareOperator): ConditionRow {
  const next: ConditionRow = { ...row, operator }
  if (UNARY_OPERATORS.includes(operator)) {
    delete next.value
    delete next.valueType
    delete next.options
    return next
  }
  next.valueType ??= 'string'
  const current = Array.isArray(row.value) ? row.value : row.value ? [row.value] : []
  if (operator === 'between' || operator === 'notBetween')
    next.value = [current[0] ?? literal(''), current[1] ?? literal('')]
  else if (operator === 'in' || operator === 'notIn')
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
  return condition.groups.every(group => group.conditions.every(row => isBlankRow(row) || isConditionRowComplete(row, !!group.scope)))
}

export function isConditionRowComplete(row: ConditionRow, collectionScoped: boolean): boolean {
  if (!isFieldComplete(row.source, collectionScoped))
    return false
  if (UNARY_OPERATORS.includes(row.operator))
    return true
  if (!row.valueType || row.value == null)
    return false
  const values = Array.isArray(row.value) ? row.value : [row.value]
  if ((row.operator === 'between' || row.operator === 'notBetween') && values.length !== 2)
    return false
  if ((row.operator === 'in' || row.operator === 'notIn') && values.length === 0)
    return false
  return values.every(value => isConditionValueComplete(value, collectionScoped))
}

export function isBlankRow(row: ConditionRow): boolean {
  return row.source.path === ''
    && (row.source.scope ?? 'root') === 'root'
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
  if (UNARY_OPERATORS.includes(row.operator))
    return row
  const convert = (value: ConditionValue): ConditionValue => value.kind === 'field' ? value : defaultLiteralForType(type)
  const value = Array.isArray(row.value)
    ? row.value.map(convert)
    : row.value ? convert(row.value) : defaultLiteralForType(type)
  return { ...row, valueType: type, value }
}

function isConditionValueComplete(value: ConditionValue, collectionScoped: boolean): boolean {
  return value.kind === 'literal' || isFieldComplete(value.field, collectionScoped)
}

function isFieldComplete(field: ConditionFieldRef, collectionScoped: boolean): boolean {
  const scope = field.scope ?? 'root'
  if (scope === 'item')
    return collectionScoped && (field.path !== '' || !!field.fieldLabel)
  return field.path.trim().length > 0
}
