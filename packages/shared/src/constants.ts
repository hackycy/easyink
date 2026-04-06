/**
 * Unit conversion constants.
 * Relates mm, inch, and pt to each other.
 */
export const UNIT_CONVERSIONS = {
  mm: { toInch: 1 / 25.4, toPt: 72 / 25.4 },
  inch: { toMm: 25.4, toPt: 72 },
  pt: { toMm: 25.4 / 72, toInch: 1 / 72 },
} as const

/**
 * Factor to convert CSS reference pixels (96 dpi) to various units.
 * cssPixelsPerUnit = 96 / UNIT_FACTOR[unit]
 */
export const UNIT_FACTOR: Record<string, number> = {
  mm: 25.4,
  pt: 72,
  px: 96,
  inch: 1,
}

/**
 * Default page dimensions (A4 in mm).
 */
export const DEFAULT_PAGE_WIDTH_MM = 210
export const DEFAULT_PAGE_HEIGHT_MM = 297

/**
 * Current schema version.
 */
export const SCHEMA_VERSION = '1.0.0'

/**
 * Canonical path separator used in data binding field paths.
 */
export const FIELD_PATH_SEPARATOR = '/'

/**
 * Prototype chain keys that must be blocked in path resolution.
 */
export const BLOCKED_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Common paper size presets (dimensions in mm).
 */
export interface PaperPreset {
  name: string
  width: number
  height: number
}

export const PAPER_PRESETS: PaperPreset[] = [
  { name: 'A3', width: 297, height: 420 },
  { name: 'A4', width: 210, height: 297 },
  { name: 'A5', width: 148, height: 210 },
  { name: 'A6', width: 105, height: 148 },
  { name: 'B4', width: 250, height: 353 },
  { name: 'B5', width: 176, height: 250 },
  { name: 'Letter', width: 216, height: 279 },
  { name: 'Legal', width: 216, height: 356 },
]
