import type { DocumentSchema } from '@easyink/viewer'
import { createTestCompiledMaterialProfile } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createHiPrintPrinter } from './sdk'

const profile = createTestCompiledMaterialProfile([])

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

describe('hi print printer', () => {
  it('creates the managed viewer and submits rendered pages through the client', async () => {
    const client = {
      printerName: 'Printer A',
      useDefaultPrinter: vi.fn(async () => 'Printer A'),
      printPages: vi.fn(async () => {}),
    }
    const setupViewer = vi.fn()
    const printer = createHiPrintPrinter({
      profile,
      client: client as never,
      viewer: 'dom',
      setupViewer,
      copies: () => 2,
      forcePageSize: () => true,
    })

    await printer.print({
      schema: createFixedSchema(),
      data: {},
    })

    expect(setupViewer).toHaveBeenCalledTimes(1)
    expect(client.printPages).toHaveBeenCalledTimes(1)
    expect(client.printPages).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      copies: 2,
      forcePageSize: true,
      height: 60,
      printerName: 'Printer A',
      width: 80,
    }), expect.any(Function))
  })
})
