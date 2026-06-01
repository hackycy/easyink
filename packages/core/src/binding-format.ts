import type { BindingRef } from '@easyink/schema'
import type { BindingDisplayFormat, BindingFormatPresetType, BindingPresetFormat } from '@easyink/shared'
import { parseDateInput } from '@easyink/shared'

export interface BindingFormatContext {
  binding: BindingRef
  data: Record<string, unknown>
  locale?: string
}

export interface BindingFormatDiagnostic {
  code: string
  message: string
  severity: 'warning'
  cause?: unknown
}

export interface BindingFormatResult {
  value: string
  diagnostics: BindingFormatDiagnostic[]
}

type TrustedFormatter = (value: unknown, data: Record<string, unknown>) => unknown

const DEFAULT_LOCALE = 'zh-CN'
const DEFAULT_DATE_PATTERN = 'yyyy-MM-dd HH:mm:ss'
const formatterCache = new Map<string, TrustedFormatter>()
const CHINESE_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const SMALL_UNITS = ['', '拾', '佰', '仟']
const BIG_UNITS = ['', '万', '亿', '兆']

export function formatBindingDisplayValue(
  value: unknown,
  binding: BindingRef,
  context: Partial<BindingFormatContext> = {},
): BindingFormatResult {
  const diagnostics: BindingFormatDiagnostic[] = []
  const format = binding.format
  const fallback = format?.fallback ?? ''
  const runtimeData = context.data ?? {}

  const valueForFormat = isEmptyValue(value) ? fallback : value
  let display = valueToString(valueForFormat)

  if (format?.mode === 'preset' && format.preset) {
    const result = applyPresetFormat(valueForFormat, format.preset)
    if (result.ok) {
      display = result.value
    }
    else {
      diagnostics.push({
        code: 'BINDING_FORMAT_PRESET_FAILED',
        severity: 'warning',
        message: result.message,
      })
      display = valueToString(valueForFormat)
    }
  }
  else if (format?.mode === 'custom' && format.custom?.source?.trim()) {
    try {
      const formatter = compileTrustedFormatter(format.custom.source)
      const result = formatter(valueForFormat, runtimeData)
      display = isEmptyValue(result) ? fallback : String(result)
    }
    catch (err) {
      diagnostics.push({
        code: 'BINDING_FORMAT_CUSTOM_FAILED',
        severity: 'warning',
        message: err instanceof Error ? err.message : String(err),
        cause: toDiagnosticCause(err),
      })
      display = valueToString(valueForFormat)
    }
  }

  const isCustom = format?.mode === 'custom'
  const prefix = isCustom ? '' : (format?.prefix ?? '')
  const suffix = isCustom ? '' : (format?.suffix ?? '')
  return { value: `${prefix}${display}${suffix}`, diagnostics }
}

export function hasBindingFormat(format: BindingDisplayFormat | undefined): boolean {
  if (!format)
    return false
  return !!(
    format.prefix
    || format.suffix
    || format.fallback
    || (format.mode === 'preset' && format.preset)
    || (format.mode === 'custom' && format.custom?.source?.trim())
  )
}

function applyPresetFormat(
  value: unknown,
  preset: BindingPresetFormat,
): { ok: true, value: string } | { ok: false, message: string } {
  switch (preset.type) {
    case 'datetime':
      return formatDateTime(value, preset)
    case 'weekday':
      return formatWeekday(value, preset)
    case 'chinese-money':
      return formatChineseMoney(value)
    case 'number':
    case 'currency':
    case 'percent':
      return formatNumberPreset(value, preset.type, preset)
    default:
      return { ok: false, message: `Unsupported binding format preset: ${String(preset.type)}` }
  }
}

function formatDateTime(value: unknown, preset: BindingPresetFormat) {
  const date = toDate(value)
  if (!date)
    return { ok: false as const, message: `Invalid date value: ${valueToString(value)}` }
  return {
    ok: true as const,
    value: formatDatePattern(date, preset.pattern || DEFAULT_DATE_PATTERN, preset.timeZone),
  }
}

function formatWeekday(value: unknown, preset: BindingPresetFormat) {
  const date = toDate(value)
  if (!date)
    return { ok: false as const, message: `Invalid date value: ${valueToString(value)}` }
  return {
    ok: true as const,
    value: new Intl.DateTimeFormat(preset.locale || DEFAULT_LOCALE, {
      weekday: preset.weekdayStyle || 'long',
      ...(preset.timeZone ? { timeZone: preset.timeZone } : {}),
    }).format(date),
  }
}

function formatNumberPreset(value: unknown, type: BindingFormatPresetType, preset: BindingPresetFormat) {
  const parsed = toNumber(value)
  if (parsed === undefined)
    return { ok: false as const, message: `Invalid number value: ${valueToString(value)}` }

  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: preset.minimumFractionDigits,
    maximumFractionDigits: preset.maximumFractionDigits,
  }
  if (type === 'currency') {
    options.style = 'currency'
    options.currency = preset.currency || 'CNY'
  }
  else if (type === 'percent') {
    options.style = 'percent'
  }
  return {
    ok: true as const,
    value: new Intl.NumberFormat(preset.locale || DEFAULT_LOCALE, options).format(parsed),
  }
}

function formatChineseMoney(value: unknown) {
  const parsed = toNumber(value)
  if (parsed === undefined)
    return { ok: false as const, message: `Invalid money value: ${valueToString(value)}` }
  return { ok: true as const, value: toChineseMoney(parsed) }
}

function compileTrustedFormatter(source: string): TrustedFormatter {
  const cached = formatterCache.get(source)
  if (cached)
    return cached

  // eslint-disable-next-line no-new-func -- Trusted template formatter source; this is documented as non-sandboxed.
  const factory = new Function(
    'window',
    'document',
    'globalThis',
    'fetch',
    'XMLHttpRequest',
    'localStorage',
    'sessionStorage',
    `return (function(){ "use strict"; return (${source}); })();`,
  )
  const formatter = factory(undefined, undefined, undefined, undefined, undefined, undefined, undefined)
  if (typeof formatter !== 'function')
    throw new TypeError('Custom binding formatter must evaluate to a function')
  formatterCache.set(source, formatter as TrustedFormatter)
  return formatter as TrustedFormatter
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

function valueToString(value: unknown): string {
  return isEmptyValue(value) ? '' : String(value)
}

function toDate(value: unknown): Date | undefined {
  return parseDateInput(value)
}

function formatDatePattern(date: Date, pattern: string, timeZone?: string): string {
  const parts = getDateParts(date, timeZone)
  return pattern
    .replace(/yyyy/g, parts.year)
    .replace(/MM/g, parts.month)
    .replace(/dd/g, parts.day)
    .replace(/HH/g, parts.hour)
    .replace(/mm/g, parts.minute)
    .replace(/ss/g, parts.second)
}

function getDateParts(date: Date, timeZone?: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  })
  const result: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal')
      result[part.type] = part.value
  }
  return {
    year: result.year || '0000',
    month: result.month || '01',
    day: result.day || '01',
    hour: result.hour === '24' ? '00' : result.hour || '00',
    minute: result.minute || '00',
    second: result.second || '00',
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return value
  if (typeof value !== 'string')
    return undefined

  const trimmed = value.trim()
  if (!trimmed)
    return undefined
  const isPercent = trimmed.endsWith('%')
  const normalized = trimmed
    .replace(/[%￥¥$,，\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed))
    return undefined
  return isPercent ? parsed / 100 : parsed
}

function toChineseMoney(value: number): string {
  if (!Number.isFinite(value))
    return ''

  const negative = value < 0
  const amount = Math.round(Math.abs(value) * 100)
  if (amount === 0)
    return '零元整'

  const integerPart = Math.floor(amount / 100)
  const jiao = Math.floor((amount % 100) / 10)
  const fen = amount % 10
  const integerText = `${integerToChinese(integerPart)}元`
  let decimalText = ''
  if (jiao > 0)
    decimalText += `${CHINESE_DIGITS[jiao]}角`
  if (fen > 0)
    decimalText += `${jiao === 0 && integerPart > 0 ? '零' : ''}${CHINESE_DIGITS[fen]}分`
  if (!decimalText)
    decimalText = '整'
  return `${negative ? '负' : ''}${integerText}${decimalText}`
}

function integerToChinese(value: number): string {
  if (value === 0)
    return '零'

  const groups: number[] = []
  let rest = value
  while (rest > 0) {
    groups.push(rest % 10000)
    rest = Math.floor(rest / 10000)
  }

  let result = ''
  let pendingZero = false
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]!
    if (group === 0) {
      pendingZero = result.length > 0
      continue
    }
    if (pendingZero || (result && group < 1000))
      result += '零'
    result += `${fourDigitGroupToChinese(group)}${BIG_UNITS[i] || ''}`
    pendingZero = false
  }
  return result.replace(/零+/g, '零').replace(/零$/g, '')
}

function fourDigitGroupToChinese(value: number): string {
  let result = ''
  let zeroPending = false
  const digits = [
    Math.floor(value / 1000),
    Math.floor((value % 1000) / 100),
    Math.floor((value % 100) / 10),
    value % 10,
  ]
  for (let i = 0; i < digits.length; i++) {
    const digit = digits[i]!
    const unitIndex = digits.length - i - 1
    if (digit === 0) {
      zeroPending = result.length > 0
      continue
    }
    if (zeroPending) {
      result += '零'
      zeroPending = false
    }
    result += `${CHINESE_DIGITS[digit]}${SMALL_UNITS[unitIndex]}`
  }
  return result
}

function toDiagnosticCause(err: unknown): unknown {
  return err instanceof Error
    ? { name: err.name, message: err.message, stack: err.stack }
    : err
}
