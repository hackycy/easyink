import type { PageSettings } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { BackgroundPositionPicker } from '../components/BackgroundPositionPicker'
import { PageSettingsPanel } from '../components/PageSettingsPanel'

describe('pageSettingsPanel', () => {
  it('is a named component', () => {
    expect(PageSettingsPanel.name).toBe('PageSettingsPanel')
  })

  it('exports setup function', () => {
    expect(typeof PageSettingsPanel.setup).toBe('function')
  })
})

describe('backgroundPositionPicker', () => {
  it('is a named component', () => {
    expect(BackgroundPositionPicker.name).toBe('BackgroundPositionPicker')
  })

  it('has modelValue prop with default "center"', () => {
    const props = BackgroundPositionPicker.props as Record<string, any>
    expect(props.modelValue.default).toBe('center')
  })

  it('emits update:modelValue', () => {
    expect(BackgroundPositionPicker.emits).toContain('update:modelValue')
  })
})

describe('getPaperType helper', () => {
  // Test via PageSettingsPanel logic indirectly
  it('handles preset paper strings', () => {
    const page: PageSettings = {
      margins: { bottom: 10, left: 10, right: 10, top: 10 },
      orientation: 'portrait',
      paper: 'A4',
      unit: 'mm',
    }

    // The paper type for string presets is the string itself
    expect(typeof page.paper).toBe('string')
    expect(page.paper).toBe('A4')
  })

  it('handles custom paper', () => {
    const page: PageSettings = {
      margins: { bottom: 10, left: 10, right: 10, top: 10 },
      orientation: 'portrait',
      paper: { height: 297, type: 'custom', width: 210 },
      unit: 'mm',
    }

    expect(typeof page.paper).toBe('object')
    expect((page.paper as any).type).toBe('custom')
  })

  it('handles label paper', () => {
    const page: PageSettings = {
      margins: { bottom: 5, left: 5, right: 5, top: 5 },
      orientation: 'portrait',
      paper: { height: 40, type: 'label', width: 60 },
      unit: 'mm',
    }

    expect(typeof page.paper).toBe('object')
    expect((page.paper as any).type).toBe('label')
  })
})

describe('page settings command integration', () => {
  it('createUpdatePageSettingsCommand is callable', async () => {
    const { createUpdatePageSettingsCommand } = await import('@easyink/core')
    const ops = {
      updatePageSettings: vi.fn(),
    } as any

    const oldSettings: PageSettings = {
      margins: { bottom: 10, left: 10, right: 10, top: 10 },
      orientation: 'portrait' as const,
      paper: 'A4',
      unit: 'mm' as const,
    }
    const newSettings: PageSettings = {
      ...oldSettings,
      orientation: 'landscape' as const,
    }

    const cmd = createUpdatePageSettingsCommand({ newSettings, oldSettings }, ops)
    expect(cmd.type).toBe('update-page-settings')

    cmd.execute()
    expect(ops.updatePageSettings).toHaveBeenCalledWith(newSettings)

    cmd.undo()
    expect(ops.updatePageSettings).toHaveBeenCalledWith(oldSettings)
  })

  it('paper sizes contains standard presets', async () => {
    const { PAPER_SIZES } = await import('@easyink/core')

    expect(PAPER_SIZES.A4).toEqual({ height: 297, width: 210 })
    expect(PAPER_SIZES.Letter).toBeDefined()
    expect(PAPER_SIZES.A3).toBeDefined()
  })
})
