import type { DocumentSchema } from '@easyink/viewer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEasyInkPrinter } from './sdk'

const { renderPagesToPdfBlob } = vi.hoisted(() => ({
  renderPagesToPdfBlob: vi.fn(async () => new Blob(['pdf'])),
}))

vi.mock('@easyink/export-plugin-dom-pdf', () => ({
  renderPagesToPdfBlob,
}))

function createFixedSchema(): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'fixed',
      width: 80,
      height: 60,
    },
    guides: { x: [], y: [] },
    elements: [],
  }
}

beforeEach(() => {
  renderPagesToPdfBlob.mockClear()
})

describe('easy ink printer', () => {
  it('creates the managed viewer, renders PDF, and submits the job', async () => {
    const client = {
      printPdf: vi.fn(async () => 'job-12345678'),
      waitForJob: vi.fn(async () => ({ jobId: 'job-12345678', status: 'completed' })),
    }
    const printer = createEasyInkPrinter({
      client: client as never,
      viewer: 'dom',
      printerName: () => 'Printer A',
      copies: () => 3,
      forcePageSize: () => true,
    })

    await printer.print({
      schema: createFixedSchema(),
      data: {},
    })

    expect(renderPagesToPdfBlob).toHaveBeenCalledTimes(1)
    expect(client.printPdf).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({
      copies: 3,
      forcePageSize: true,
      paperSize: { width: 80, height: 60, unit: 'mm' },
      printerName: 'Printer A',
    }))
    expect(client.waitForJob).toHaveBeenCalledWith('job-12345678')
  })

  it('can submit the managed schema and data to Printer-side Render', async () => {
    const client = {
      printEasyInk: vi.fn(async () => 'job-render-1234'),
      waitForJob: vi.fn(async () => ({ jobId: 'job-render-1234', status: 'completed' })),
    }
    const printer = createEasyInkPrinter({
      client: client as never,
      viewer: 'dom',
      submitMode: 'renderSource',
      printerName: () => 'Printer A',
      forcePageSize: () => true,
    })
    const schema = createFixedSchema()
    const data = { receipt: { no: 'R-001' } }

    await printer.print({
      schema,
      data,
    })

    expect(renderPagesToPdfBlob).not.toHaveBeenCalled()
    expect(client.printEasyInk).toHaveBeenCalledWith({
      schema: expect.objectContaining({
        version: schema.version,
        unit: schema.unit,
        page: expect.objectContaining({
          width: schema.page.width,
          height: schema.page.height,
        }),
      }),
      data,
    }, expect.objectContaining({
      printerName: 'Printer A',
      forcePageSize: true,
      paperSize: { width: 80, height: 60, unit: 'mm' },
    }))
    expect(client.waitForJob).toHaveBeenCalledWith('job-render-1234')
  })
})
