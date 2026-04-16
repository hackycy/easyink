import { describe, expect, it } from 'vitest'
import { createDefaultWorkbenchState } from './workbench'

describe('createDefaultWorkbenchState', () => {
  it('keeps host-owned preview and template selection out of designer workbench state', () => {
    const state = createDefaultWorkbenchState()

    expect('preview' in state).toBe(false)
    expect('templateLibrary' in state).toBe(false)
  })

  it('initializes editor-owned workbench slices', () => {
    const state = createDefaultWorkbenchState()

    expect(state.status.focus).toBe('none')
    expect(state.snap.enabled).toBe(true)
    expect(state.windows.some(window => window.id === 'materials')).toBe(true)
  })
})
