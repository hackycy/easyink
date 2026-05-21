import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderPagesToPdfBlob, resolveCanvasScale } from './pdf'

const pdfMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  html2canvas: vi.fn(async () => ({
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

  it('uses the canvas renderer by default to avoid blank foreignObject captures', async () => {
    const page = document.createElement('div')
    page.textContent = 'hello'

    await renderPagesToPdfBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
    })

    expect(pdfMocks.html2canvas).toHaveBeenCalledWith(page, expect.objectContaining({
      foreignObjectRendering: false,
    }))
  })

  it('retries without foreignObject rendering when a captured page is blank', async () => {
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
})
