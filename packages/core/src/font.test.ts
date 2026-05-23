import type { FontDescriptor, FontProvider } from './font'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectFontFamilies, FontManager } from './font'

function createMockProvider(): FontProvider {
  const fonts: FontDescriptor[] = [
    { family: 'Arial', displayName: 'Arial', weights: ['400', '700'], styles: ['normal', 'italic'] },
    { family: 'Roboto', displayName: 'Roboto', weights: ['400'], styles: ['normal'] },
  ]
  return {
    listFonts: async () => fonts,
    loadFont: async (family: string) => `data:font/${family}`,
  }
}

describe('fontManager', () => {
  beforeEach(() => {
    document.head.querySelectorAll('style[data-easyink-font]').forEach(style => style.remove())
  })

  it('listFonts returns fonts from provider', async () => {
    const mgr = new FontManager(createMockProvider())
    const fonts = await mgr.listFonts()
    expect(fonts).toHaveLength(2)
    expect(fonts[0]!.family).toBe('Arial')
  })

  it('listFonts caches the result', async () => {
    let callCount = 0
    const provider: FontProvider = {
      listFonts: async () => {
        callCount++
        return [{ family: 'Test', displayName: 'Test', weights: ['400'], styles: ['normal'] }]
      },
      loadFont: async () => 'data',
    }
    const mgr = new FontManager(provider)
    await mgr.listFonts()
    await mgr.listFonts()
    expect(callCount).toBe(1)
  })

  it('listFonts returns empty array when no provider', async () => {
    const mgr = new FontManager()
    const fonts = await mgr.listFonts()
    expect(fonts).toEqual([])
  })

  it('loadFont returns font source', async () => {
    const mgr = new FontManager(createMockProvider())
    const source = await mgr.loadFont('Arial')
    expect(source).toBe('data:font/Arial')
  })

  it('loadFont caches the result', async () => {
    let callCount = 0
    const provider: FontProvider = {
      listFonts: async () => [],
      loadFont: async (family: string) => {
        callCount++
        return `data:${family}`
      },
    }
    const mgr = new FontManager(provider)
    await mgr.loadFont('Arial')
    await mgr.loadFont('Arial')
    expect(callCount).toBe(1)
  })

  it('loadFont reuses in-flight requests for the same font', async () => {
    let callCount = 0
    let resolveLoad: ((value: string) => void) | undefined
    const provider: FontProvider = {
      listFonts: async () => [],
      loadFont: () => {
        callCount++
        return new Promise((resolve) => {
          resolveLoad = resolve
        })
      },
    }
    const mgr = new FontManager(provider)

    const first = mgr.loadFont('Arial')
    const second = mgr.loadFont('Arial')

    expect(callCount).toBe(1)
    resolveLoad?.('data:Arial')

    await expect(Promise.all([first, second])).resolves.toEqual(['data:Arial', 'data:Arial'])
    expect(mgr.isLoaded('Arial')).toBe(true)
  })

  it('loadFont throws when no provider', async () => {
    const mgr = new FontManager()
    await expect(mgr.loadFont('Arial')).rejects.toThrow('No font provider configured')
  })

  it('isLoaded reflects cache state', async () => {
    const mgr = new FontManager(createMockProvider())
    expect(mgr.isLoaded('Arial')).toBe(false)
    await mgr.loadFont('Arial')
    expect(mgr.isLoaded('Arial')).toBe(true)
  })

  it('tracks loading status and errors', async () => {
    const provider: FontProvider = {
      listFonts: async () => [],
      loadFont: async (family: string) => {
        if (family === 'Bad')
          throw new Error('missing')
        return 'ok'
      },
    }
    const mgr = new FontManager(provider)

    expect(mgr.getLoadState('Good').status).toBe('unloaded')
    await mgr.loadFont('Good')
    expect(mgr.getLoadState('Good').status).toBe('loaded')

    await expect(mgr.loadFont('Bad')).rejects.toThrow('missing')
    expect(mgr.getLoadState('Bad')).toMatchObject({
      status: 'error',
      message: 'missing',
    })
  })

  it('ensureFontLoaded injects font-face once per target', async () => {
    const mgr = new FontManager(createMockProvider())

    await mgr.ensureFontLoaded({ family: 'Arial' }, document)
    await mgr.ensureFontLoaded({ family: 'Arial' }, document)

    const styles = [...document.head.querySelectorAll('style[data-easyink-font="Arial|normal|normal"]')]
    expect(styles).toHaveLength(1)
    expect(styles[0]!.textContent).toContain('font-family: "Arial"')
  })

  it('setProvider removes previously injected font-face rules for the same manager', async () => {
    const firstProvider: FontProvider = {
      listFonts: async () => [],
      loadFont: async () => '/fonts/old.woff2',
    }
    const secondProvider: FontProvider = {
      listFonts: async () => [],
      loadFont: async () => '/fonts/new.woff2',
    }
    const mgr = new FontManager(firstProvider)

    await mgr.ensureFontLoaded({ family: 'Brand' }, document)
    expect(document.head.querySelector('style[data-easyink-font="Brand|normal|normal"]')?.textContent)
      .toContain('/fonts/old.woff2')

    mgr.setProvider(secondProvider)
    await mgr.ensureFontLoaded({ family: 'Brand' }, document)

    const styles = [...document.head.querySelectorAll('style[data-easyink-font="Brand|normal|normal"]')]
    expect(styles).toHaveLength(1)
    expect(styles[0]!.textContent).toContain('/fonts/new.woff2')
    expect(styles[0]!.textContent).not.toContain('/fonts/old.woff2')
  })

  it('does not inject an in-flight font after provider changes', async () => {
    let resolveLoad: ((value: string) => void) | undefined
    const firstProvider: FontProvider = {
      listFonts: async () => [],
      loadFont: () => new Promise((resolve) => {
        resolveLoad = resolve
      }),
    }
    const mgr = new FontManager(firstProvider)
    const request = mgr.ensureFontLoaded({ family: 'Brand' }, document)

    mgr.setProvider({
      listFonts: async () => [],
      loadFont: async () => '/fonts/new.woff2',
    })
    resolveLoad?.('/fonts/old.woff2')

    await expect(request).rejects.toThrow('Font provider changed')
    expect(document.head.querySelector('style[data-easyink-font="Brand|normal|normal"]')).toBeNull()
  })

  it('collectFontFamilies includes page and element fonts', () => {
    const families = collectFontFamilies({
      unit: 'mm',
      page: {
        mode: 'fixed',
        width: 100,
        height: 100,
        font: 'PageFont',
      },
      elements: [
        {
          id: 'text-1',
          type: 'text',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          props: { fontFamily: 'ElementFont' },
        },
      ],
    })

    expect([...families]).toEqual(['PageFont', 'ElementFont'])
  })

  it('collectFontFamilies traverses hosted table cell elements', () => {
    const families = collectFontFamilies({
      unit: 'mm',
      page: {
        mode: 'fixed',
        width: 100,
        height: 100,
      },
      elements: [
        {
          id: 'table-1',
          type: 'table-static',
          x: 0,
          y: 0,
          width: 80,
          height: 20,
          props: {},
          table: {
            kind: 'static',
            topology: {
              columns: [{ ratio: 1 }],
              rows: [{
                height: 20,
                cells: [{
                  content: {
                    elements: [{
                      id: 'text-1',
                      type: 'text',
                      x: 0,
                      y: 0,
                      width: 10,
                      height: 10,
                      props: { fontFamily: 'HostedFont' },
                    }],
                  },
                }],
              }],
            },
            layout: {},
          },
        },
      ],
    })

    expect([...families]).toEqual(['HostedFont'])
  })

  it('preloadFonts loads multiple families', async () => {
    const mgr = new FontManager(createMockProvider())
    const result = await mgr.preloadFonts(['Arial', 'Roboto'])
    expect(result.loadedFamilies).toEqual(['Arial', 'Roboto'])
    expect(result.failures).toEqual([])
    expect(mgr.isLoaded('Arial')).toBe(true)
    expect(mgr.isLoaded('Roboto')).toBe(true)
  })

  it('preloadFonts reports individual failures without aborting the batch', async () => {
    const provider: FontProvider = {
      listFonts: async () => [],
      loadFont: async (family: string) => {
        if (family === 'Bad')
          throw new Error('fail')
        return 'ok'
      },
    }
    const mgr = new FontManager(provider)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await mgr.preloadFonts(['Good', 'Bad'])

    expect(result.loadedFamilies).toEqual(['Good'])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toMatchObject({
      family: 'Bad',
      message: 'fail',
    })
    expect(warn).toHaveBeenCalledWith('[easyink] font preload failed', expect.objectContaining({
      family: 'Bad',
      message: 'fail',
    }))
    warn.mockRestore()

    expect(mgr.isLoaded('Good')).toBe(true)
    expect(mgr.isLoaded('Bad')).toBe(false)
  })

  it('clear resets cache and font list', async () => {
    const mgr = new FontManager(createMockProvider())
    await mgr.listFonts()
    await mgr.loadFont('Arial')
    mgr.clear()
    expect(mgr.isLoaded('Arial')).toBe(false)
  })
})
