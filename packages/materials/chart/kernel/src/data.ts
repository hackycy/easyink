import type { ChartCategoryValuePoint } from './types'
import { isNumericString, isRecord } from './utils'

export const DEFAULT_CHART_PREVIEW_DATA: ChartCategoryValuePoint[] = [
  { label: 'A', value: 32 },
  { label: 'B', value: 56 },
  { label: 'C', value: 41 },
  { label: 'D', value: 72 },
  { label: 'E', value: 48 },
]

const PREFERRED_LABEL_KEYS = ['label', 'name', 'category', 'x', 'title']
const PREFERRED_VALUE_KEYS = ['value', 'y', 'amount', 'count', 'total', 'qty', 'quantity']

export function normalizeCategoryValueData(input: unknown, fallback: ChartCategoryValuePoint[] = DEFAULT_CHART_PREVIEW_DATA): ChartCategoryValuePoint[] {
  const result = readCategoryValueData(input)
  return result.length > 0 ? result : fallback
}

function readCategoryValueData(input: unknown): ChartCategoryValuePoint[] {
  if (Array.isArray(input))
    return readArrayData(input)

  if (isRecord(input)) {
    const categories = input.categories
    const values = input.values
    if (Array.isArray(categories) && Array.isArray(values)) {
      return categories
        .map((label, index) => toPoint(label, values[index]))
        .filter((point): point is ChartCategoryValuePoint => !!point)
    }

    return Object.entries(input)
      .map(([label, value]) => toPoint(label, value))
      .filter((point): point is ChartCategoryValuePoint => !!point)
  }

  return []
}

function readArrayData(input: unknown[]): ChartCategoryValuePoint[] {
  return input
    .map((item, index) => {
      if (typeof item === 'number')
        return toPoint(`Item ${index + 1}`, item)
      if (!isRecord(item))
        return null

      const labelKey = findKey(item, PREFERRED_LABEL_KEYS, value => typeof value === 'string' || typeof value === 'number')
      const valueKey = findKey(item, PREFERRED_VALUE_KEYS, value => typeof value === 'number' || isNumericString(value))
      const looseValueKey = valueKey ?? Object.keys(item).find(key => typeof item[key] === 'number' || isNumericString(item[key]))
      if (!looseValueKey)
        return null

      const label = labelKey ? item[labelKey] : `Item ${index + 1}`
      return toPoint(label, item[looseValueKey])
    })
    .filter((point): point is ChartCategoryValuePoint => !!point)
}

function findKey(record: Record<string, unknown>, keys: string[], predicate: (value: unknown) => boolean): string | undefined {
  for (const key of keys) {
    if (predicate(record[key]))
      return key
  }
  return undefined
}

function toPoint(label: unknown, value: unknown): ChartCategoryValuePoint | null {
  const numericValue = typeof value === 'number' ? value : isNumericString(value) ? Number(value) : Number.NaN
  if (!Number.isFinite(numericValue))
    return null
  return {
    label: label == null || label === '' ? 'Item' : String(label),
    value: numericValue,
  }
}
