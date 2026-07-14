import type { MaterialTextMeasureInput } from '@easyink/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserTextMeasureService as PublicBrowserTextMeasureService } from './index'
import { BrowserTextMeasureService } from './measure-text'

function createInput(overrides: Partial<MaterialTextMeasureInput> = {}): MaterialTextMeasureInput {
  return {
    text: 'Invoice',
    availableWidth: 25.4,
    unit: 'mm',
    style: {
      fontFamily: 'Invoice Sans',
      fontSize: 4,
      fontWeight: 600,
      fontStyle: 'italic',
      lineHeight: 1.5,
      letterSpacing: 1,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
    },
    ...overrides,
  }
}

describe('browserTextMeasureService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.querySelectorAll('[data-easyink-text-measure]').forEach(element => element.remove())
  })

  it('is exported from the browser-dom public entrypoint', () => {
    expect(PublicBrowserTextMeasureService).toBe(BrowserTextMeasureService)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid maxEntries %s',
    (maxEntries) => {
      expect(() => new BrowserTextMeasureService(document, { maxEntries }))
        .toThrowError('BROWSER_TEXT_MEASURE_CACHE_SIZE_INVALID')
    },
  )

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid resource revision %s before mounting',
    async (resourceRevision) => {
      const service = new BrowserTextMeasureService(document, { maxEntries: 2 })

      await expect(service.measure(createInput(), resourceRevision, new AbortController().signal))
        .rejects
        .toThrowError('BROWSER_TEXT_MEASURE_RESOURCE_REVISION_INVALID')
      expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
    },
  )

  it.each([
    ['text', { text: 1 }],
    ['availableWidth finite', { availableWidth: Number.NaN }],
    ['availableWidth non-negative', { availableWidth: -1 }],
    ['unit', { unit: 'cm' }],
    ['style object', { style: null }],
    ['fontFamily', { style: { ...createInput().style, fontFamily: '  ' } }],
    ['fontSize finite', { style: { ...createInput().style, fontSize: Number.POSITIVE_INFINITY } }],
    ['fontSize non-negative', { style: { ...createInput().style, fontSize: -1 } }],
    ['fontWeight number finite', { style: { ...createInput().style, fontWeight: Number.NaN } }],
    ['fontWeight string nonempty', { style: { ...createInput().style, fontWeight: '' } }],
    ['fontStyle', { style: { ...createInput().style, fontStyle: 'bold' } }],
    ['lineHeight positive', { style: { ...createInput().style, lineHeight: 0 } }],
    ['letterSpacing finite', { style: { ...createInput().style, letterSpacing: Number.NEGATIVE_INFINITY } }],
    ['whiteSpace', { style: { ...createInput().style, whiteSpace: 'nowrap' } }],
    ['overflowWrap', { style: { ...createInput().style, overflowWrap: 'break-word' } }],
  ])('rejects invalid %s input without mounting', async (_name, override) => {
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })

    await expect(service.measure(createInput(override as never), 0, new AbortController().signal))
      .rejects
      .toThrowError('BROWSER_TEXT_MEASURE_INPUT_INVALID')
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
  })

  it('measures text in document units and invalidates its cache by resource revision', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 96, height: 24 } as DOMRect)
    const service = new BrowserTextMeasureService(document, { maxEntries: 8 })
    const input = createInput()

    const first = await service.measure(input, 1, new AbortController().signal)
    const cached = await service.measure(input, 1, new AbortController().signal)
    const revised = await service.measure(input, 2, new AbortController().signal)

    expect(first).toEqual({ width: 25.4, height: 6.35 })
    expect(Object.isFrozen(first)).toBe(true)
    expect(cached).toBe(first)
    expect(revised).not.toBe(first)
    expect(rect).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
  })

  it('uses one cache entry for omitted and explicit CSS defaults', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 10, height: 5 } as DOMRect)
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })
    const style = {
      fontFamily: 'Invoice Sans',
      fontSize: 4,
      lineHeight: 1.5,
      whiteSpace: 'pre' as const,
      overflowWrap: 'normal' as const,
    }

    const omitted = await service.measure(createInput({ style }), 0, new AbortController().signal)
    const explicit = await service.measure(createInput({
      style: { ...style, fontWeight: 'normal', fontStyle: 'normal', letterSpacing: 0 },
    }), 0, new AbortController().signal)

    expect(explicit).toBe(omitted)
    expect(rect).toHaveBeenCalledOnce()
  })

  it('mounts an offscreen plain-text probe with the declared wrapping CSS', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        expect(this.textContent).toBe('<strong>Invoice</strong>')
        expect(this.querySelector('strong')).toBeNull()
        expect(this.dataset.easyinkTextMeasure).toBe('')
        expect(this.style.position).toBe('fixed')
        expect(this.style.left).toBe('-100000px')
        expect(this.style.top).toBe('0px')
        expect(this.style.visibility).toBe('hidden')
        expect(this.style.pointerEvents).toBe('none')
        expect(this.style.contain).toBe('layout style paint')
        expect(this.style.boxSizing).toBe('border-box')
        expect(Number.parseFloat(this.style.width)).toBeCloseTo(96)
        expect(this.style.fontFamily.replaceAll('"', '')).toBe('Invoice Sans')
        expect(Number.parseFloat(this.style.fontSize)).toBeCloseTo(4 * 96 / 25.4)
        expect(this.style.fontWeight).toBe('600')
        expect(this.style.fontStyle).toBe('italic')
        expect(this.style.lineHeight).toBe('1.5')
        expect(Number.parseFloat(this.style.letterSpacing)).toBeCloseTo(96 / 25.4)
        expect(this.style.whiteSpace).toBe('pre-wrap')
        expect(this.style.overflowWrap).toBe('anywhere')
        return { width: 20, height: 10 } as DOMRect
      })
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })

    await service.measure(createInput({ text: '<strong>Invoice</strong>' }), 0, new AbortController().signal)

    expect(rect).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
  })

  it('caches a frozen zero result for empty text without mounting', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    const service = new BrowserTextMeasureService(document, { maxEntries: 1 })
    const input = createInput({ text: '' })

    const first = await service.measure(input, 0, new AbortController().signal)
    const second = await service.measure(input, 0, new AbortController().signal)

    expect(first).toEqual({ width: 0, height: 0 })
    expect(Object.isFrozen(first)).toBe(true)
    expect(second).toBe(first)
    expect(rect).not.toHaveBeenCalled()
  })

  it('evicts the least recently used entry at its max bound', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 10, height: 5 } as DOMRect)
    const service = new BrowserTextMeasureService(document, { maxEntries: 1 })

    await service.measure(createInput({ text: 'A' }), 0, new AbortController().signal)
    await service.measure(createInput({ text: 'B' }), 0, new AbortController().signal)
    await service.measure(createInput({ text: 'A' }), 0, new AbortController().signal)

    expect(rect).toHaveBeenCalledTimes(3)
  })

  it('promotes cache hits and clear removes every entry', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 10, height: 5 } as DOMRect)
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })

    await service.measure(createInput({ text: 'A' }), 0, new AbortController().signal)
    await service.measure(createInput({ text: 'B' }), 0, new AbortController().signal)
    await service.measure(createInput({ text: 'A' }), 0, new AbortController().signal)
    await service.measure(createInput({ text: 'C' }), 0, new AbortController().signal)
    await service.measure(createInput({ text: 'B' }), 0, new AbortController().signal)
    expect(rect).toHaveBeenCalledTimes(4)

    service.clear()
    await service.measure(createInput({ text: 'A' }), 0, new AbortController().signal)
    expect(rect).toHaveBeenCalledTimes(5)
  })

  it('rejects an aborted measurement without mounting a probe', async () => {
    const controller = new AbortController()
    const reason = new DOMException('cancelled', 'AbortError')
    controller.abort(reason)
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })

    await expect(service.measure(createInput(), 1, controller.signal)).rejects.toBe(reason)
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
  })

  it('removes the probe and does not cache when aborted during measurement', async () => {
    const controller = new AbortController()
    const reason = new DOMException('stale measurement', 'AbortError')
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementationOnce(() => {
        controller.abort(reason)
        return { width: 10, height: 5 } as DOMRect
      })
      .mockReturnValue({ width: 10, height: 5 } as DOMRect)
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })
    const input = createInput()

    await expect(service.measure(input, 0, controller.signal)).rejects.toBe(reason)
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
    await expect(service.measure(input, 0, new AbortController().signal)).resolves.toBeDefined()
    expect(rect).toHaveBeenCalledTimes(2)
  })

  it('removes the probe and does not cache when DOM measurement throws', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementationOnce(() => {
        throw new Error('layout unavailable')
      })
      .mockReturnValue({ width: 10, height: 5 } as DOMRect)
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })
    const input = createInput()

    await expect(service.measure(input, 0, new AbortController().signal)).rejects.toThrow('layout unavailable')
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
    await expect(service.measure(input, 0, new AbortController().signal)).resolves.toBeDefined()
    expect(rect).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['availableWidth', { availableWidth: Number.MAX_VALUE }],
    ['fontSize', { style: { ...createInput().style, fontSize: Number.MAX_VALUE } }],
    ['letterSpacing', { style: { ...createInput().style, letterSpacing: Number.MAX_VALUE } }],
  ])('rejects %s conversion overflow without measuring or caching', async (_field, override) => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 10, height: 5 } as DOMRect)
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })
    const input = createInput({ unit: 'inch', ...override } as never)

    await expect(service.measure(input, 0, new AbortController().signal))
      .rejects
      .toThrowError('BROWSER_TEXT_MEASURE_CONVERSION_INVALID')
    await expect(service.measure(input, 0, new AbortController().signal))
      .rejects
      .toThrowError('BROWSER_TEXT_MEASURE_CONVERSION_INVALID')
    expect(rect).not.toHaveBeenCalled()
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
  })

  it.each([
    { width: Number.NaN, height: 5 },
    { width: 10, height: Number.POSITIVE_INFINITY },
    { width: -1, height: 5 },
    { width: 10, height: -1 },
  ])('rejects and does not cache an invalid DOM rect %#', async (invalidRect) => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValueOnce(invalidRect as DOMRect)
      .mockReturnValue({ width: 10, height: 5 } as DOMRect)
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })
    const input = createInput()

    await expect(service.measure(input, 0, new AbortController().signal))
      .rejects
      .toThrowError('BROWSER_TEXT_MEASURE_RESULT_INVALID')
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
    await expect(service.measure(input, 0, new AbortController().signal)).resolves.toBeDefined()
    expect(rect).toHaveBeenCalledTimes(2)
  })

  it('does not freeze caller-owned input or style objects', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 10, height: 5 } as DOMRect)
    const style = { ...createInput().style }
    const input = { ...createInput(), style }
    const service = new BrowserTextMeasureService(document, { maxEntries: 2 })

    await service.measure(input, 0, new AbortController().signal)

    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(style)).toBe(false)
  })
})
