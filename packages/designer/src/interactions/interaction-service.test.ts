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

  it('delegates asset picker requests to host provider and preserves cancel', async () => {
    const pickAsset = vi.fn(() => ({ url: 'https://example.com/a.png', alt: 'A' }))
    const service = new DesignerInteractionService()
    service.setProvider({ pickAsset })

    await expect(service.pickAsset({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
      currentUrl: '',
      accept: ['image/*'],
      payload: { nodeId: 'img_1' },
    })).resolves.toEqual({ url: 'https://example.com/a.png', alt: 'A' })
    expect(pickAsset).toHaveBeenCalledTimes(1)

    service.setProvider({ pickAsset: () => null })
    await expect(service.pickAsset({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
    })).resolves.toBeNull()
  })

  it('uses the shell asset picker only when no host picker is registered', async () => {
    const fallbackPickAsset = vi.fn(() => ({ url: 'https://example.com/fallback.png' }))
    const hostPickAsset = vi.fn(() => ({ url: 'https://example.com/host.png' }))
    const service = new DesignerInteractionService()
    service.setFallbackProvider({ pickAsset: fallbackPickAsset })

    await expect(
      service.pickAsset({ id: 'fallback', source: 'image-material' }),
    ).resolves.toEqual({ url: 'https://example.com/fallback.png' })

    service.setProvider({ pickAsset: hostPickAsset })
    await expect(
      service.pickAsset({ id: 'host', source: 'image-material' }),
    ).resolves.toEqual({ url: 'https://example.com/host.png' })
    expect(fallbackPickAsset).toHaveBeenCalledTimes(1)
    expect(hostPickAsset).toHaveBeenCalledTimes(1)
  })

  it('uploads local files picked by either picker before returning a stable asset', async () => {
    const file = new File(['image'], 'sample.png', { type: 'image/png' })
    const pickAsset = vi.fn(() => ({ file, name: 'sample.png', metadata: { source: 'library' } }))
    const uploadAsset = vi.fn(() => ({ url: 'https://cdn.example.com/sample.png', assetId: 'asset_1' }))
    const service = new DesignerInteractionService()
    service.setProvider({ pickAsset, uploadAsset })

    await expect(service.pickAsset({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
      accept: ['image/*'],
    })).resolves.toEqual({ url: 'https://cdn.example.com/sample.png', assetId: 'asset_1' })

    expect(uploadAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
      file,
      picked: expect.objectContaining({ file, name: 'sample.png' }),
    }))
  })

  it('can combine the shell file picker with a host uploader', async () => {
    const file = new File(['image'], 'sample.png', { type: 'image/png' })
    const fallbackPickAsset = vi.fn(() => ({ file, name: 'sample.png' }))
    const uploadAsset = vi.fn(() => ({ url: 'https://cdn.example.com/sample.png' }))
    const service = new DesignerInteractionService()
    service.setFallbackProvider({ pickAsset: fallbackPickAsset })
    service.setProvider({ uploadAsset })

    expect(service.canPickAsset()).toBe(true)
    await expect(service.pickAsset({ id: 'fallback', source: 'image-material' }))
      .resolves
      .toEqual({ url: 'https://cdn.example.com/sample.png' })
    expect(fallbackPickAsset).toHaveBeenCalledTimes(1)
    expect(uploadAsset).toHaveBeenCalledTimes(1)
  })

  it('uses the shell uploader when no host uploader is registered', async () => {
    const file = new File(['image'], 'sample.png', { type: 'image/png' })
    const fallbackPickAsset = vi.fn(() => ({ file, name: 'sample.png' }))
    const fallbackUploadAsset = vi.fn(() => ({ url: 'data:image/png;base64,aW1hZ2U=', name: 'sample.png' }))
    const service = new DesignerInteractionService()
    service.setFallbackProvider({ pickAsset: fallbackPickAsset, uploadAsset: fallbackUploadAsset })

    expect(service.canPickAsset()).toBe(true)
    await expect(service.pickAsset({ id: 'fallback', source: 'image-material' }))
      .resolves
      .toEqual({ url: 'data:image/png;base64,aW1hZ2U=', name: 'sample.png' })
    expect(fallbackPickAsset).toHaveBeenCalledTimes(1)
    expect(fallbackUploadAsset).toHaveBeenCalledWith(expect.objectContaining({
      file,
      picked: expect.objectContaining({ file, name: 'sample.png' }),
    }))
  })

  it('uses the shell uploader for host-picked local files when the host omits uploadAsset', async () => {
    const file = new File(['image'], 'sample.png', { type: 'image/png' })
    const pickAsset = vi.fn(() => ({ file, name: 'sample.png' }))
    const fallbackUploadAsset = vi.fn(() => ({ url: 'data:image/png;base64,aW1hZ2U=', name: 'sample.png' }))
    const service = new DesignerInteractionService()
    service.setProvider({ pickAsset })
    service.setFallbackProvider({ uploadAsset: fallbackUploadAsset })

    await expect(service.pickAsset({ id: 'host-local', source: 'image-material' }))
      .resolves
      .toEqual({ url: 'data:image/png;base64,aW1hZ2U=', name: 'sample.png' })
    expect(fallbackUploadAsset).toHaveBeenCalledTimes(1)
  })

  it('returns null when no asset picker is available or a local file cannot be uploaded', async () => {
    const file = new File(['image'], 'sample.png', { type: 'image/png' })
    const service = new DesignerInteractionService()

    await expect(service.pickAsset({ id: 'missing', source: 'image-material' })).resolves.toBeNull()

    service.setFallbackProvider({ pickAsset: () => ({ file }) })
    await expect(service.pickAsset({ id: 'local', source: 'image-material' })).resolves.toBeNull()
  })

  it('propagates asset picker errors', async () => {
    const service = new DesignerInteractionService()

    service.setProvider({
      pickAsset: () => {
        throw new Error('boom')
      },
    })

    await expect(service.pickAsset({ id: 'error', source: 'image-material' })).rejects.toThrow('boom')
  })

  it('delegates text file picker requests to host provider and preserves cancel', async () => {
    const pickFileText = vi.fn(() => ({ text: '<svg />', name: 'logo.svg' }))
    const service = new DesignerInteractionService()
    service.setProvider({ pickFileText })

    await expect(service.pickFileText({
      id: 'designer.svgCustom.importFile',
      source: 'svg-custom-content',
      accept: ['.svg', 'image/svg+xml'],
      payload: { propKey: 'content' },
    })).resolves.toEqual({ text: '<svg />', name: 'logo.svg' })
    expect(pickFileText).toHaveBeenCalledTimes(1)

    service.setProvider({ pickFileText: () => null })
    await expect(service.pickFileText({
      id: 'designer.svgCustom.importFile',
      source: 'svg-custom-content',
    })).resolves.toBeNull()
  })

  it('uses the shell text file picker only when no host picker is registered', async () => {
    const fallbackPickFileText = vi.fn(() => ({ text: 'fallback' }))
    const hostPickFileText = vi.fn(() => ({ text: 'host' }))
    const service = new DesignerInteractionService()
    service.setFallbackProvider({ pickFileText: fallbackPickFileText })

    expect(service.canPickFileText()).toBe(true)
    await expect(
      service.pickFileText({ id: 'fallback', source: 'prop-schema' }),
    ).resolves.toEqual({ text: 'fallback' })

    service.setProvider({ pickFileText: hostPickFileText })
    expect(service.hasHostTextFilePicker()).toBe(true)
    await expect(
      service.pickFileText({ id: 'host', source: 'prop-schema' }),
    ).resolves.toEqual({ text: 'host' })
    expect(fallbackPickFileText).toHaveBeenCalledTimes(1)
    expect(hostPickFileText).toHaveBeenCalledTimes(1)
  })
})
