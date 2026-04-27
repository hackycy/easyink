import { cloneDeep } from 'lodash-es'
import { BLOCKED_PATH_KEYS, FIELD_PATH_SEPARATOR } from './constants'

let _idCounter = 0

/**
 * Generate a unique ID string.
 */
export function generateId(prefix = 'ei'): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`
}

/**
 * Deep clone an object. Does NOT use structuredClone per project rules.
 */
export function deepClone<T>(obj: T): T {
  return cloneDeep(obj) as T
}

/**
 * Safely resolve a value by dot/slash-separated path from an object.
 * Blocks prototype chain access (__proto__, constructor, prototype).
 */
export function resolveFieldPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== 'object' || obj === null) {
    return undefined
  }

  const segments = path.includes(FIELD_PATH_SEPARATOR)
    ? path.split(FIELD_PATH_SEPARATOR)
    : path.split('.')

  let current: unknown = obj
  for (const segment of segments) {
    if (!segment)
      continue
    if (BLOCKED_PATH_KEYS.has(segment)) {
      return undefined
    }
    if (typeof current !== 'object' || current === null) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Normalize a field path to use canonical separator (/).
 */
export function normalizeFieldPath(path: string): string {
  return path.replace(/\./g, FIELD_PATH_SEPARATOR)
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Round to specified decimal places.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Check if a value is a non-null object.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Shallow merge with undefined/null skip.
 */
export function assignDefined<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  for (const key of Object.keys(source) as Array<keyof T>) {
    if (source[key] !== undefined) {
      target[key] = source[key] as T[keyof T]
    }
  }
  return target
}
