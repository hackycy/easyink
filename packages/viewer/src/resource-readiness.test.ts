import type { FontProvider } from '@easyink/core'
import { FontManager } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { createFontPreparationAdapter } from './font-loader'
import { createResourceReadinessCoordinator } from './resource-readiness'

describe('resourceReadinessCoordinator', () => {
  it('versions first terminal transitions and repeats stable diagnostics in input order', async () => {
    const prepareFont = vi.fn(async () => ({ state: 'ready' as const }))
    const prepareAsset = vi.fn(async (value: string) => ({
      state: 'failed' as const,
      message: `missing ${value}`,
    }))
    const coordinator = createResourceReadinessCoordinator({ prepareFont, prepareAsset })
    const resources = [
      { kind: 'font' as const, value: 'Invoice Sans' },
      { kind: 'asset' as const, value: 'missing' },
      { kind: 'font' as const, value: 'Invoice Sans' },
    ]

    const first = await coordinator.prepare(resources, new AbortController().signal)

    expect(first.resourceRevision).toBe(2)
    expect(coordinator.resourceRevision).toBe(2)
    expect(prepareFont).toHaveBeenCalledTimes(1)
    expect(prepareAsset).toHaveBeenCalledTimes(1)
    expect(first.diagnostics).toEqual([{
      code: 'VIEWER_ASSET_PREPARE_FAILED',
      resource: { kind: 'asset', value: 'missing' },
      message: 'missing missing',
    }])

    const repeated = await coordinator.prepare([
      { kind: 'asset', value: 'missing' },
    ], new AbortController().signal)
    expect(repeated.resourceRevision).toBe(2)
    expect(repeated.diagnostics).toEqual(first.diagnostics)
    expect(prepareAsset).toHaveBeenCalledTimes(2)
  })

  it('uses injective tuple keys for delimiter-bearing values and trims declared values', async () => {
    const prepareFont = vi.fn(async () => ({ state: 'ready' as const }))
    const prepareAsset = vi.fn(async () => ({ state: 'ready' as const }))
    const coordinator = createResourceReadinessCoordinator({ prepareFont, prepareAsset })

    const result = await coordinator.prepare([
      { kind: 'font', value: ' asset:logo ' },
      { kind: 'asset', value: 'font:asset:logo' },
      { kind: 'font', value: 'asset:logo' },
    ], new AbortController().signal)

    expect(result.resourceRevision).toBe(2)
    expect(prepareFont).toHaveBeenCalledOnce()
    expect(prepareFont).toHaveBeenCalledWith('asset:logo', expect.any(AbortSignal))
    expect(prepareAsset).toHaveBeenCalledWith('font:asset:logo', expect.any(AbortSignal))
  })

  it('publishes one terminal transition when concurrent callers finish the same key', async () => {
    const resolvers: Array<(value: { state: 'ready' }) => void> = []
    const prepareFont = vi.fn(() => new Promise<{ state: 'ready' }>((resolve) => {
      resolvers.push(resolve)
    }))
    const coordinator = createResourceReadinessCoordinator({
      prepareFont,
      prepareAsset: async () => ({ state: 'ready' as const }),
    })

    const first = coordinator.prepare([{ kind: 'font', value: 'Brand' }], new AbortController().signal)
    const second = coordinator.prepare([{ kind: 'font', value: 'Brand' }], new AbortController().signal)
    expect(prepareFont).toHaveBeenCalledTimes(2)

    resolvers.forEach(resolve => resolve({ state: 'ready' }))
    const results = await Promise.all([first, second])

    expect(results.map(result => result.resourceRevision)).toEqual([1, 1])
    expect(coordinator.resourceRevision).toBe(1)
  })

  it('retries dependency throws without advancing an unchanged failed terminal state', async () => {
    const prepareFont = vi.fn(async () => {
      throw new Error('font host unavailable')
    })
    const coordinator = createResourceReadinessCoordinator({
      prepareFont,
      prepareAsset: async () => ({ state: 'ready' as const }),
    })

    const first = await coordinator.prepare([{ kind: 'font', value: 'Brand' }], new AbortController().signal)
    const second = await coordinator.prepare([{ kind: 'font', value: 'Brand' }], new AbortController().signal)

    expect(first).toEqual({
      resourceRevision: 1,
      diagnostics: [{
        code: 'VIEWER_FONT_PREPARE_FAILED',
        resource: { kind: 'font', value: 'Brand' },
        message: 'font host unavailable',
      }],
    })
    expect(second).toEqual(first)
    expect(prepareFont).toHaveBeenCalledTimes(2)
  })

  it('retries failed resources and versions only failed-to-ready terminal changes', async () => {
    const outcomes = [
      { state: 'failed' as const, message: 'first failure' },
      { state: 'failed' as const, message: 'second failure' },
      { state: 'ready' as const },
    ]
    const prepareFont = vi.fn(async () => outcomes.shift()!)
    const coordinator = createResourceReadinessCoordinator({
      prepareFont,
      prepareAsset: async () => ({ state: 'ready' as const }),
    })
    const resource = [{ kind: 'font' as const, value: 'Brand' }]

    const first = await coordinator.prepare(resource, new AbortController().signal)
    const second = await coordinator.prepare(resource, new AbortController().signal)
    const third = await coordinator.prepare(resource, new AbortController().signal)
    const fourth = await coordinator.prepare(resource, new AbortController().signal)

    expect([first.resourceRevision, second.resourceRevision, third.resourceRevision, fourth.resourceRevision])
      .toEqual([1, 1, 2, 2])
    expect(first.diagnostics).toEqual([expect.objectContaining({ message: 'first failure' })])
    expect(second.diagnostics).toEqual([expect.objectContaining({ message: 'second failure' })])
    expect(third.diagnostics).toEqual([])
    expect(prepareFont).toHaveBeenCalledTimes(3)
  })

  it('clears terminal state and revision', async () => {
    const prepareFont = vi.fn(async () => ({ state: 'ready' as const }))
    const coordinator = createResourceReadinessCoordinator({
      prepareFont,
      prepareAsset: async () => ({ state: 'ready' as const }),
    })

    await coordinator.prepare([{ kind: 'font', value: 'Brand' }], new AbortController().signal)
    expect(coordinator.resourceRevision).toBe(1)

    coordinator.clear()
    expect(coordinator.resourceRevision).toBe(0)
    await coordinator.prepare([{ kind: 'font', value: 'Brand' }], new AbortController().signal)
    expect(prepareFont).toHaveBeenCalledTimes(2)
    expect(coordinator.resourceRevision).toBe(1)
  })

  it('preserves pre-abort reason without invoking dependencies', async () => {
    const prepareFont = vi.fn(async () => ({ state: 'ready' as const }))
    const coordinator = createResourceReadinessCoordinator({
      prepareFont,
      prepareAsset: async () => ({ state: 'ready' as const }),
    })
    const controller = new AbortController()
    const reason = new DOMException('cancelled by caller', 'AbortError')
    controller.abort(reason)

    await expect(coordinator.prepare([{ kind: 'font', value: 'Brand' }], controller.signal))
      .rejects
      .toBe(reason)
    expect(prepareFont).not.toHaveBeenCalled()
    expect(coordinator.resourceRevision).toBe(0)
  })

  it('does not publish in-progress work aborted for one caller or contaminate another caller', async () => {
    const resolvers: Array<(value: { state: 'ready' }) => void> = []
    const prepareFont = vi.fn((_value: string, _signal: AbortSignal) => new Promise<{ state: 'ready' }>((resolve) => {
      resolvers.push(resolve)
    }))
    const coordinator = createResourceReadinessCoordinator({
      prepareFont,
      prepareAsset: async () => ({ state: 'ready' as const }),
    })
    const aborted = new AbortController()
    const active = new AbortController()
    const reason = new DOMException('stale task', 'AbortError')

    const first = coordinator.prepare([{ kind: 'font', value: 'Brand' }], aborted.signal)
    const second = coordinator.prepare([{ kind: 'font', value: 'Brand' }], active.signal)
    aborted.abort(reason)
    resolvers.forEach(resolve => resolve({ state: 'ready' }))

    await expect(first).rejects.toBe(reason)
    await expect(second).resolves.toMatchObject({ resourceRevision: 1, diagnostics: [] })
    expect(coordinator.resourceRevision).toBe(1)
  })

  it('checks abort again after a dependency completes before publishing', async () => {
    const controller = new AbortController()
    const reason = new DOMException('completed task became stale', 'AbortError')
    const coordinator = createResourceReadinessCoordinator({
      prepareFont: async () => {
        controller.abort(reason)
        return { state: 'ready' as const }
      },
      prepareAsset: async () => ({ state: 'ready' as const }),
    })

    await expect(coordinator.prepare([{ kind: 'font', value: 'Brand' }], controller.signal))
      .rejects
      .toBe(reason)
    expect(coordinator.resourceRevision).toBe(0)
  })

  it.each([
    null,
    {},
    { kind: 'video', value: 'clip' },
    { kind: 'font', value: 1 },
    { kind: 'font', value: '   ' },
  ])('rejects malformed runtime resource input %#', async (resource) => {
    const coordinator = createResourceReadinessCoordinator({
      prepareFont: async () => ({ state: 'ready' as const }),
      prepareAsset: async () => ({ state: 'ready' as const }),
    })

    await expect(coordinator.prepare([resource] as never, new AbortController().signal))
      .rejects
      .toThrowError('VIEWER_RESOURCE_PREPARE_INPUT_INVALID')
    expect(coordinator.resourceRevision).toBe(0)
  })

  it('returns recursively frozen copies without freezing caller input', async () => {
    const resource = { kind: 'asset' as const, value: 'missing' }
    const resources = [resource]
    const coordinator = createResourceReadinessCoordinator({
      prepareFont: async () => ({ state: 'ready' as const }),
      prepareAsset: async () => ({ state: 'failed' as const, message: 'missing' }),
    })

    const result = await coordinator.prepare(resources, new AbortController().signal)

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.diagnostics)).toBe(true)
    expect(Object.isFrozen(result.diagnostics[0])).toBe(true)
    expect(Object.isFrozen(result.diagnostics[0]!.resource)).toBe(true)
    expect(Object.isFrozen(resources)).toBe(false)
    expect(Object.isFrozen(resource)).toBe(false)
  })
})

describe('createFontPreparationAdapter', () => {
  it('maps FontManager injection success and failure to terminal results', async () => {
    const provider: FontProvider = {
      listFonts: async () => [],
      loadFont: async (family) => {
        if (family === 'Missing')
          throw new Error('not found')
        return `/fonts/${family}.woff2`
      },
    }
    const manager = new FontManager(provider)
    const prepareFont = createFontPreparationAdapter(manager, document)
    const restoreFonts = installDocumentFonts(document, {
      load: vi.fn(async () => [{} as FontFace]),
      ready: Promise.resolve({} as FontFaceSet),
    })

    try {
      await expect(prepareFont('Brand', new AbortController().signal))
        .resolves
        .toEqual({ state: 'ready' })
      await expect(prepareFont('Missing', new AbortController().signal))
        .resolves
        .toEqual({ state: 'failed', message: 'not found' })
      expect(document.head.querySelector('style[data-easyink-font="Brand|normal|normal"]')).not.toBeNull()
    }
    finally {
      restoreFonts()
    }
  })

  it('waits for both fonts.load and fonts.ready before reporting ready', async () => {
    let resolveLoad: ((faces: FontFace[]) => void) | undefined
    let resolveReady: ((fontSet: FontFaceSet) => void) | undefined
    const load = vi.fn(() => new Promise<FontFace[]>((resolve) => {
      resolveLoad = resolve
    }))
    const ready = new Promise<FontFaceSet>((resolve) => {
      resolveReady = resolve
    })
    const restoreFonts = installDocumentFonts(document, { load, ready })
    const manager = new FontManager({
      listFonts: async () => [],
      loadFont: async () => '/fonts/brand.woff2',
    })
    const prepareFont = createFontPreparationAdapter(manager, document)
    let settled = false

    try {
      const pending = prepareFont('Brand', new AbortController().signal)
        .finally(() => {
          settled = true
        })
      await vi.waitFor(() => expect(load).toHaveBeenCalledOnce())
      expect(settled).toBe(false)

      resolveLoad?.([{} as FontFace])
      await Promise.resolve()
      expect(settled).toBe(false)

      resolveReady?.({} as FontFaceSet)
      await expect(pending).resolves.toEqual({ state: 'ready' })
    }
    finally {
      restoreFonts()
    }
  })

  it.each([
    ['rejects', vi.fn(async () => { throw new Error('font decode failed') }), 'font decode failed'],
    ['returns no faces', vi.fn(async () => []), 'VIEWER_FONT_LOAD_EMPTY'],
  ])('reports failed when fonts.load %s', async (_case, load, message) => {
    const check = vi.fn(() => true)
    const restoreFonts = installDocumentFonts(document, {
      load,
      ready: Promise.resolve({} as FontFaceSet),
      check,
    })
    const manager = new FontManager({
      listFonts: async () => [],
      loadFont: async () => '/fonts/brand.woff2',
    })

    try {
      await expect(createFontPreparationAdapter(manager, document)('Brand', new AbortController().signal))
        .resolves
        .toEqual({ state: 'failed', message })
      expect(check).not.toHaveBeenCalled()
    }
    finally {
      restoreFonts()
    }
  })

  it.each([
    [true, { state: 'ready' }],
    [false, { state: 'failed', message: 'VIEWER_SYSTEM_FONT_UNAVAILABLE' }],
  ])('uses fonts.check for a system font with check result %s', async (available, expected) => {
    const family = 'System" \\ Sans'
    const shorthand = '16px "System\\" \\\\ Sans"'
    const load = vi.fn(async () => [])
    const check = vi.fn(() => available)
    const restoreFonts = installDocumentFonts(document, {
      load,
      ready: Promise.resolve({} as FontFaceSet),
      check,
    })
    const manager = new FontManager({
      listFonts: async () => [{
        family,
        displayName: family,
        weights: ['400'],
        styles: ['normal'],
        source: 'system',
      }],
      loadFont: async () => ({ type: 'system' }),
    })

    try {
      await expect(createFontPreparationAdapter(manager, document)(family, new AbortController().signal))
        .resolves
        .toEqual(expected)
      expect(load).toHaveBeenCalledWith(shorthand)
      expect(check).toHaveBeenCalledWith(shorthand)
      expect(load.mock.invocationCallOrder[0]).toBeLessThan(check.mock.invocationCallOrder[0]!)
    }
    finally {
      restoreFonts()
    }
  })

  it('reports failed when the Font Loading API is unavailable', async () => {
    const restoreFonts = installDocumentFonts(document, undefined)
    const manager = new FontManager({
      listFonts: async () => [{
        family: 'Arial',
        displayName: 'Arial',
        weights: ['400'],
        styles: ['normal'],
        source: 'system',
      }],
      loadFont: async () => ({ type: 'system' }),
    })

    try {
      await expect(createFontPreparationAdapter(manager, document)('Arial', new AbortController().signal))
        .resolves
        .toEqual({ state: 'failed', message: 'VIEWER_FONT_LOADING_API_UNAVAILABLE' })
    }
    finally {
      restoreFonts()
    }
  })

  it('does not publish readiness when aborted during fonts.load', async () => {
    let resolveLoad: ((faces: FontFace[]) => void) | undefined
    const load = vi.fn(() => new Promise<FontFace[]>((resolve) => {
      resolveLoad = resolve
    }))
    const restoreFonts = installDocumentFonts(document, {
      load,
      ready: Promise.resolve({} as FontFaceSet),
    })
    const controller = new AbortController()
    const reason = new DOMException('stale font task', 'AbortError')
    const manager = new FontManager({
      listFonts: async () => [],
      loadFont: async () => '/fonts/brand.woff2',
    })
    const coordinator = createResourceReadinessCoordinator({
      prepareFont: createFontPreparationAdapter(manager, document),
      prepareAsset: async () => ({ state: 'ready' as const }),
    })

    try {
      const pending = coordinator.prepare([{ kind: 'font', value: 'Brand' }], controller.signal)
      await vi.waitFor(() => expect(load).toHaveBeenCalledOnce())
      controller.abort(reason)
      resolveLoad?.([{} as FontFace])

      await expect(pending).rejects.toBe(reason)
      expect(coordinator.resourceRevision).toBe(0)
    }
    finally {
      restoreFonts()
    }
  })

  it('uses a ShadowRoot owner document and a safely escaped font shorthand', async () => {
    const load = vi.fn(async () => [{} as FontFace])
    const restoreFonts = installDocumentFonts(document, {
      load,
      ready: Promise.resolve({} as FontFaceSet),
    })
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    const family = 'Brand" \\ Sans'
    const manager = new FontManager({
      listFonts: async () => [],
      loadFont: async () => '/fonts/brand.woff2',
    })

    try {
      await expect(createFontPreparationAdapter(manager, shadow)(family, new AbortController().signal))
        .resolves
        .toEqual({ state: 'ready' })
      expect(load).toHaveBeenCalledWith('16px "Brand\\" \\\\ Sans"')
    }
    finally {
      restoreFonts()
    }
  })
})

function installDocumentFonts(
  target: Document,
  fonts: Pick<FontFaceSet, 'load' | 'ready'> & Partial<Pick<FontFaceSet, 'check'>> | undefined,
): () => void {
  const previous = Object.getOwnPropertyDescriptor(target, 'fonts')
  Object.defineProperty(target, 'fonts', { configurable: true, value: fonts })
  return () => {
    if (previous)
      Object.defineProperty(target, 'fonts', previous)
    else
      Reflect.deleteProperty(target, 'fonts')
  }
}
