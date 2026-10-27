import type { LocaleDeclaration } from '@easyink/plugin-api/material'
import { describe, expect, it } from 'vitest'
import { createHost } from './index'
import { viewerMaterial } from './test-fixtures/material'

function material(type: string, locale: LocaleDeclaration) {
  return { ...viewerMaterial(type), locale }
}

describe('non-blocking per-host locale', () => {
  it('shares equal text, keeps first valid values and reports differing sources once', async () => {
    const host = await createHost({ kind: 'viewer', materials: [
      material('first', { messages: { ui: { same: 'Same', conflict: 'First', invalid: 42, empty: '' } } }),
      material('second', { messages: { ui: { same: 'Same', conflict: 'Second', invalid: 'Recovered', empty: 'Present' } } }),
    ] })
    expect(host.state).toBe('active')
    expect(host.t('ui.same')).toBe('Same')
    expect(host.t('ui.conflict')).toBe('First')
    expect(host.t('ui.invalid')).toBe('Recovered')
    expect(host.t('ui.empty')).toBe('Present')
    expect(host.localeDiagnostics).toHaveLength(3)
    expect(host.localeDiagnostics.find(item => item.code === 'locale-conflict')).toMatchObject({
      language: 'default',
      key: 'ui.conflict',
      source: { pluginId: 'material:second' },
      adoptedSource: { pluginId: 'material:first' },
    })
    expect(host.localeDiagnostics.find(item => item.key === 'ui.invalid')).toMatchObject({ source: { pluginId: 'material:first' }, adoptedSource: { pluginId: 'material:second' } })
    for (let index = 0; index < 10; index++) {
      host.t('ui.conflict')
      host.setLocale()
    }
    expect(host.localeDiagnostics).toHaveLength(3)
    expect(host.t('missing.key')).toBe('missing.key')
    expect(host.t('missing.key')).toBe('missing.key')
    expect(host.localeDiagnostics.filter(item => item.code === 'locale-missing')).toHaveLength(1)
    await host.destroy()
  })

  it('uses application nonempty strings first and restores source values when overrides are removed', async () => {
    const locale = Object.freeze({ messages: Object.freeze({ label: 'First' }) })
    const host = await createHost({ kind: 'viewer', materials: [material('first', locale), material('second', { messages: { label: 'Second' } })], locale: { messages: { label: 'Application' } } })
    expect(host.t('label')).toBe('Application')
    expect(host.localeDiagnostics).toEqual([])
    host.setLocale(undefined, { label: '' })
    expect(host.t('label')).toBe('First')
    expect(host.localeDiagnostics.filter(item => item.code === 'locale-conflict')).toHaveLength(1)
    host.setLocale(undefined, { label: 'Application' })
    expect(host.t('label')).toBe('Application')
    host.setLocale()
    expect(host.t('label')).toBe('First')
    expect(locale.messages.label).toBe('First')
    await host.destroy()
  })

  it('selects whole language trees instead of falling back per key to the same source messages', async () => {
    const host = await createHost({ kind: 'viewer', locale: { code: 'zh-CN' }, materials: [
      material('first', { messages: { label: 'First default', fallback: 'Must not be used' }, locales: { 'zh-CN': { label: 'First Chinese' }, 'empty': {} } }),
      material('second', { messages: { label: 'Second default', fallback: 'Next source' } }),
    ] })
    expect(host.t('label')).toBe('First Chinese')
    expect(host.t('fallback')).toBe('Next source')
    host.setLocale('en-US')
    expect(host.t('label')).toBe('First default')
    expect(host.t('fallback')).toBe('Must not be used')
    host.setLocale('empty')
    expect(host.t('label')).toBe('Second default')
    expect(host.t('fallback')).toBe('Next source')
    host.setLocale('zh-CN')
    expect(host.t('label')).toBe('First Chinese')
    expect(host.localeDiagnostics.filter(item => item.language === 'zh-CN' && item.code === 'locale-conflict')).toHaveLength(1)
    await host.destroy()
  })

  it('chooses declaration order rather than asynchronous initialization completion order', async () => {
    const first = material('first', { messages: { label: 'First' } })
    const second = material('second', { messages: { label: 'Second' } })
    const host = await createHost({ kind: 'viewer', materials: [first, second] }, async () => {
      await Promise.resolve()
    })
    const reversed = await createHost({ kind: 'viewer', materials: [second, first] })
    expect(host.t('label')).toBe('First')
    expect(reversed.t('label')).toBe('Second')
    await host.destroy()
    expect(host.localeDiagnostics).toEqual([])
    expect(() => host.t('label')).toThrow(/disposed/)
    expect(reversed.t('label')).toBe('Second')
    await reversed.destroy()
  })

  it('isolates cyclic invalid text branches without blocking creation or other text', async () => {
    const messages: Record<string, unknown> = { label: 'Valid' }
    messages.bad = messages
    const host = await createHost({ kind: 'viewer', materials: [material('cyclic', { messages })] })
    expect(host.t('label')).toBe('Valid')
    expect(host.t('bad')).toBe('bad')
    expect(host.localeDiagnostics).toContainEqual(expect.objectContaining({ code: 'locale-invalid', key: 'bad' }))
    await host.destroy()
  })
})
