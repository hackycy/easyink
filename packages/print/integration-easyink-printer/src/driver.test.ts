import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEasyInkPrinterDriver } from './driver'

const { renderPagesToPdfBlob } = vi.hoisted(() => ({
  renderPagesToPdfBlob: vi.fn(async () => new Blob(['pdf'])),
}))

vi.mock('@easyink/export-plugin-dom-pdf', () => ({
  renderPagesToPdfBlob,
}))

function createContext() {
  const container = document.createElement('div')
  const page = document.createElement('section')
  page.className = 'ei-viewer-page'
  container.appendChild(page)

  return {
    container,
    renderedPages: [{ index: 0, width: 80, height: 60, unit: 'mm' }],
    printPolicy: {
      orientation: 'portrait',
      offset: { horizontal: 0, vertical: 0, unit: 'mm' },
      pageMode: 'fixed',
      pageSizeMode: 'fixed',
      pageBreakBehavior: { after: 'page', inside: 'avoid' },
      sheetSize: { width: 80, height: 60, unit: 'mm', source: 'schema' },
    },
    schema: {} as never,
    data: {},
  } as never
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
})
