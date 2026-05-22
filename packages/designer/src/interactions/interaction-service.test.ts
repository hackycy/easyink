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

  it('delegates image picker requests to host provider and preserves cancel', async () => {
    const pickImage = vi.fn(() => ({ src: 'https://example.com/a.png', alt: 'A' }))
    const service = new DesignerInteractionService()
    service.setProvider({ pickImage })

    await expect(service.pickImage({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
      currentSrc: '',
      accept: ['image/*'],
      payload: { nodeId: 'img_1' },
    })).resolves.toEqual({ src: 'https://example.com/a.png', alt: 'A' })
    expect(pickImage).toHaveBeenCalledTimes(1)

    service.setProvider({ pickImage: () => null })
    await expect(service.pickImage({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
    })).resolves.toBeNull()
  })

  it('uses the fallback image picker only when no host picker is registered', async () => {
    const fallbackPickImage = vi.fn(() => ({ src: 'data:image/png;base64,fallback' }))
    const hostPickImage = vi.fn(() => ({ src: 'https://example.com/host.png' }))
    const service = new DesignerInteractionService()
    service.setFallbackProvider({ pickImage: fallbackPickImage })

    await expect(
      service.pickImage({ id: 'fallback', source: 'image-material' }),
    ).resolves.toEqual({ src: 'data:image/png;base64,fallback' })

    service.setProvider({ pickImage: hostPickImage })
    await expect(
      service.pickImage({ id: 'host', source: 'image-material' }),
    ).resolves.toEqual({ src: 'https://example.com/host.png' })
    expect(fallbackPickImage).toHaveBeenCalledTimes(1)
    expect(hostPickImage).toHaveBeenCalledTimes(1)
  })

  it('returns null when no image picker is available and propagates picker errors', async () => {
    const service = new DesignerInteractionService()

    await expect(service.pickImage({ id: 'missing', source: 'image-material' })).resolves.toBeNull()

    service.setProvider({
      pickImage: () => {
        throw new Error('boom')
      },
    })

    await expect(service.pickImage({ id: 'error', source: 'image-material' })).rejects.toThrow('boom')
  })
})
