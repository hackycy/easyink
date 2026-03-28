import { describe, expect, it } from 'vitest'
import { useLocale } from '../locale/use-locale'
import { zhCN } from '../locale/zh-CN'

describe('useLocale', () => {
  it('returns default zh-CN messages', () => {
    const { t } = useLocale()
    expect(t('toolbar.undo')).toBe('撤销')
    expect(t('toolbar.redo')).toBe('重做')
    expect(t('property.title')).toBe('属性')
  })

  it('resolves nested keys with dot notation', () => {
    const { t } = useLocale()
    expect(t('statusBar.zoom')).toBe('缩放')
  })

  it('returns key when not found', () => {
    const { t } = useLocale()
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('merges extra messages', () => {
    const { merge, t } = useLocale()
    merge({ toolbar: { custom: '自定义' } })
    expect(t('toolbar.custom')).toBe('自定义')
    // existing keys preserved
    expect(t('toolbar.undo')).toBe('撤销')
  })

  it('replaces all messages with setLocale', () => {
    const { setLocale, t } = useLocale()
    setLocale({ toolbar: { undo: 'Undo' } })
    expect(t('toolbar.undo')).toBe('Undo')
    expect(t('toolbar.redo')).toBe('toolbar.redo')
  })

  it('accepts custom locale on creation', () => {
    const { t } = useLocale({ toolbar: { undo: 'Undo' } })
    expect(t('toolbar.undo')).toBe('Undo')
  })

  it('exports zhCN with all required groups', () => {
    expect(zhCN.toolbar).toBeDefined()
    expect(zhCN.property).toBeDefined()
    expect(zhCN.statusBar).toBeDefined()
  })
})
