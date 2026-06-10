import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDomImageExportPlugin, renderPagesToImageBlob, renderPagesToImageBlobs } from './image'

interface Html2CanvasMockOptions {
  foreignObjectRendering?: boolean
  backgroundColor?: string | null
  onclone?: (document: Document) => void
}

const imageMocks = vi.hoisted(() => ({
  html2canvas: vi.fn(),
}))

vi.mock('html2canvas', () => ({
  default: imageMocks.html2canvas,
}))

beforeEach(() => {
  imageMocks.html2canvas.mockReset()
  imageMocks.html2canvas.mockImplementation(async (_page, options?: Html2CanvasMockOptions) => {
    options?.onclone?.(document)
    return createMockCanvas()
  })
})

afterEach(() => {
  document.body.replaceChildren()
})

describe('createDomImageExportPlugin', () => {
  it('creates a png export plugin by default', async () => {
    const plugin = createDomImageExportPlugin()
    const page = document.createElement('div')
    const progress = vi.fn()

    const result = await plugin.export({
      input: { pages: [page], widthMm: 80, heightMm: 60 },
      entry: 'api',
      format: 'png',
      reportProgress: progress,
      emitDiagnostic: vi.fn(),
    })

    expect(plugin.id).toBe('dom-image-export')
    expect(plugin.format).toBe('png')
    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('image/png')
    expect(progress).toHaveBeenCalledWith({ current: 1, total: 1, message: 'render-page:1' })
  })

  it('derives jpeg output from the plugin format', async () => {
    const plugin = createDomImageExportPlugin({ format: 'jpeg' })
    const page = document.createElement('div')

    const result = await plugin.export({
      input: { pages: [page], widthMm: 80, heightMm: 60 },
      entry: 'api',
      format: 'jpeg',
      reportProgress: vi.fn(),
      emitDiagnostic: vi.fn(),
    })

    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('image/jpeg')
  })
})

describe('renderPagesToImageBlob', () => {
  it('renders the selected page to an image blob', async () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    const diagnostics = vi.fn()

    const result = await renderPagesToImageBlob({
      pages: [first, second],
      pageSizes: [
        { widthMm: 80, heightMm: 60 },
        { widthMm: 100, heightMm: 40 },
      ],
      pageIndex: 1,
      type: 'image/webp',
      quality: 0.75,
      onDiagnostic: diagnostics,
    })

    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('image/webp')
    expect(imageMocks.html2canvas).toHaveBeenCalledTimes(1)
    expect(imageMocks.html2canvas).toHaveBeenCalledWith(second, expect.objectContaining({
      foreignObjectRendering: true,
    }))
    expect(diagnostics).not.toHaveBeenCalled()
  })

  it('passes transparent background through capture options', async () => {
    const page = document.createElement('div')

    await renderPagesToImageBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      backgroundColor: null,
    })

    expect(imageMocks.html2canvas).toHaveBeenCalledWith(page, expect.objectContaining({
      backgroundColor: null,
    }))
  })

  it('retries without foreignObject rendering when explicit canvas fallback is enabled', async () => {
    const page = document.createElement('div')
    const element = document.createElement('div')
    element.className = 'ei-viewer-element'
    page.appendChild(element)
    const diagnostics: string[] = []
    imageMocks.html2canvas
      .mockResolvedValueOnce(createBlankCanvas() as never)
      .mockResolvedValueOnce(createMockCanvas() as never)

    await renderPagesToImageBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      enableCanvasFallback: true,
      onDiagnostic(diagnostic) {
        diagnostics.push(diagnostic.code)
      },
    })

    const calls = imageMocks.html2canvas.mock.calls as unknown as Array<[HTMLElement, Html2CanvasMockOptions]>
    expect(imageMocks.html2canvas).toHaveBeenCalledTimes(2)
    expect(calls[0]?.[1]).toMatchObject({ foreignObjectRendering: true })
    expect(calls[1]?.[1]).toMatchObject({ foreignObjectRendering: false })
    expect(diagnostics).toContain('IMAGE_FOREIGN_OBJECT_BLANK_RETRY')
  })

  it('continues and warns when an image never settles', async () => {
    const page = document.createElement('div')
    const image = document.createElement('img')
    image.src = 'https://example.test/hung.png'
    Object.defineProperty(image, 'complete', { configurable: true, value: false })
    page.appendChild(image)
    const diagnostics: string[] = []

    const result = await renderPagesToImageBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      assetLoadTimeoutMs: 1,
      onDiagnostic(diagnostic) {
        diagnostics.push(diagnostic.code)
      },
    })

    expect(result).toBeInstanceOf(Blob)
    expect(diagnostics).toContain('IMAGE_IMAGE_LOAD_TIMEOUT')
  })

  it('emits an encode diagnostic when the canvas cannot produce a blob', async () => {
    const page = document.createElement('div')
    const diagnostics: string[] = []
    imageMocks.html2canvas.mockResolvedValueOnce(createMockCanvas({ blob: null }) as never)

    await expect(renderPagesToImageBlob({
      pages: [page],
      widthMm: 80,
      heightMm: 60,
      onDiagnostic(diagnostic) {
        diagnostics.push(diagnostic.code)
      },
    })).rejects.toThrow('Failed to encode image page 1 as image/png.')

    expect(diagnostics).toContain('IMAGE_CANVAS_ENCODE_FAILED')
  })
})

describe('renderPagesToImageBlobs', () => {
  it('renders every page as an image blob', async () => {
    const first = document.createElement('div')
    const second = document.createElement('div')

    const result = await renderPagesToImageBlobs({
      pages: [first, second],
      widthMm: 80,
      heightMm: 60,
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toBeInstanceOf(Blob)
    expect(result[1]).toBeInstanceOf(Blob)
    expect(imageMocks.html2canvas).toHaveBeenCalledTimes(2)
  })
})

function createMockCanvas(options: { blob?: Blob | null } = {}): HTMLCanvasElement {
  const blob = options.blob === undefined
    ? new Blob(['image'], { type: 'image/png' })
    : options.blob
  return {
    width: 100,
    height: 100,
    toBlob: vi.fn((callback: BlobCallback, type?: string) => {
      callback(blob ? new Blob(['image'], { type }) : null)
    }),
  } as unknown as HTMLCanvasElement
}

function createBlankCanvas(): HTMLCanvasElement {
  return {
    width: 100,
    height: 100,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    }),
    toBlob: vi.fn((callback: BlobCallback, type?: string) => {
      callback(new Blob(['image'], { type }))
    }),
  } as unknown as HTMLCanvasElement
}
