import { describe, expect, it } from 'vitest'
import { applyPersistedWorkbench, extractPersistableWorkbench } from './preference-persistence'
import { createDefaultWorkbenchState } from './workbench'

describe('workbench preference persistence', () => {
  it('persists guide interaction state', () => {
    const state = createDefaultWorkbenchState()
    state.guide.enabled = true

    expect(extractPersistableWorkbench(state).guide).toEqual({ enabled: true })
  })

  it('merges persisted guide interaction state onto defaults', () => {
    const state = createDefaultWorkbenchState()

    applyPersistedWorkbench(state, { guide: { enabled: true } })

    expect(state.guide.enabled).toBe(true)
  })
})
