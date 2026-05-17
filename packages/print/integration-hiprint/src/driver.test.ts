import { describe, expect, it, vi } from 'vitest'
import { createHiPrintDriver } from './driver'

function createContext() {
  const container = document.createElement('div')
  const page = document.createElement('section')
  page.className = 'ei-viewer-page'
  container.appendChild(page)

  return {
    container,
    renderedPages: [{ index: 0, width: 100, height: 50, unit: 'mm' }],
    printPolicy: {
      orientation: 'landscape',
      offset: { horizontal: 0, vertical: 0, unit: 'mm' },
      pageMode: 'fixed',
      pageSizeMode: 'driver',
      pageBreakBehavior: { after: 'page', inside: 'avoid' },
      sheetSize: { width: 100, height: 50, unit: 'mm', source: 'schema' },
    },
    schema: {} as never,
    data: {},
  } as never
}

describe('hi print driver', () => {
  it('uses the shared forcePageSize option and request customization hook', async () => {
    const client = {
      printerName: 'Printer A',
      useDefaultPrinter: vi.fn(async () => 'Printer A'),
      printPages: vi.fn(async () => {}),
    }
    const driver = createHiPrintDriver({
      client: client as never,
      copies: () => 3,
      forcePageSize: () => true,
      resolveRequestOptions: ({ widthMm }) => ({ paperHeader: widthMm > 0 ? 20 : 10 }),
    })

    await driver.print(createContext())

    expect(client.printPages).toHaveBeenCalledTimes(1)
    expect(client.printPages).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      printerName: 'Printer A',
      copies: 3,
      forcePageSize: true,
      paperHeader: 20,
      orientation: 'landscape',
    }), expect.any(Function))
  })
})
