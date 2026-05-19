import type { DocumentSchema, MaterialNode, TableNode } from '@easyink/schema'
import type { ViewerRuntime } from './runtime'
import type { ViewerDiagnosticEvent } from './types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyBindingsToProps, projectBindings } from './binding-projector'
import { createIframeViewerHost, createViewer } from './index'

function textNode(id: string, binding?: MaterialNode['binding'], props: Record<string, unknown> = {}): MaterialNode {
  return {
    id,
    type: 'text',
    x: 5,
    y: 5,
    width: 40,
    height: 8,
    props: { content: '', ...props },
    binding,
  }
}

function fixedSchema(elements: MaterialNode[]): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 80, height: 60 },
    guides: { x: [], y: [] },
    elements,
  }
}

function tableNode(sourceId = 'invoice'): TableNode {
  return {
    id: 'items',
    type: 'table-data',
    x: 5,
    y: 10,
    width: 70,
    height: 16,
    props: {},
    table: {
      kind: 'data',
      showHeader: false,
      showFooter: false,
      topology: {
        columns: [{ ratio: 1 }],
        rows: [
          {
            height: 8,
            role: 'repeat-template',
            cells: [
              { binding: { sourceId, fieldPath: 'items/name', fieldLabel: 'Name' } },
            ],
          },
        ],
      },
      layout: {},
    } as TableNode['table'],
  }
}

function collectDiagnostics(): { diagnostics: ViewerDiagnosticEvent[], onDiagnostic: (event: ViewerDiagnosticEvent) => void } {
  const diagnostics: ViewerDiagnosticEvent[] = []
  return {
    diagnostics,
    onDiagnostic(event) {
      diagnostics.push(event)
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('viewer audit risk regressions', () => {
  it('renders and prints through an iframe host document', async () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const frameWindow = iframe.contentWindow!
    const printSpy = vi.fn()
    Object.defineProperty(frameWindow, 'print', {
      configurable: true,
      value: printSpy,
    })

    const viewer = createViewer({ iframe })
    await viewer.open({ schema: fixedSchema([textNode('title', undefined, { content: 'Iframe' })]) })

    expect(iframe.contentDocument!.querySelector('.ei-viewer-page')).not.toBeNull()
    expect(document.querySelector('.ei-viewer-page')).toBeNull()

    await viewer.print()

    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(iframe.contentDocument!.head.querySelector('style')).toBeNull()
    expect(document.head.querySelector('style')).toBeNull()
  })

  it('injects loaded fonts into an iframe host document', async () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const viewer = createViewer({
      iframe,
      fontProvider: {
        async listFonts() {
          return []
        },
        async loadFont(fontFamily) {
          return `data:font/woff2;base64,${fontFamily}`
        },
      },
    })

    await viewer.open({ schema: fixedSchema([textNode('fonted', undefined, { content: 'Fonted', fontFamily: 'IframeFont' })]) })

    expect(iframe.contentDocument!.head.querySelector('style')?.textContent).toContain('IframeFont')
    expect(document.head.textContent).not.toContain('IframeFont')
  })

  it('accepts an explicit iframe host adapter', async () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const host = createIframeViewerHost(iframe)
    const viewer = createViewer({ host })

    const result = await viewer.open({ schema: fixedSchema([textNode('hosted', undefined, { content: 'Host' })]) })

    expect(result).toBeUndefined()
    expect(host.document.querySelector('[data-element-id="hosted"]')).not.toBeNull()
  })

  it('resolves bindings from runtime data without data source descriptors', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    const schema = fixedSchema([
      textNode('customer', { sourceId: 'customer', fieldPath: 'customer/name' }),
      textNode('total', { sourceId: 'order', sourceTag: 'order-tag', fieldPath: 'order/total' }),
    ])

    await viewer.open({
      schema,
      data: {
        customer: { name: 'Ada' },
        order: { total: 42 },
      },
    })

    expect(container.textContent).toContain('Ada')
    expect(container.textContent).toContain('42')
  })

  it('keeps root-shaped payloads when sourceId collides with a field name', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    await viewer.open({
      schema: fixedSchema([
        textNode('company', { sourceId: 'invoice', fieldPath: 'company/name' }),
        textNode('number', { sourceId: 'invoice', fieldPath: 'invoice/number' }),
        tableNode(),
      ]),
      data: {
        company: { name: 'Root Company' },
        invoice: { number: 'INV-1' },
        items: [{ name: 'Root Item' }],
      },
    })

    expect(container.textContent).toContain('Root Company')
    expect(container.textContent).toContain('INV-1')
    expect(container.textContent).toContain('Root Item')
  })

  it('renders unwrapped root payloads without descriptor field matching', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    await viewer.open({
      schema: fixedSchema([
        textNode('store', { sourceId: 'supermarket', fieldPath: 'store/name' }),
        tableNode('supermarket'),
      ]),
      data: {
        store: { name: 'Root Store' },
        items: [{ name: 'Milk' }],
      },
    })

    expect(container.textContent).toContain('Root Store')
    expect(container.textContent).toContain('Milk')
  })

  it('resolves table-data collections from the runtime data root', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    await viewer.open({
      schema: fixedSchema([tableNode()]),
      data: {
        invoice: {
          items: [{ name: 'Wrong Nested' }],
        },
        items: [{ name: 'Paper' }, { name: 'Ink' }],
      },
    })

    expect(container.textContent).toContain('Paper')
    expect(container.textContent).toContain('Ink')
    expect(container.textContent).not.toContain('Wrong Nested')
  })

  it('preserves raw binding value types before material render boundaries', () => {
    const node: MaterialNode = {
      id: 'barcode',
      type: 'barcode',
      x: 0,
      y: 0,
      width: 30,
      height: 10,
      props: {},
      binding: [
        { sourceId: 'product', fieldPath: 'value', bindIndex: 0 },
        { sourceId: 'product', fieldPath: 'format', bindIndex: 1 },
        { sourceId: 'product', fieldPath: 'params', bindIndex: 2 },
      ],
    }

    const projected = projectBindings(node, {
      value: 123456,
      format: 'CODE128',
      params: { width: 2 },
    })
    const props = applyBindingsToProps(node.props, projected, node.type)

    expect(props.value).toBe(123456)
    expect(props.format).toBe('CODE128')
    expect(props.params).toEqual({ width: 2 })
  })

  it('returns one thumbnail entry per rendered page', async () => {
    const viewer = createViewer()
    await viewer.open({ schema: fixedSchema([textNode('title', undefined, { content: 'Thumb' })]) })

    const result = await viewer.render()

    expect(result.thumbnails).toHaveLength(result.pages.length)
    expect(result.thumbnails[0]!.dataUrl).toMatch(/^data:image\/svg\+xml/)
  })

  it('emits diagnostics for font, export, print, and diagnostics hook failures', async () => {
    const container = document.createElement('div')
    const { diagnostics, onDiagnostic } = collectDiagnostics()
    const viewer = createViewer({
      container,
      fontProvider: {
        async listFonts() {
          return []
        },
        async loadFont() {
          return ''
        },
      },
    })
    const fontManager = viewer.fontManager as unknown as {
      loadFonts: ViewerRuntime['fontManager']['loadFonts']
    }
    fontManager.loadFonts = async () => {
      throw new Error('font boom')
    }

    viewer.registerExporter({
      id: 'boom-export',
      format: 'pdf',
      async prepare() {
        throw new Error('prepare boom')
      },
      async export() {},
    })
    viewer.registerPrintDriver({
      id: 'boom-print',
      async print() {
        throw new Error('print boom')
      },
    })
    viewer.hooks.diagnosticsEmitted.tap(async () => {
      throw new Error('hook boom')
    })

    await viewer.open({
      schema: fixedSchema([textNode('fonted', undefined, { content: 'Fonted', fontFamily: 'MissingFont' })]),
      onDiagnostic,
    })
    await viewer.exportDocument('pdf')
    await viewer.print({ driverId: 'boom-print' })
    await Promise.resolve()

    expect(diagnostics.some(d => d.code === 'FONT_LOAD_ERROR')).toBe(true)
    expect(diagnostics.some(d => d.code === 'EXPORTER_ERROR')).toBe(true)
    expect(diagnostics.some(d => d.code === 'PRINT_ERROR')).toBe(true)
    expect(diagnostics.some(d => d.code === 'DIAGNOSTIC_HOOK_ERROR')).toBe(true)
  })
})
