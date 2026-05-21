import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderPagesToPdfBlob, resolveCanvasScale } from './pdf'

interface Html2CanvasMockOptions {
  onclone?: (document: Document) => void
}

const pdfMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  html2canvas: vi.fn(async (_page?: unknown, _options?: Html2CanvasMockOptions) => ({
    width: 100,
    height: 100,
    toDataURL: () => 'data:image/png;base64,AA==',
  })),
  addPage: vi.fn(),
  addImage: vi.fn(),
  output: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
}))

vi.mock('html2canvas', () => ({
  default: pdfMocks.html2canvas,
}))

vi.mock('jspdf', () => {
  class JsPDF {
    addPage = pdfMocks.addPage
    addImage = pdfMocks.addImage
    output = pdfMocks.output

    constructor(options: unknown) {
      pdfMocks.constructor(options)
    }
  }

  return {
    jsPDF: JsPDF,
  }
})

beforeEach(() => {
  pdfMocks.constructor.mockClear()
  pdfMocks.html2canvas.mockClear()
  pdfMocks.addPage.mockClear()
  pdfMocks.addImage.mockClear()
  pdfMocks.output.mockClear()
  pdfMocks.html2canvas.mockImplementation(async (_page, options) => {
    options?.onclone?.(document)
    return {
      width: 100,
      height: 100,
      toDataURL: () => 'data:image/png;base64,AA==',
    }
  })
})

afterEach(() => {
  document.body.replaceChildren()
})

describe('resolveCanvasScale', () => {
  it('uses the requested dpi scale while the page stays under the pixel cap', () => {
    const page = document.createElement('div')
    page.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    })

    expect(resolveCanvasScale(page, 300)).toBeCloseTo(300 / 96)
  })

  it('caps huge pages while preserving the minimum scale', () => {
    const page = document.createElement('div')
    page.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 10000,
      bottom: 10000,
      width: 10000,
      height: 10000,
      toJSON: () => ({}),
    })

    expect(resolveCanvasScale(page, 300)).toBe(2)
  })
})

describe('renderPagesToPdfBlob asset preflight', () => {
  it('uses per-page sizes and passes canvas data to jsPDF without base64 conversion', async () => {
    const first = document.createElement('div')
    const second = document.createElement('div')

    const result = await renderPagesToPdfBlob({
      pages: [first, second],
      pageSizes: [
        { widthMm: 80, heightMm: 60 },
        { widthMm: 100, heightMm: 40 },
      ],
    })

    expect(result).toBeInstanceOf(Blob)
    expect(pdfMocks.constructor).toHaveBeenCalledWith(expect.objectContaining({
      compress: true,
      format: [80, 60],
      orientation: 'landscape',
    }))
    expect(pdfMocks.addPage).toHaveBeenCalledWith([100, 40], 'landscape')
    expect(pdfMocks.addImage).toHaveBeenLastCalledWith(
      expect.any(Object),
      'PNG',
      0,
      0,
      100,
      40,
      undefined,
      'FAST',
    )
    expect(typeof pdfMocks.addImage.mock.calls[0]?.[0]).not.toBe('string')
  })

  it('uses foreignObject rendering by default for browser-faithful PDF capture', async () => {
    const page = document.createElement('div')
    page.textContent = 'hello'

    await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
    })

    expect(pdfMocks.html2canvas).toHaveBeenCalledWith(page, expect.objectContaining({
      foreignObjectRendering: true,
    }))
  })

  it('does not rewrite element boxes on the default foreignObject path', async () => {
    const page = document.createElement('div')
    const element = document.createElement('div')
    element.className = 'ei-viewer-element'
    element.style.position = 'absolute'
    element.style.left = '10px'
    element.style.top = '20px'
    element.style.width = '30px'
    element.style.height = '10px'
    element.style.transform = 'rotate(90deg)'
    page.appendChild(element)
    document.body.appendChild(page)

    await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
    })

    expect(element.querySelector('[data-easyink-pdf-capture-inner]')).toBeNull()
    expect(element.style.transform).toBe('rotate(90deg)')
    expect(element.style.left).toBe('10px')
    expect(element.style.top).toBe('20px')
  })

  it('does not downgrade to canvas unless fallback is explicitly enabled', async () => {
    const page = document.createElement('div')
    const element = document.createElement('div')
    element.className = 'ei-viewer-element'
    page.appendChild(element)
    const diagnostics: string[] = []
    const blankCanvas = {
      width: 100,
      height: 100,
      getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
      }),
    }
    pdfMocks.html2canvas.mockResolvedValueOnce(blankCanvas as never)

    await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      onDiagnostic(diagnostic) {
        diagnostics.push(diagnostic.code)
      },
    })

    expect(pdfMocks.html2canvas).toHaveBeenCalledTimes(1)
    expect(diagnostics).toContain('PDF_FOREIGN_OBJECT_RENDERED_BLANK')
    expect(diagnostics).toContain('PDF_RENDERED_PAGE_BLANK')
    expect(diagnostics).not.toContain('PDF_FOREIGN_OBJECT_BLANK_RETRY')
  })

  it('retries without foreignObject rendering when explicit canvas fallback is enabled', async () => {
    const page = document.createElement('div')
    const element = document.createElement('div')
    element.className = 'ei-viewer-element'
    page.appendChild(element)
    const diagnostics: string[] = []
    const blankCanvas = {
      width: 100,
      height: 100,
      getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
      }),
    }
    const contentCanvas = {
      width: 100,
      height: 100,
      getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
      }),
    }
    pdfMocks.html2canvas
      .mockResolvedValueOnce(blankCanvas as never)
      .mockResolvedValueOnce(contentCanvas as never)

    await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      foreignObjectRendering: true,
      enableCanvasFallback: true,
      onDiagnostic(diagnostic) {
        diagnostics.push(diagnostic.code)
      },
    })

    const calls = pdfMocks.html2canvas.mock.calls as unknown as Array<[HTMLElement, { foreignObjectRendering?: boolean }]>
    expect(pdfMocks.html2canvas).toHaveBeenCalledTimes(2)
    expect(calls[0]?.[1]).toMatchObject({ foreignObjectRendering: true })
    expect(calls[1]?.[1]).toMatchObject({ foreignObjectRendering: false })
    expect(diagnostics).toContain('PDF_FOREIGN_OBJECT_BLANK_RETRY')
  })

  it('keeps the foreignObject result when sparse content is present outside fixed sample points', async () => {
    const page = document.createElement('div')
    const element = document.createElement('div')
    element.className = 'ei-viewer-element'
    page.appendChild(element)
    const probeData = new Uint8ClampedArray(160 * 160 * 4)
    for (let index = 0; index < probeData.length; index += 4) {
      probeData[index] = 255
      probeData[index + 1] = 255
      probeData[index + 2] = 255
      probeData[index + 3] = 255
    }
    probeData[probeData.length - 4] = 0
    probeData[probeData.length - 3] = 0
    probeData[probeData.length - 2] = 0
    probeData[probeData.length - 1] = 255
    const probeContext = {
      drawImage: vi.fn(),
      getImageData: () => ({ data: probeData }),
    }
    const probeCanvas = {
      width: 0,
      height: 0,
      getContext: () => probeContext,
    }
    const sparseCanvas = {
      width: 100,
      height: 100,
      ownerDocument: {
        createElement: () => probeCanvas,
      },
      getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
      }),
    }
    pdfMocks.html2canvas.mockResolvedValueOnce(sparseCanvas as never)

    await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
    })

    expect(pdfMocks.html2canvas).toHaveBeenCalledTimes(1)
    expect(probeContext.drawImage).toHaveBeenCalledWith(sparseCanvas, 0, 0, 100, 100)
  })

  it('continues and warns when an image never settles', async () => {
    const page = document.createElement('div')
    const image = document.createElement('img')
    image.src = 'https://example.test/hung.png'
    Object.defineProperty(image, 'complete', { configurable: true, value: false })
    page.appendChild(image)
    const diagnostics: string[] = []

    const result = await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      assetLoadTimeoutMs: 1,
      onDiagnostic(diagnostic) {
        diagnostics.push(diagnostic.code)
      },
    })

    expect(result).toBeInstanceOf(Blob)
    expect(diagnostics).toContain('PDF_IMAGE_LOAD_TIMEOUT')
    expect(pdfMocks.html2canvas).toHaveBeenCalledTimes(1)
  })

  it('waits for CSS background images and continues on timeout', async () => {
    const page = document.createElement('div')
    page.style.backgroundImage = 'url("https://example.test/background.png")'
    const diagnostics: string[] = []

    const result = await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      assetLoadTimeoutMs: 1,
      onDiagnostic(diagnostic) {
        diagnostics.push(diagnostic.code)
      },
    })

    expect(result).toBeInstanceOf(Blob)
    expect(diagnostics).toContain('PDF_BACKGROUND_IMAGE_LOAD_TIMEOUT')
    expect(pdfMocks.html2canvas).toHaveBeenCalledTimes(1)
  })

  it('normalizes rotated elements in the cloned capture document before canvas rendering', async () => {
    const page = document.createElement('div')
    const element = document.createElement('div')
    const child = document.createElement('svg')
    element.className = 'ei-viewer-element'
    element.style.position = 'absolute'
    element.style.left = '10px'
    element.style.top = '20px'
    element.style.width = '30px'
    element.style.height = '10px'
    element.style.overflow = 'hidden'
    element.style.transform = 'rotate(90deg)'
    element.appendChild(child)
    page.appendChild(element)
    document.body.appendChild(page)

    await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      foreignObjectRendering: false,
    })

    const captureInner = element.querySelector<HTMLElement>('[data-easyink-pdf-capture-inner]')
    expect(captureInner).not.toBeNull()
    expect(element.style.transform).toBe('none')
    expect(element.style.left).toBe('20px')
    expect(element.style.top).toBe('10px')
    expect(element.style.width).toBe('10px')
    expect(element.style.height).toBe('30px')
    expect(element.style.overflow).toBe('hidden')
    expect(captureInner!.style.left).toBe('-10px')
    expect(captureInner!.style.top).toBe('10px')
    expect(captureInner!.style.transform).toBe('rotate(90deg)')
    expect(captureInner!.firstChild).toBe(child)
  })

  it('adds bounded text bleed in the cloned capture document', async () => {
    const page = document.createElement('div')
    const element = document.createElement('div')
    const container = document.createElement('div')
    const text = document.createElement('span')
    element.className = 'ei-viewer-element'
    element.setAttribute('data-element-type', 'text')
    element.style.position = 'absolute'
    element.style.left = '10px'
    element.style.top = '20px'
    element.style.width = '30px'
    element.style.height = '10px'
    element.style.overflow = 'hidden'
    container.style.overflow = 'hidden'
    text.style.overflow = 'hidden'
    text.textContent = 'bottom aligned text'
    container.appendChild(text)
    element.appendChild(container)
    page.appendChild(element)
    document.body.appendChild(page)

    await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      foreignObjectRendering: false,
    })

    const captureInner = element.querySelector<HTMLElement>('[data-easyink-pdf-capture-inner]')
    expect(captureInner).not.toBeNull()
    expect(element.style.left).toBe('8px')
    expect(element.style.top).toBe('18px')
    expect(element.style.width).toBe('34px')
    expect(element.style.height).toBe('14px')
    expect(element.style.overflow).toBe('hidden')
    expect(container.style.overflow).toBe('visible')
    expect(text.style.overflow).toBe('visible')
    expect(captureInner!.style.left).toBe('2px')
    expect(captureInner!.style.top).toBe('2px')
  })
})
