import { describe, expect, it } from 'vitest'
import { builtinLocales, enUS, zhCN } from './index'

describe('designer locales', () => {
  it('exports built-in locale aliases', () => {
    expect(builtinLocales['zh-CN']).toBe(zhCN)
    expect(builtinLocales['en-US']).toBe(enUS)
  })

  it('keeps zh-CN and en-US message shapes aligned', () => {
    expect(collectLeafKeys(zhCN)).toEqual(collectLeafKeys(enUS))
  })
})

function collectLeafKeys(value: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string')
      keys.push(next)
    else if (child && typeof child === 'object')
      keys.push(...collectLeafKeys(child as Record<string, unknown>, next))
  }
  return keys.sort()
}
