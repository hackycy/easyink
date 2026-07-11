import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatBindingDisplayValue } from './binding-format'

describe('formatBindingDisplayValue', () => {
  it('applies fallback, preset format, prefix and suffix in order', () => {
    const result = formatBindingDisplayValue(null, {
      sourceId: 's1',
      fieldPath: 'amount',
      format: {
        prefix: '合计: ',
        suffix: ' 元',
        fallback: '123.45',
        mode: 'preset',
        preset: { type: 'number', minimumFractionDigits: 2, maximumFractionDigits: 2 },
      },
    })

    expect(result.value).toBe('合计: 123.45 元')
    expect(result.diagnostics).toEqual([])
  })

  it('formats datetime with a token pattern and timezone', () => {
    const result = formatBindingDisplayValue('2026-05-03T02:04:05.000Z', {
      sourceId: 's1',
      fieldPath: 'createdAt',
      format: {
        mode: 'preset',
        preset: { type: 'datetime', pattern: 'yyyy/MM/dd HH:mm:ss', timeZone: 'UTC' },
      },
    })

    expect(result.value).toBe('2026/05/03 02:04:05')
  })

  it('formats canonical local datetime strings without relying on host parsing', () => {
    const result = formatBindingDisplayValue('2026-05-03 02:04:05', {
      sourceId: 's1',
      fieldPath: 'createdAt',
      format: {
        mode: 'preset',
        preset: { type: 'datetime', pattern: 'yyyy/MM/dd HH:mm:ss' },
      },
    })

    expect(result.value).toBe('2026/05/03 02:04:05')
    expect(result.diagnostics).toEqual([])
  })

  it('rejects locale-dependent date strings', () => {
    const result = formatBindingDisplayValue('05/03/2026', {
      sourceId: 's1',
      fieldPath: 'createdAt',
      format: {
        mode: 'preset',
        preset: { type: 'datetime', pattern: 'yyyy/MM/dd HH:mm:ss' },
      },
    })

    expect(result.value).toBe('05/03/2026')
    expect(result.diagnostics[0]?.code).toBe('BINDING_FORMAT_PRESET_FAILED')
  })

  it('formats chinese uppercase money', () => {
    const result = formatBindingDisplayValue('1,234.50', {
      sourceId: 's1',
      fieldPath: 'amount',
      format: { mode: 'preset', preset: { type: 'chinese-money' } },
    })

    expect(result.value).toBe('壹仟贰佰叁拾肆元伍角')
  })

  it('does not execute legacy custom formatter source', () => {
    ;(globalThis as Record<string, unknown>).__bindingFormatExecuted = false
    const result = formatBindingDisplayValue('abc', {
      sourceId: 's1',
      fieldPath: 'code',
      format: {
        mode: 'custom',
        custom: { source: '(() => { globalThis.__bindingFormatExecuted = true; throw new Error("executed") })()' },
      },
    })

    expect(result.value).toBe('abc')
    expect(result.diagnostics).toEqual([expect.objectContaining({
      code: 'BINDING_FORMAT_CUSTOM_DISABLED',
      severity: 'warning',
    })])
    expect((globalThis as Record<string, unknown>).__bindingFormatExecuted).toBe(false)
    delete (globalThis as Record<string, unknown>).__bindingFormatExecuted
  })

  it('uses fallback without custom prefix or suffix when custom formatting is disabled', () => {
    const result = formatBindingDisplayValue(null, {
      sourceId: 's1',
      fieldPath: 'name',
      format: {
        mode: 'custom',
        fallback: 'unknown',
        prefix: '[',
        suffix: ']',
        custom: { source: '(value) => value' },
      },
    })

    expect(result.value).toBe('unknown')
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.code).toBe('BINDING_FORMAT_CUSTOM_DISABLED')
  })

  it('falls back to original display value and warns when formatting fails', () => {
    const result = formatBindingDisplayValue('abc', {
      sourceId: 's1',
      fieldPath: 'amount',
      format: { mode: 'preset', preset: { type: 'number' } },
    })

    expect(result.value).toBe('abc')
    expect(result.diagnostics[0]?.code).toBe('BINDING_FORMAT_PRESET_FAILED')
  })

  it('contains no dynamic custom formatter compiler', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/core/src/binding-format.ts'), 'utf8')

    expect(source).not.toContain('new Function')
    expect(source).not.toContain('compileTrustedFormatter')
  })
})
