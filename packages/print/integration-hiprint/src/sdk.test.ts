import type { DocumentSchema, ViewerOptions } from '@easyink/viewer'
import { describe, expect, it, vi } from 'vitest'
import { createHiPrintPrinter } from './sdk'

const material: NonNullable<ViewerOptions['materials']>[number] = {
  model: { type: 'selected', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'selected', type: 'selected', x: 0, y: 0, width: 10, height: 10, props: {} }) },
  renderer: { render: (_node, context) => {
    const element = context.document.createElement('span')
    element.textContent = 'Configured material'
    return { element }
  } },
}

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
      printPages: vi.fn(async (_pages: HTMLElement[]) => {}),
    }
    const printer = createHiPrintPrinter({
      client: client as never,
      viewer: 'dom',
      viewerOptions: { materials: [material] },
      copies: () => 2,
      forcePageSize: () => true,
    })

    await printer.print({
      schema: { ...createFixedSchema(), elements: [material.model.createDefaultNode()] },
      data: {},
    })

    expect(client.printPages).toHaveBeenCalledTimes(1)
    expect(client.printPages.mock.calls[0]?.[0][0].textContent).toContain('Configured material')
    expect(client.printPages).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      copies: 2,
      forcePageSize: true,
      height: 60,
      printerName: 'Printer A',
      width: 80,
    }), expect.any(Function))
  })
})
