import type { ViewerPrintContext } from '@easyink/viewer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEasyInkPrinterDriver } from './driver'

const { renderPagesToPdfBlob } = vi.hoisted(() => ({
  renderPagesToPdfBlob: vi.fn(async () => new Blob(['pdf'])),
}))

vi.mock('@easyink/export-plugin-dom-pdf', () => ({
  renderPagesToPdfBlob,
}))

function createContext(): ViewerPrintContext {
  const container = document.createElement('div')
  const page = document.createElement('section')
  page.className = 'ei-viewer-page'
  container.appendChild(page)
  const secondPage = document.createElement('section')
  secondPage.className = 'ei-viewer-page'
  container.appendChild(secondPage)

  return {
    entry: 'preview',
    container,
    renderedPages: [
      { index: 0, width: 80, height: 60, unit: 'mm' },
      { index: 1, width: 100, height: 40, unit: 'mm' },
    ],
    printPolicy: {
      orientation: 'portrait',
      offset: { horizontal: 0, vertical: 0, unit: 'mm' },
      pageMode: 'fixed',
      pageSizeMode: 'fixed',
      pageBreakBehavior: { after: 'page', inside: 'avoid' },
      sheetSize: { width: 80, height: 60, unit: 'mm', source: 'schema' },
    },
    schema: {
      version: '1.0.0',
      unit: 'mm',
      page: {
        mode: 'fixed',
        width: 80,
        height: 60,
      },
      guides: { x: [], y: [] },
      elements: [],
    },
    data: {},
  }
}

beforeEach(() => {
  renderPagesToPdfBlob.mockClear()
})

describe('easy ink driver', () => {
  it('uses the shared forcePageSize option and allows request customization', async () => {
    const client = {
      printPdf: vi.fn(async () => 'job-12345678'),
      waitForJob: vi.fn(async () => ({ jobId: 'job-12345678', status: 'completed' })),
    }
    const driver = createEasyInkPrinterDriver({
      client: client as never,
      printerName: () => 'Printer A',
      copies: () => 2,
      forcePageSize: () => true,
      resolveRequestOptions: ({ widthMm }) => ({ dpi: widthMm > 0 ? 300 : 200 }),
    })

    await driver.print(createContext())

    expect(renderPagesToPdfBlob).toHaveBeenCalledWith(expect.objectContaining({
      pages: expect.any(Array),
      pageSizes: [
        { widthMm: 80, heightMm: 60 },
        { widthMm: 100, heightMm: 40 },
      ],
    }))
    expect(client.printPdf).toHaveBeenCalledTimes(1)
    expect(client.printPdf).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({
      printerName: 'Printer A',
      copies: 2,
      forcePageSize: true,
      paperSize: { width: 80, height: 60, unit: 'mm' },
      dpi: 300,
    }))
    expect(client.waitForJob).toHaveBeenCalledWith('job-12345678')
  })

  it('can submit schema and data to Printer-side Render without generating a PDF in the browser', async () => {
    const client = {
      printEasyInk: vi.fn(async () => 'job-render-1234'),
      waitForJob: vi.fn(async () => ({ jobId: 'job-render-1234', status: 'completed' })),
    }
    const context = createContext()
    const driver = createEasyInkPrinterDriver({
      client: client as never,
      submitMode: 'renderSource',
      printerName: () => 'Printer A',
      forcePageSize: () => true,
      resolveRequestOptions: () => ({
        renderOptions: {
          pdf: { printBackground: true },
        },
      }),
    })

    await driver.print(context)

    expect(renderPagesToPdfBlob).not.toHaveBeenCalled()
    expect(client.printEasyInk).toHaveBeenCalledWith({
      schema: context.schema,
      data: {},
    }, expect.objectContaining({
      printerName: 'Printer A',
      forcePageSize: true,
      paperSize: { width: 80, height: 60, unit: 'mm' },
      renderOptions: {
        pdf: { printBackground: true },
      },
    }))
    expect(client.waitForJob).toHaveBeenCalledWith('job-render-1234')
  })

  it('can serialize rendered Viewer pages and submit them as HTML renderSource', async () => {
    const client = {
      printHtml: vi.fn(async (_html: string, _options?: unknown) => 'job-html-1234'),
      waitForJob: vi.fn(async () => ({ jobId: 'job-html-1234', status: 'completed' })),
    }
    const context = createContext()
    const firstPage = context.container!.querySelector<HTMLElement>('.ei-viewer-page')!
    firstPage.innerHTML = '<span>Hello HTML</span>'
    firstPage.style.transform = 'scale(2)'

    const driver = createEasyInkPrinterDriver({
      client: client as never,
      submitMode: 'html',
      printerName: () => 'Printer A',
      forcePageSize: () => true,
      resolveRequestOptions: () => ({
        renderOptions: {
          wait: { selector: '.easyink-ready' },
        },
      }),
    })

    await driver.print(context)

    expect(renderPagesToPdfBlob).not.toHaveBeenCalled()
    expect(client.printHtml).toHaveBeenCalledTimes(1)
    expect(client.printHtml.mock.calls[0]![0]).toContain('class="easyink-ready"')
    expect(client.printHtml.mock.calls[0]![0]).toContain('Hello HTML')
    expect(client.printHtml.mock.calls[0]![0]).toContain('transform: none')
    expect(client.printHtml).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      printerName: 'Printer A',
      forcePageSize: true,
      paperSize: { width: 80, height: 60, unit: 'mm' },
      renderOptions: {
        wait: { selector: '.easyink-ready' },
      },
    }))
    expect(client.waitForJob).toHaveBeenCalledWith('job-html-1234')
  })
})
