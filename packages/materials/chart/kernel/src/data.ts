import type { ChartCategoryValuePoint, ChartScatterPoint } from './types'
import { isNumericString, isRecord } from './utils'

export const DEFAULT_CHART_PREVIEW_DATA: ChartCategoryValuePoint[] = [
  { label: 'A', value: 32 },
  { label: 'B', value: 56 },
  { label: 'C', value: 41 },
  { label: 'D', value: 72 },
  { label: 'E', value: 48 },
]

export const DEFAULT_SCATTER_PREVIEW_DATA: ChartScatterPoint[] = [
  { x: 12, y: 34, label: 'A' },
  { x: 24, y: 52, label: 'B' },
  { x: 36, y: 41, label: 'C' },
  { x: 48, y: 68, label: 'D' },
  { x: 60, y: 57, label: 'E' },
]

const PREFERRED_LABEL_KEYS = ['label', 'name', 'category', 'x', 'title']
const PREFERRED_VALUE_KEYS = ['value', 'y', 'amount', 'count', 'total', 'qty', 'quantity']
const PREFERRED_X_KEYS = ['x', 'xValue', 'xAxis', 'longitude', 'lon']
const PREFERRED_Y_KEYS = ['y', 'yValue', 'yAxis', 'latitude', 'lat', 'value']

export function normalizeCategoryValueData(input: unknown, fallback: ChartCategoryValuePoint[] = DEFAULT_CHART_PREVIEW_DATA): ChartCategoryValuePoint[] {
  const result = readCategoryValueData(input)
  return result.length > 0 ? result : fallback
}

export function normalizeScatterData(input: unknown, fallback: ChartScatterPoint[] = DEFAULT_SCATTER_PREVIEW_DATA): ChartScatterPoint[] {
  const result = readScatterData(input)
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

function readScatterData(input: unknown): ChartScatterPoint[] {
  if (!Array.isArray(input))
    return []

  return input
    .map((item, index) => {
      if (Array.isArray(item))
        return toScatterPoint(item[0], item[1], `Point ${index + 1}`)
      if (!isRecord(item))
        return null

      const xKey = findKey(item, PREFERRED_X_KEYS, value => typeof value === 'number' || isNumericString(value))
      const yKey = findKey(item, PREFERRED_Y_KEYS, value => typeof value === 'number' || isNumericString(value))
      if (!xKey || !yKey)
        return null

      const labelKey = findKey(item, PREFERRED_LABEL_KEYS, value => typeof value === 'string' || typeof value === 'number')
      const color = typeof item.color === 'string' ? item.color : undefined
      return toScatterPoint(item[xKey], item[yKey], labelKey ? item[labelKey] : `Point ${index + 1}`, color)
    })
    .filter((point): point is ChartScatterPoint => !!point)
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

function toScatterPoint(x: unknown, y: unknown, label?: unknown, color?: string): ChartScatterPoint | null {
  const numericX = typeof x === 'number' ? x : isNumericString(x) ? Number(x) : Number.NaN
  const numericY = typeof y === 'number' ? y : isNumericString(y) ? Number(y) : Number.NaN
  if (!Number.isFinite(numericX) || !Number.isFinite(numericY))
    return null
  return {
    x: numericX,
    y: numericY,
    ...(label == null || label === '' ? {} : { label: String(label) }),
    ...(color ? { color } : {}),
  }
}
