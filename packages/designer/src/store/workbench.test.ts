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

  it('places default workspace windows on left and right side rails', () => {
    const state = createDefaultWorkbenchState()

    expect(state.windows.find(window => window.id === 'materials')).toMatchObject({ x: 32, y: 32 })
    expect(state.windows.find(window => window.id === 'datasource')).toMatchObject({ x: 32, y: 470 })
    expect(state.windows.find(window => window.id === 'properties')).toMatchObject({ x: -1, y: 32 })
    expect(state.windows.find(window => window.id === 'structure-tree')).toMatchObject({ x: -1, y: 548 })
    expect(state.windows.find(window => window.id === 'history')).toMatchObject({ x: 32, y: 470 })
  })
})
