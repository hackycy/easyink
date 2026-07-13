import type { MaterialManifest, MaterialViewerExtension, ViewerFacetCapabilities } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { ViewerRuntime } from './runtime'
import type { ViewerDiagnosticEvent, ViewerOptions } from './types'
import { DEFAULT_VIEWER_TREE_POLICY } from '@easyink/browser-dom'
import { compileBuiltinMaterialProfile } from '@easyink/builtin'
import { defineMaterialManifest, VIEWER_TREE_ABSOLUTE_MAX_NODES, viewerElement, viewerFragment, viewerImperativeDom, viewerSanitizedMarkup, viewerText } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyBindingsToProps, projectBindings } from './binding-projector'
import { createIframeViewerHost, createViewer as createProfileViewer } from './index'

const builtinProfile = compileBuiltinMaterialProfile('all')
const createViewer = (options: Omit<ViewerOptions, 'profile'> & { profile?: ViewerOptions['profile'] } = {}) => createProfileViewer({ ...options, profile: options.profile ?? builtinProfile })

function viewerManifest(
  type: string,
  extension: MaterialViewerExtension,
  pageRepeat: 'none' | 'every-output-page' = 'none',
  capabilities: ViewerFacetCapabilities = {},
): MaterialManifest {
  const base = createTestMaterialManifest({ type, viewer: () => ({ extension, capabilities }) })
  return defineMaterialManifest({
    ...base,
    common: { ...base.common, layout: { ...base.common.layout, pageRepeat } },
  })
}

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
    type: 'svg-custom',
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

function tableNode(sourceId = 'invoice'): MaterialNode {
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
    bindings: {
      'records': { sourceId, fieldPath: 'items' },
      'cell:value': { sourceId, fieldPath: 'items/name', fieldLabel: 'Name' },
    },
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
  it('keeps the active virtualized batch when a replacement DOM swap fails', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    await viewer.open({ schema: fixedSchema([textNode('atomic-old', undefined, { content: 'old active' })]) })
    const oldChildren = [...container.childNodes]
    const state = viewer as unknown as { _pageVirtualizer?: { updateVisible: (first: number, last: number, overscan: number) => void } }
    const oldVirtualizer = state._pageVirtualizer
    expect(oldVirtualizer).toBeDefined()
    const originalReplace = container.replaceChildren.bind(container)
    const swapError = new Error('runtime swap boom')
    let calls = 0
    container.replaceChildren = (...nodes) => {
      calls++
      if (calls === 1)
        throw swapError
      originalReplace(...nodes)
    }

    await expect(viewer.updateData({ next: true })).rejects.toThrow(swapError)

    expect([...container.childNodes]).toEqual(oldChildren)
    expect(state._pageVirtualizer).toBe(oldVirtualizer)
    expect(() => oldVirtualizer!.updateVisible(0, 0, 0)).not.toThrow()
    container.replaceChildren = originalReplace
    await viewer.destroy()
  })

  it('adopts a successful replacement before reporting old virtualizer cleanup errors', async () => {
    const container = document.createElement('div')
    const observed = collectDiagnostics()
    const viewer = createViewer({ container })
    await viewer.open({
      schema: fixedSchema([textNode('atomic-cleanup', undefined, { content: 'active' })]),
      onDiagnostic: observed.onDiagnostic,
    })
    const state = viewer as unknown as { _pageVirtualizer?: { dispose: () => void } }
    const oldVirtualizer = state._pageVirtualizer!
    const originalDispose = oldVirtualizer.dispose.bind(oldVirtualizer)
    oldVirtualizer.dispose = () => {
      originalDispose()
      throw new Error('old cleanup boom')
    }

    await viewer.updateData({ next: true })

    expect(state._pageVirtualizer).toBeDefined()
    expect(state._pageVirtualizer).not.toBe(oldVirtualizer)
    expect(container.querySelector('.ei-viewer-page')).not.toBeNull()
    expect(observed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MATERIAL_DISPOSE_ERROR',
      message: 'old cleanup boom',
    }))
    await viewer.destroy()
  })

  it('bounds configured viewer tree node budgets', () => {
    expect(() => createViewer({ browserDom: { maxNodes: 0 } })).toThrow('VIEWER_MAX_NODES_INVALID')
    expect(() => createViewer({ browserDom: { maxNodes: VIEWER_TREE_ABSOLUTE_MAX_NODES + 1 } })).toThrow('VIEWER_MAX_NODES_INVALID')
    expect(() => createViewer({ browserDom: { maxNodes: 1 } })).not.toThrow()
  })

  it('snapshots browser DOM options when the viewer is created', async () => {
    const container = document.createElement('div')
    const imperativeDom = new Set(['chart'])
    const htmlTags = new Set(['div'])
    const policy = { ...DEFAULT_VIEWER_TREE_POLICY, htmlTags }
    const extension: MaterialViewerExtension = {
      render: () => ({ tree: viewerImperativeDom('chart', (host) => {
        host.element.append(document.createTextNode('snapshot'))
        return () => {}
      }) }),
    }
    const viewer = createViewer({
      container,
      profile: createTestCompiledMaterialProfile([viewerManifest('snapshot', extension, 'none', { imperativeDom: ['chart'] })]),
      browserDom: { imperativeDom, policy },
    })
    imperativeDom.clear()
    htmlTags.clear()
    htmlTags.add('script')

    const node = textNode('snapshot-node')
    node.type = 'snapshot'
    await viewer.open({ schema: fixedSchema([node]) })
    expect(container.textContent).toContain('snapshot')
    await viewer.destroy()
  })

  it('diagnoses unknown materials and renders an admission sentinel', async () => {
    const container = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []
    const viewer = createViewer({ container })
    const unknown = textNode('unknown')
    unknown.type = 'unknown-material'

    await viewer.open({ schema: fixedSchema([unknown]), onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MATERIAL_TYPE_UNKNOWN', nodeId: 'unknown' }),
      expect.objectContaining({ code: 'MATERIAL_FACET_NOT_DECLARED' }),
    ]))
    expect(container.textContent).toContain('[Unavailable: unknown-material]')
  })

  it('disposes nested page mounts in reverse order before rerender and destroy', async () => {
    const disposed: string[] = []
    const extension: MaterialViewerExtension = {
      render: node => ({ tree: viewerImperativeDom('test', (host) => {
        const mount = host.render(viewerText(node.id))
        return () => {
          disposed.push(node.id)
          mount.dispose()
        }
      }) }),
    }
    const ownerManifest = createTestMaterialManifest({
      type: 'owner',
      slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      viewer: () => ({
        extension: { render: (_node: MaterialNode, context: any) => ({ tree: viewerFragment(context.slotOutputs?.content ?? []) }) },
        capabilities: {},
      }),
    })
    const profile = createTestCompiledMaterialProfile([
      ownerManifest,
      viewerManifest('disposable', extension, 'none', { imperativeDom: ['test'] }),
    ])
    const first = textNode('first')
    first.type = 'disposable'
    const second = textNode('second')
    second.type = 'disposable'
    const owner = textNode('owner')
    owner.type = 'owner'
    owner.slots = { content: [first, second] }
    const viewer = createViewer({
      container: document.createElement('div'),
      profile,
      browserDom: { imperativeDom: ['test'] },
    })
    await viewer.open({ schema: fixedSchema([owner]) })

    await viewer.render()
    expect(disposed).toEqual(['second', 'first'])

    await viewer.destroy()
    expect(disposed).toEqual(['second', 'first', 'second', 'first'])
  })

  it('reports teardown failures during destroy and continues remaining disposers', async () => {
    const container = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []
    const disposed: string[] = []
    const facetDisposed = vi.fn()
    const manifest = createTestMaterialManifest({
      type: 'throw-dispose',
      viewer: () => ({
        capabilities: { imperativeDom: ['teardown'] },
        extension: {
          render: (node: MaterialNode) => ({ tree: viewerImperativeDom('teardown', () => () => {
            disposed.push(node.id)
            throw Object.defineProperty({}, 'message', { value: `dispose ${node.id}` })
          }) }),
        },
        dispose() {
          facetDisposed()
          throw Object.defineProperty({}, 'message', { value: 'facet dispose' })
        },
      }),
    })
    const nodes = [textNode('first-dispose'), textNode('second-dispose')]
    nodes.forEach(node => node.type = 'throw-dispose')
    const viewer = createViewer({
      container,
      profile: createTestCompiledMaterialProfile([manifest]),
      browserDom: { imperativeDom: ['teardown'] },
    })
    await viewer.open({ schema: fixedSchema(nodes), onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

    await viewer.destroy()

    expect(disposed).toEqual(['second-dispose', 'first-dispose'])
    expect(facetDisposed).toHaveBeenCalledOnce()
    expect(diagnostics.filter(item => item.code === 'MATERIAL_DISPOSE_ERROR')).toHaveLength(2)
    expect(diagnostics.some(item => item.code === 'MATERIAL_FACET_DISPOSE_FAILED')).toBe(true)
  })

  it('repeats legacy page-number nodes from manifest layout metadata', async () => {
    const container = document.createElement('div')
    const marker = (id: string, type: string, y: number): MaterialNode => ({
      id,
      type,
      x: 2,
      y,
      width: 20,
      height: 5,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    })
    const markerExtension = {
      render: (_node: MaterialNode, context: any) => ({ tree: viewerText(String(context.resolvedModel.__pageNumber ?? 'legacy')) }),
    }
    const viewer = createViewer({ container, profile: createTestCompiledMaterialProfile([
      viewerManifest('legacy-marker', markerExtension, 'every-output-page'),
      viewerManifest('ordinary-marker', markerExtension),
      viewerManifest('content', { render: () => ({ tree: viewerText('page two') }) }),
    ]) })

    const schema = fixedSchema([
      marker('legacy', 'legacy-marker', 2),
      marker('ordinary', 'ordinary-marker', 10),
      marker('content', 'content', 70),
    ])
    schema.page.pagination = { strategy: 'fixed-sheets', pageCount: 2 }
    await viewer.open({ schema })

    expect(container.querySelectorAll('[data-element-type="legacy-marker"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-element-type="ordinary-marker"]')).toHaveLength(1)

    await viewer.destroy()
  })

  it('keeps quarantined repeated nodes quarantined on every virtual page', async () => {
    const container = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []
    const renderRepeated = vi.fn(() => ({ tree: viewerText('must not render') }))
    const profile = createTestCompiledMaterialProfile([
      viewerManifest('repeated-invalid', { render: renderRepeated }, 'every-output-page'),
      viewerManifest('duplicate', { render: () => ({ tree: viewerText('duplicate') }) }),
    ])
    const repeated = textNode('duplicate-id')
    repeated.type = 'repeated-invalid'
    const duplicate = textNode('duplicate-id')
    duplicate.type = 'duplicate'
    duplicate.y = 70
    const schema = fixedSchema([repeated, duplicate])
    schema.page.pagination = { strategy: 'fixed-sheets', pageCount: 2 }
    const viewer = createViewer({ container, profile })

    await viewer.open({ schema, onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

    expect(renderRepeated).not.toHaveBeenCalled()
    expect(container.querySelectorAll('[data-element-type="repeated-invalid"]')).toHaveLength(2)
    expect(container.textContent).not.toContain('must not render')
    expect(diagnostics.filter(item => item.code === 'MATERIAL_REPEAT_QUARANTINED')).toEqual([
      expect.objectContaining({ nodeId: 'duplicate-id__p0', detail: { sourceNodeId: 'duplicate-id', virtualNodeId: 'duplicate-id__p0' } }),
      expect.objectContaining({ nodeId: 'duplicate-id__p1', detail: { sourceNodeId: 'duplicate-id', virtualNodeId: 'duplicate-id__p1' } }),
    ])
    await viewer.destroy()
  })

  it('isolates every material render stage and continues rendering healthy nodes', async () => {
    const container = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []
    const badTypes = ['throw-render', 'throw-size', 'bad-url', 'bad-tag', 'bad-css', 'bad-token', 'oversized']
    const nodes = ['good', ...badTypes].map((type, index): MaterialNode => ({
      id: `${type}-node`,
      type,
      x: 2,
      y: 2 + index * 6,
      width: 30,
      height: 5,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }))
    const extensions: Record<string, MaterialViewerExtension> = {
      'good': { render: () => ({ tree: viewerElement('div', {}, [viewerText('healthy sibling')]) }) },
      'throw-render': { render: () => { throw new Error('render failed') } },
      'throw-size': { render: () => ({ tree: viewerText('unmounted') }), getRenderSize: () => { throw new Error('size failed') } },
      'bad-url': { render: () => ({ tree: viewerElement('a', { attributes: { href: 'javascript:alert(1)' } }, [viewerText('unsafe')]) }) },
      'bad-tag': { render: () => ({ tree: viewerElement('script', {}, [viewerText('unsafe')]) }) },
      'bad-css': { render: () => ({ tree: viewerElement('div', { style: { behavior: 'url(x)' } }, []) }) },
      'bad-token': { render: () => ({ tree: viewerSanitizedMarkup({} as never) }) },
      'oversized': { render: () => ({ tree: viewerFragment(Array.from({ length: VIEWER_TREE_ABSOLUTE_MAX_NODES + 1 }, () => viewerText('x'))) }) },
    }
    const viewer = createViewer({
      container,
      profile: createTestCompiledMaterialProfile(Object.entries(extensions).map(([type, extension]) => viewerManifest(type, extension, 'none', { sanitizedMarkup: type === 'bad-token' }))),
    })

    await expect(viewer.open({
      schema: fixedSchema(nodes),
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })).resolves.toBeUndefined()

    expect(container.textContent).toContain('healthy sibling')
    expect(container.querySelectorAll('[data-render-error="true"]')).toHaveLength(badTypes.length)
    expect(diagnostics.filter(item => item.code === 'MATERIAL_RENDER_ERROR').map(item => item.nodeId).sort())
      .toEqual(badTypes.map(type => `${type}-node`).sort())
  })

  it('contains hostile thrown values per node without invoking traps or leaking originals', async () => {
    const container = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []
    const throwingToString = {
      toString() {
        throw new Error('toString secret')
      },
    }
    const getterMessage = Object.defineProperties({}, {
      message: { get() { throw new Error('message getter secret') } },
      stack: { get() { throw new Error('stack getter secret') } },
    })
    const proxy = new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error('proxy trap secret')
      },
    })
    const thrownValues = [throwingToString, getterMessage, proxy]
    const extensions = [
      ...thrownValues.map((value, index) => viewerManifest(`hostile-${index}`, { render: () => { throw value } })),
      viewerManifest('healthy-hostile-sibling', { render: () => ({ tree: viewerText('healthy after hostile throws') }) }),
    ]
    const nodes = extensions.map((manifest, index) => {
      const node = textNode(`hostile-node-${index}`)
      node.type = manifest.type
      node.y = index * 8
      return node
    })
    const viewer = createViewer({ container, profile: createTestCompiledMaterialProfile(extensions) })

    await viewer.open({ schema: fixedSchema(nodes), onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

    expect(container.textContent).toContain('healthy after hostile throws')
    const failures = diagnostics.filter(item => item.code === 'MATERIAL_RENDER_ERROR')
    expect(failures).toHaveLength(thrownValues.length)
    expect(failures.every(item => item.message.includes('Unknown thrown value'))).toBe(true)
    expect(failures.every(item => !thrownValues.includes(item.cause as object))).toBe(true)
    expect(JSON.stringify(failures)).not.toContain('secret')
    await viewer.destroy()
  })

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
        order: { total: '42' },
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

  it('renders bound SVG through the sanitized custom SVG boundary', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    await viewer.open({
      schema: fixedSchema([
        svgNode('seal', { sourceId: 'brand', fieldPath: 'sealSvg' }),
      ]),
      data: {
        sealSvg: '<svg viewBox="0 0 10 10" style="display:block"><circle r="5" onclick="alert(1)" /></svg>',
      },
    })

    const wrapper = container.querySelector('[data-element-id="seal"]')
    expect(wrapper?.querySelector('svg')).not.toBeNull()
    expect(wrapper?.querySelector('circle')).not.toBeNull()
    expect(wrapper?.innerHTML).not.toContain('onclick')
    expect(wrapper?.querySelector('[style]')).toBeNull()
  })

  it('renders signature, chart, barcode, and QR SVG without style attributes', async () => {
    const container = document.createElement('div')
    const types = ['signature', 'chart-bar', 'barcode', 'qrcode'] as const
    const elements = types.map((type, index) => builtinProfile.createNode(type, {
      id: type,
      x: 5,
      y: 5 + index * 12,
      width: 40,
      height: 10,
    }))
    const viewer = createViewer({ container })

    await viewer.open({ schema: fixedSchema(elements) })

    for (const type of types) {
      const wrapper = container.querySelector(`[data-element-id="${type}"]`)
      expect(wrapper?.querySelector('svg'), type).not.toBeNull()
      expect(wrapper?.querySelector('svg[style], svg [style]'), type).toBeNull()
    }
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
