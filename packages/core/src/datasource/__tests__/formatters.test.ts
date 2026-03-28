import { describe, expect, it } from 'vitest'
import { builtinFormatters, registerBuiltinFormatters } from '../formatters'
import { DataResolver } from '../resolver'

describe('builtinFormatters', () => {
  describe('currency', () => {
    const fmt = builtinFormatters.currency

    it('should format number as CNY currency', () => {
      const result = fmt(1234.5)
      // Intl output varies by environment, just check it contains the number
      expect(result).toContain('1,234.5')
    })

    it('should format with custom decimals', () => {
      const result = fmt(1234, { decimals: 2, currency: 'CNY', locale: 'zh-CN' })
      expect(result).toContain('1,234.00')
    })

    it('should handle NaN gracefully', () => {
      expect(fmt('abc')).toBe('abc')
    })

    it('should handle null value', () => {
      expect(fmt(null)).toBe('')
    })
  })

  describe('date', () => {
    const fmt = builtinFormatters.date

    it('should format date with default format YYYY-MM-DD', () => {
      const result = fmt(new Date(2024, 0, 15))
      expect(result).toBe('2024-01-15')
    })

    it('should format date with custom format', () => {
      const result = fmt(new Date(2024, 5, 1, 14, 30, 45), { format: 'YYYY/MM/DD HH:mm:ss' })
      expect(result).toBe('2024/06/01 14:30:45')
    })

    it('should format date from ISO string', () => {
      const result = fmt('2024-03-15T00:00:00.000Z', { format: 'YYYY-MM-DD' })
      expect(result).toBe('2024-03-15')
    })

    it('should return original value for invalid date', () => {
      expect(fmt('not-a-date')).toBe('not-a-date')
    })

    it('should return empty string for null', () => {
      expect(fmt(null)).toBe('')
    })
  })

  describe('number', () => {
    const fmt = builtinFormatters.number

    it('should format number with decimals', () => {
      expect(fmt(1234.5, { decimals: 2 })).toBe('1234.50')
    })

    it('should format number with thousands separator', () => {
      expect(fmt(1234567, { thousandsSeparator: true })).toBe('1,234,567')
    })

    it('should format with both options', () => {
      expect(fmt(1234567.8, { decimals: 2, thousandsSeparator: true })).toBe('1,234,567.80')
    })

    it('should handle without options', () => {
      expect(fmt(42)).toBe('42')
    })

    it('should handle NaN', () => {
      expect(fmt('abc')).toBe('abc')
    })
  })

  describe('uppercase', () => {
    const fmt = builtinFormatters.uppercase

    it('should convert to uppercase', () => {
      expect(fmt('hello world')).toBe('HELLO WORLD')
    })

    it('should handle null', () => {
      expect(fmt(null)).toBe('')
    })
  })

  describe('lowercase', () => {
    const fmt = builtinFormatters.lowercase

    it('should convert to lowercase', () => {
      expect(fmt('Hello WORLD')).toBe('hello world')
    })

    it('should handle null', () => {
      expect(fmt(null)).toBe('')
    })
  })

  describe('pad', () => {
    const fmt = builtinFormatters.pad

    it('should pad left by default', () => {
      expect(fmt('42', { length: 6, char: '0' })).toBe('000042')
    })

    it('should pad right', () => {
      expect(fmt('hello', { length: 10, char: '.', direction: 'right' })).toBe('hello.....')
    })

    it('should use space as default pad char', () => {
      expect(fmt('hi', { length: 5 })).toBe('   hi')
    })

    it('should handle value shorter than length', () => {
      expect(fmt('toolong', { length: 3, char: '0' })).toBe('toolong')
    })

    it('should handle null', () => {
      expect(fmt(null, { length: 3, char: '0' })).toBe('000')
    })
  })
})

describe('registerBuiltinFormatters', () => {
  it('should register all built-in formatters on a DataResolver', () => {
    const resolver = new DataResolver()
    registerBuiltinFormatters(resolver)

    expect(resolver.hasFormatter('currency')).toBe(true)
    expect(resolver.hasFormatter('date')).toBe(true)
    expect(resolver.hasFormatter('number')).toBe(true)
    expect(resolver.hasFormatter('uppercase')).toBe(true)
    expect(resolver.hasFormatter('lowercase')).toBe(true)
    expect(resolver.hasFormatter('pad')).toBe(true)
  })

  it('should allow formatting via resolver after registration', () => {
    const resolver = new DataResolver()
    registerBuiltinFormatters(resolver)

    expect(resolver.format('hello', { type: 'uppercase' })).toBe('HELLO')
    expect(resolver.format(42, { type: 'number', options: { decimals: 2 } })).toBe('42.00')
  })
})
