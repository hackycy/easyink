import type { DocumentSchema } from '@easyink/viewer'
import { describe, expect, it, vi } from 'vitest'
import { createHiPrintPrintSdk } from './sdk'

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

describe('hi print print sdk', () => {
  it('creates the managed viewer and submits rendered pages through the client', async () => {
    const client = {
      printerName: 'Printer A',
      useDefaultPrinter: vi.fn(async () => 'Printer A'),
      printPages: vi.fn(async () => {}),
    }
    const sdk = createHiPrintPrintSdk({
      client: client as never,
      viewer: 'dom',
      copies: () => 2,
      forcePageSize: () => true,
    })

    await sdk.print({
      schema: createFixedSchema(),
      data: {},
    })

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
