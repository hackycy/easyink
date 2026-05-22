import { describe, expect, it, vi } from 'vitest'
import { DesignerInteractionService } from './interaction-service'

describe('designer interaction service', () => {
  it('delegates confirmation requests to the host provider', async () => {
    const confirm = vi.fn(() => true)
    const service = new DesignerInteractionService()
    service.setProvider({ confirm })

    const result = await service.confirm({
      id: 'designer.template.clear',
      message: 'Clear template?',
      payload: { elementCount: 2 },
    })

    expect(result).toBe(true)
    expect(confirm).toHaveBeenCalledWith({
      id: 'designer.template.clear',
      message: 'Clear template?',
      payload: { elementCount: 2 },
    })
  })

  it('uses the fallback provider only when no host confirm is registered', async () => {
    const fallbackConfirm = vi.fn(() => true)
    const hostConfirm = vi.fn(() => false)
    const service = new DesignerInteractionService()
    service.setFallbackProvider({ confirm: fallbackConfirm })

    await expect(service.confirm({ id: 'fallback', message: 'Fallback?' })).resolves.toBe(true)
    expect(fallbackConfirm).toHaveBeenCalledTimes(1)

    service.setProvider({ confirm: hostConfirm })

    await expect(service.confirm({ id: 'host', message: 'Host?' })).resolves.toBe(false)
    expect(hostConfirm).toHaveBeenCalledTimes(1)
    expect(fallbackConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancels safely when no provider is available or a provider throws', async () => {
    const service = new DesignerInteractionService()

    await expect(service.confirm({ id: 'missing', message: 'Missing?' })).resolves.toBe(false)

    service.setProvider({
      confirm: () => {
        throw new Error('boom')
      },
    })

    await expect(service.confirm({ id: 'error', message: 'Error?' })).resolves.toBe(false)
  })

  it('clears only the active fallback provider instance', async () => {
    const first = { confirm: vi.fn(() => true) }
    const second = { confirm: vi.fn(() => true) }
    const service = new DesignerInteractionService()

    service.setFallbackProvider(first)
    service.clearFallbackProvider(second)
    await expect(service.confirm({ id: 'first', message: 'First?' })).resolves.toBe(true)

    service.clearFallbackProvider(first)
    await expect(service.confirm({ id: 'cleared', message: 'Cleared?' })).resolves.toBe(false)
  })
})
