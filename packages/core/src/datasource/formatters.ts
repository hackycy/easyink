import type { FormatterFunction } from './types'

/**
 * Currency formatter.
 * Options: locale (string), currency (string), decimals (number)
 */
const currencyFormatter: FormatterFunction = (value, options) => {
  if (value == null)
    return ''
  const num = Number(value)
  if (Number.isNaN(num))
    return String(value ?? '')

  const locale = (options?.locale as string) || 'zh-CN'
  const currency = (options?.currency as string) || 'CNY'
  const decimals = options?.decimals as number | undefined

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...(decimals != null ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : {}),
    }).format(num)
  }
  catch {
    return String(num)
  }
}

/**
 * Date formatter.
 * Options: format (string) — supports YYYY, MM, DD, HH, mm, ss tokens
 */
const dateFormatter: FormatterFunction = (value, options) => {
  if (value == null)
    return ''

  const date = value instanceof Date ? value : new Date(value as string | number)
  if (Number.isNaN(date.getTime()))
    return String(value)

  const fmt = (options?.format as string) || 'YYYY-MM-DD'

  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    DD: String(date.getDate()).padStart(2, '0'),
    HH: String(date.getHours()).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0'),
  }

  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, match => tokens[match] || match)
}

/**
 * Number formatter.
 * Options: decimals (number), thousandsSeparator (boolean)
 */
const numberFormatter: FormatterFunction = (value, options) => {
  if (value == null)
    return ''
  const num = Number(value)
  if (Number.isNaN(num))
    return String(value ?? '')

  const decimals = options?.decimals as number | undefined
  const thousandsSeparator = options?.thousandsSeparator as boolean | undefined

  let result: string
  if (decimals != null) {
    result = num.toFixed(decimals)
  }
  else {
    result = String(num)
  }

  if (thousandsSeparator) {
    const parts = result.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    result = parts.join('.')
  }

  return result
}

/**
 * Uppercase formatter.
 */
const uppercaseFormatter: FormatterFunction = (value) => {
  return value == null ? '' : String(value).toUpperCase()
}

/**
 * Lowercase formatter.
 */
const lowercaseFormatter: FormatterFunction = (value) => {
  return value == null ? '' : String(value).toLowerCase()
}

/**
 * Pad formatter.
 * Options: length (number), char (string), direction ('left' | 'right')
 */
const padFormatter: FormatterFunction = (value, options) => {
  const str = value == null ? '' : String(value)
  const length = (options?.length as number) || 0
  const char = (options?.char as string) || ' '
  const direction = (options?.direction as 'left' | 'right') || 'left'

  if (direction === 'right') {
    return str.padEnd(length, char)
  }
  return str.padStart(length, char)
}

/**
 * All built-in formatters mapped by type name.
 */
export const builtinFormatters: Record<string, FormatterFunction> = {
  currency: currencyFormatter,
  date: dateFormatter,
  lowercase: lowercaseFormatter,
  number: numberFormatter,
  pad: padFormatter,
  uppercase: uppercaseFormatter,
}

/**
 * Register all built-in formatters on a DataResolver instance.
 */
export function registerBuiltinFormatters(resolver: { registerFormatter: (name: string, fn: FormatterFunction) => void }): void {
  for (const [name, fn] of Object.entries(builtinFormatters)) {
    resolver.registerFormatter(name, fn)
  }
}
