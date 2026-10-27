import type { FontDescriptor, FontProvider } from '@easyink/core'
import { FontManager } from '@easyink/core'
import { createTextNode } from '@easyink/material-text/viewer'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { applyFontSelections, loadAndInjectFonts } from './font-loader'
import { settleWithin, waitForCandidateImages } from './resource-readiness'

function fontProvider(loadFont: FontProvider['loadFont']): FontProvider {
  const fonts: FontDescriptor[] = [{ family: 'Brand', displayName: 'Brand', weights: ['400'], styles: ['normal'] }]
  return { listFonts: async () => fonts, loadFont }
}

function setFontFaceLoader(target: Document, load: Document['fonts']['load']): void {
  Object.defineProperty(target, 'fonts', { configurable: true, value: { load } })
}

describe('resource readiness', () => {
  it('uses a finite timeout and returns promptly on cancellation', async () => {
    const controller = new AbortController()
    const pending = new Promise<void>(() => {})
    const timedOut = await settleWithin(pending, controller.signal, 5)
    expect(timedOut).toEqual({ status: 'timed-out' })

    const cancelled = settleWithin(pending, controller.signal, 1000)
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
    await expect(settleWithin(Promise.reject(new Error('late external failure')), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('replaces a failed image and keeps a late decode detached from the candidate', async () => {
    const candidate = document.createElement('div')
    const wrapper = document.createElement('div')
    wrapper.dataset.elementId = 'logo'
    const image = document.createElement('img')
    image.src = 'https://invalid.example/logo.png'
    let resolveDecode!: () => void
    image.decode = () => new Promise<void>((resolve) => {
      resolveDecode = resolve
    })
    wrapper.append(image)
    candidate.append(wrapper)

    const diagnostics = await waitForCandidateImages(candidate, document, new AbortController().signal, 5)
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'IMAGE_LOAD_TIMEOUT', nodeId: 'logo' }))
    const placeholder = candidate.querySelector('[data-resource-placeholder="image"]')
    expect(placeholder?.textContent).toBe('Image unavailable')

    resolveDecode()
    await Promise.resolve()
    expect(candidate.querySelector('img')).toBeNull()
    expect(candidate.querySelector('[data-resource-placeholder="image"]')).toBe(placeholder)
  })

  it('reports a failed image and freezes its placeholder before any later load event', async () => {
    const candidate = document.createElement('div')
    const wrapper = document.createElement('div')
    wrapper.dataset.elementId = 'photo'
    const image = document.createElement('img')
    image.src = 'https://invalid.example/photo.png'
    image.decode = async () => {
      throw new Error('decode failed')
    }
    wrapper.append(image)
    candidate.append(wrapper)

    const diagnostics = await waitForCandidateImages(candidate, document, new AbortController().signal)
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'IMAGE_LOAD_FAILED', nodeId: 'photo' }))
    const placeholder = candidate.querySelector('[data-resource-placeholder="image"]')
    image.dispatchEvent(new Event('load'))
    expect(candidate.querySelector('[data-resource-placeholder="image"]')).toBe(placeholder)
  })

  it('waits for provider fonts in the requested document and applies deterministic fallbacks', async () => {
    const target = document.implementation.createHTMLDocument('font target')
    const face = { status: 'loaded' } as FontFace
    const loadFace = vi.fn(async () => [face])
    setFontFaceLoader(target, loadFace as Document['fonts']['load'])
    const manager = new FontManager(fontProvider(async () => 'data:font/woff2;base64,d09GMgABAAAA'))

    const result = await loadAndInjectFonts(new Set(['Brand']), manager, target, new AbortController().signal)

    const alias = result.familySelections.get('Brand')!
    expect(alias).toMatch(/^ei-viewer-font-/)
    expect(target.head.querySelector(`[data-easyink-font="${alias}|normal|normal"]`)).not.toBeNull()
    expect(loadFace).toHaveBeenCalledOnce()
    expect(loadFace.mock.contexts).toEqual([target.fonts])
  })

  it('times out a font provider without injecting a late font face', async () => {
    let resolveFont!: (source: string) => void
    const target = document.implementation.createHTMLDocument('font target')
    setFontFaceLoader(target, vi.fn(async () => [{ status: 'loaded' } as FontFace]) as Document['fonts']['load'])
    const manager = new FontManager(fontProvider(() => new Promise<string>((resolve) => {
      resolveFont = resolve
    })))

    const result = await loadAndInjectFonts(new Set(['Brand']), manager, target, new AbortController().signal, 5)
    expect(result.familySelections).toEqual(new Map([['Brand', 'sans-serif']]))
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'FONT_LOAD_TIMEOUT' }))
    expect(target.head.querySelector('[data-easyink-font]')).toBeNull()

    resolveFont('data:font/late')
    await Promise.resolve()
    expect(target.head.querySelector('[data-easyink-font]')).toBeNull()
  })

  it('keeps successful font rules owned by their Viewer when another request fails or is destroyed', async () => {
    const target = document.implementation.createHTMLDocument('shared font target')
    const loadFace = vi.fn(async () => [{ status: 'loaded' } as FontFace])
    setFontFaceLoader(target, loadFace as Document['fonts']['load'])
    const first = new FontManager(fontProvider(async () => 'data:font/first'))
    const second = new FontManager(fontProvider(async () => 'data:font/second'))
    const a = await loadAndInjectFonts(new Set(['Brand']), first, target, new AbortController().signal)
    const firstAlias = a.familySelections.get('Brand')!
    const firstRule = target.head.querySelector(`[data-easyink-font="${firstAlias}|normal|normal"]`)
    loadFace.mockRejectedValueOnce(new Error('second face failed'))

    const b = await loadAndInjectFonts(new Set(['Brand']), second, target, new AbortController().signal)
    expect(b.familySelections.get('Brand')).toBe('sans-serif')
    second.clear()
    expect(firstRule?.isConnected).toBe(true)
    expect(target.head.querySelectorAll('[data-easyink-font]')).toHaveLength(1)
    first.clear()
    expect(target.head.querySelector('[data-easyink-font]')).toBeNull()
  })

  it('bounds actual face readiness and retains fallback after a late completion', async () => {
    const target = document.implementation.createHTMLDocument('late face target')
    const ready = Promise.withResolvers<FontFace[]>()
    setFontFaceLoader(target, () => ready.promise)
    const manager = new FontManager(fontProvider(async () => 'data:font/late'))
    const result = await loadAndInjectFonts(new Set(['Brand']), manager, target, new AbortController().signal, 5)
    expect(result.familySelections.get('Brand')).toBe('sans-serif')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'FONT_LOAD_TIMEOUT' }))
    expect(target.head.querySelector('[data-easyink-font]')).toBeNull()
    ready.resolve([{ status: 'loaded' } as FontFace])
    await ready.promise
    expect(result.familySelections.get('Brand')).toBe('sans-serif')
    expect(target.head.querySelector('[data-easyink-font]')).toBeNull()
    manager.clear()
  })

  it('does not ask a provider for declared system fonts', async () => {
    const target = document.implementation.createHTMLDocument('system font target')
    const loadFace = vi.fn(async () => [])
    setFontFaceLoader(target, loadFace as Document['fonts']['load'])
    const loadFont = vi.fn(async () => 'unused')
    const manager = new FontManager({ listFonts: async () => [{ family: 'Arial', displayName: 'Arial', weights: ['400'], styles: ['normal'], source: 'system' }], loadFont })
    const result = await loadAndInjectFonts(new Set(['Arial']), manager, target, new AbortController().signal)
    expect(result.diagnostics).toEqual([])
    expect(result.familySelections.size).toBe(0)
    expect(loadFont).not.toHaveBeenCalled()
    expect(target.head.querySelector('[data-easyink-font]')).toBeNull()
  })

  it('freezes failed declared families to the generic fallback before layout', () => {
    const schema = normalizeDocumentSchema({ elements: [createTextNode({ props: {
      fontFamily: 'Brand',
      typography: { fontFamily: 'Brand' },
    } })] })
    schema.page.font = 'Brand'

    applyFontSelections(schema, new Map([['Brand', 'sans-serif']]))

    expect(schema.page.font).toBe('sans-serif')
    expect(schema.elements[0]?.props).toMatchObject({
      fontFamily: 'sans-serif',
      typography: { fontFamily: 'sans-serif' },
    })
  })
})
