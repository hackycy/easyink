import type { ContributionContext } from './types'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { ContributionRegistry } from './contribution-registry'

describe('contribution registry', () => {
  it('exposes the designer confirmation bridge to contributions', async () => {
    const confirm = vi.fn(() => true)
    const store = new DesignerStore(undefined, undefined, { confirm })
    const registry = new ContributionRegistry()
    let capturedContext: ContributionContext | undefined

    registry.activate([
      {
        id: 'test.confirm',
        activate(ctx) {
          capturedContext = ctx
        },
      },
    ], store)

    const result = await capturedContext?.confirm({
      id: 'test.confirm.delete',
      message: 'Delete?',
      severity: 'danger',
    })

    expect(result).toBe(true)
    expect(confirm).toHaveBeenCalledWith({
      id: 'test.confirm.delete',
      message: 'Delete?',
      severity: 'danger',
    })
  })
})
