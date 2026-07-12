import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { ViewerRuntime } from './runtime'
import type { ViewerDiagnosticEvent } from './types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyBindingsToProps, projectBindings } from './binding-projector'
import { createIframeViewerHost, createViewer } from './index'

function textNode(id: string, binding?: MaterialNode['bindings'][string], props: Record<string, unknown> = {}): MaterialNode {
  return {
    id,
    type: 'text',
    x: 5,
    y: 5,
    width: 40,
    height: 8,
    modelVersion: 1,
    model: { content: '', ...props },
    slots: {},
    bindings: binding ? { value: binding } : {},
    output: { visibility: 'include' },
  }
}

function svgNode(id: string, binding?: MaterialNode['bindings'][string], props: Record<string, unknown> = {}): MaterialNode {
  return {
    id,
    type: 'svg',
    x: 5,
    y: 5,
    width: 20,
    height: 20,
    modelVersion: 1,
    model: { content: '', ...props },
    slots: {},
    bindings: binding ? { value: binding } : {},
    output: { visibility: 'include' },
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

function tableNode(sourceId = 'invoice'): MaterialNode<unknown> {
  const model = {
    kind: 'data',
    columns: [{ id: 'column-1', track: { kind: 'fr', weight: 1 } }],
    bands: [{
      id: 'band-detail',
      role: 'detail',
      rows: [{
        id: 'row-detail',
        minHeight: 8,
        cells: [{ id: 'cell-detail', columnId: 'column-1', content: { kind: 'text', text: '', bindingPort: 'cell:value' } }],
      }],
    }],
    merges: [],
    style: {},
    data: { collectionPort: 'records' },
  }
  return {
    id: 'items',
    type: 'table-data',
    x: 5,
    y: 10,
    width: 70,
    height: 16,
    modelVersion: 1,
    model,
    slots: {},
    bindings: { 'cell:value': { sourceId, fieldPath: 'items/name', fieldLabel: 'Name' } },
    output: { visibility: 'include' },
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

  it('does not project bound remote svg urls into image loads', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    await viewer.open({
      schema: fixedSchema([
        svgNode('logo', { sourceId: 'brand', fieldPath: 'logoSvgUrl' }),
      ]),
      data: {
        logoSvgUrl: 'https://cdn.example.com/logo.svg?version=1&theme=dark',
      },
    })

    expect(container.querySelector('[data-element-id="logo"] img')).toBeNull()
    expect(container.innerHTML).not.toContain('cdn.example.com')
  })

  it('projects bound svg text into the sanitized custom svg renderer', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    await viewer.open({
      schema: fixedSchema([
        svgNode('seal', { sourceId: 'brand', fieldPath: 'sealSvg' }),
      ]),
      data: {
        sealSvg: '<svg viewBox="0 0 10 10"><circle r="5" onclick="alert(1)" /></svg>',
      },
    })

    const wrapper = container.querySelector('[data-element-id="seal"]')

    expect(wrapper?.querySelector('svg')).not.toBeNull()
    expect(wrapper?.querySelector('circle')).not.toBeNull()
    expect(wrapper?.innerHTML).not.toContain('onclick')
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
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: { value: { sourceId: 'product', fieldPath: 'value' } },
      output: { visibility: 'include' },
    }

    const projected = projectBindings(node, {
      value: 123456,
      format: 'CODE128',
      params: { width: 2 },
    })
    const props = applyBindingsToProps(node.model, projected, {
      kind: 'ports',
      ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar', modelPath: '/model/value', formatEditor: { tabs: ['preset'] } }],
    })

    expect(props.value).toBe(123456)
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
      ensureFontLoaded: ViewerRuntime['fontManager']['ensureFontLoaded']
    }
    fontManager.ensureFontLoaded = async () => {
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

    expect(diagnostics.some(d => d.code === 'FONT_LOAD_FAILED')).toBe(true)
    expect(diagnostics.some(d => d.code === 'EXPORTER_ERROR')).toBe(true)
    expect(diagnostics.some(d => d.code === 'PRINT_ERROR')).toBe(true)
    expect(diagnostics.some(d => d.code === 'DIAGNOSTIC_HOOK_ERROR')).toBe(true)
  })
})
