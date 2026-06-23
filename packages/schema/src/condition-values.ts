import type { ConditionValueType } from './types'

export const CONDITION_VALUE_TYPES: ConditionValueType[] = [
  'string',
  'trimmed-string',
  'case-insensitive-string',
  'number',
  'boolean',
  'datetime',
]

export type ConditionValueCastResult = { success: true, value: unknown } | { success: false }

export function isConditionValueType(value: unknown): value is ConditionValueType {
  return typeof value === 'string' && (CONDITION_VALUE_TYPES as string[]).includes(value)
}

export function castConditionLiteralValue(value: unknown, type: ConditionValueType): ConditionValueCastResult {
  if (value === null)
    return { success: true, value: null }
  if (type === 'string' || type === 'trimmed-string' || type === 'case-insensitive-string') {
    if (!isScalar(value))
      return { success: false }
    const result = String(value)
    if (type === 'trimmed-string')
      return { success: true, value: result.trim() }
    if (type === 'case-insensitive-string')
      return { success: true, value: result.toLowerCase() }
    return { success: true, value: result }
  }
  if (type === 'number') {
    if (typeof value === 'number')
      return Number.isFinite(value) ? { success: true, value } : { success: false }
    if (typeof value !== 'string' || value.trim() === '' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))
      return { success: false }
    const number = Number(value)
    return Number.isFinite(number) ? { success: true, value: number } : { success: false }
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean')
      return { success: true, value }
    if (value === 1 || value === 0)
      return { success: true, value: value === 1 }
    if (typeof value === 'string' && /^(?:true|false)$/i.test(value))
      return { success: true, value: value.toLowerCase() === 'true' }
    return { success: false }
  }
  if (typeof value === 'number')
    return Number.isFinite(value) ? { success: true, value } : { success: false }
  if (typeof value !== 'string')
    return { success: false }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const zonedDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  if (!dateOnly && !zonedDateTime)
    return { success: false }
  const timestamp = Date.parse(dateOnly ? `${value}T00:00:00Z` : value)
  if (!Number.isFinite(timestamp))
    return { success: false }
  if (dateOnly && new Date(timestamp).toISOString().slice(0, 10) !== value)
    return { success: false }
  return { success: true, value: timestamp }
}

export function isConditionLiteralValueValid(value: unknown, type: ConditionValueType): boolean {
  return castConditionLiteralValue(value, type).success
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}
