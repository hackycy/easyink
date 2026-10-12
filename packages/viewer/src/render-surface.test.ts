import type { PagePlanEntry } from '@easyink/core'
import type { MaterialNode, PageSchema } from '@easyink/schema'
import { createFragmentFromNode, trustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createViewerMaterialHost } from './material-host'
import { MaterialRendererRegistry } from './material-registry'
import { renderPages } from './render-surface'

describe('renderPages', () => {
  it('uses the registered render-size callback for wrapper dimensions', async () => {
    const container = document.createElement('div')
    const node: MaterialNode = {
      id: 'custom-1',
      type: 'custom',
      x: 5,
      y: 10,
      width: 30,
      height: 20,
      props: {},
    }
    const pages: PagePlanEntry[] = [{
      index: 0,
      width: 80,
      height: 60,
      elements: [node],
      yOffset: 0,
    }]
    const pageSchema: PageSchema = {
      mode: 'fixed',
      width: 80,
      height: 60,
    }

    const registry = new MaterialRendererRegistry(await createViewerMaterialHost({ kind: 'viewer', materials: [{ model: { type: 'custom', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'fixture', type: 'custom', x: 0, y: 0, width: 10, height: 10, rotation: 0, props: {} }) }, renderer: { render: () => ({ html: trustedViewerHtml('<div>custom</div>') }), getRenderSize: () => ({ height: 7 }) } }] }), document)
    await registry.prepare([node], new Map(), { data: {}, unit: 'mm' }, new AbortController().signal)
    pages[0].fragments = [{ ...createFragmentFromNode(node), runtimeRef: registry.runtimeRefs.get(node.id) }]

    renderPages(pages, registry, {
      container,
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map(),
      pageSchema,
    }, [])

    const element = container.querySelector('[data-element-id="custom-1"]') as HTMLElement | null
    expect(element).not.toBeNull()
    expect(element!.style.width).toBe('30mm')
    expect(element!.style.height).toBe('7mm')
  })

  it('applies page background styles consistently for repeat modes', async () => {
    const container = document.createElement('div')
    const registry = new MaterialRendererRegistry(await createViewerMaterialHost({ kind: 'viewer', materials: [] }), document)
    const pageSchema: PageSchema = {
      mode: 'fixed',
      width: 80,
      height: 60,
      background: {
        color: '#ffeeaa',
        image: 'https://example.com/bg.png',
        repeat: 'repeat-x',
        width: 120,
        offsetY: 8,
      },
    }

    renderPages([{
      index: 0,
      width: 80,
      height: 60,
      elements: [],
      yOffset: 0,
    }], registry, {
      container,
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map(),
      pageSchema,
    }, [])

    const page = container.querySelector('.ei-viewer-page') as HTMLElement | null
    expect(page).not.toBeNull()
    expect(page!.style.backgroundColor).toBe('#ffeeaa')
    expect(page!.style.backgroundImage).toBe('url("https://example.com/bg.png")')
    expect(page!.style.backgroundRepeat).toBe('repeat-x')
    expect(page!.style.backgroundSize).toBe('120mm auto')
    expect(page!.style.backgroundPosition).toBe('0mm 8mm')
  })

  it('applies page font to the viewer page root', async () => {
    const container = document.createElement('div')
    const registry = new MaterialRendererRegistry(await createViewerMaterialHost({ kind: 'viewer', materials: [] }), document)
    const pageSchema: PageSchema = {
      mode: 'fixed',
      width: 80,
      height: 60,
      font: 'ZCOOL KuaiLe',
    }

    renderPages([{
      index: 0,
      width: 80,
      height: 60,
      elements: [],
      yOffset: 0,
    }], registry, {
      container,
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map(),
      pageSchema,
    }, [])

    const page = container.querySelector('.ei-viewer-page') as HTMLElement | null
    expect(page).not.toBeNull()
    expect(page!.style.fontFamily).toBe('"ZCOOL KuaiLe"')
  })

  it('renders text watermark as a page overlay', async () => {
    const container = document.createElement('div')
    const registry = new MaterialRendererRegistry(await createViewerMaterialHost({ kind: 'viewer', materials: [] }), document)
    const pageSchema: PageSchema = {
      mode: 'fixed',
      width: 80,
      height: 60,
      layers: [{
        id: 'page-watermark',
        kind: 'watermark',
        type: 'text',
        enabled: true,
        text: 'DRAFT',
        rotation: -30,
        opacity: 0.1,
        fontSize: 12,
        gap: 40,
        color: '#b8b8b8',
      }],
    }

    renderPages([{
      index: 0,
      width: 80,
      height: 60,
      elements: [],
      yOffset: 0,
    }], registry, {
      container,
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map(),
      pageSchema,
    }, [])

    const layer = container.querySelector('.ei-viewer-page-layer--watermark') as HTMLElement | null
    const tile = container.querySelector('.ei-viewer-page-layer__watermark-tile') as HTMLElement | null
    expect(layer).not.toBeNull()
    expect(layer!.dataset.pageLayerId).toBe('page-watermark')
    expect(layer!.style.color).toBe('#b8b8b8')
    expect(layer!.style.opacity).toBe('0.1')
    expect(tile).not.toBeNull()
    expect(tile!.textContent).toBe('DRAFT')
    expect(tile!.style.fontSize).toBe('12mm')
    expect(tile!.style.transform).toContain('rotate(-30deg)')
  })

  it('renders page layer placements around the content layer in stack order', async () => {
    const container = document.createElement('div')
    const node: MaterialNode = {
      id: 'content-1',
      type: 'custom',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      props: {},
    }

    const registry = new MaterialRendererRegistry(await createViewerMaterialHost({ kind: 'viewer', materials: [{ model: { type: 'custom', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'fixture', type: 'custom', x: 0, y: 0, width: 10, height: 10, rotation: 0, props: {} }) }, renderer: { render: () => ({ html: trustedViewerHtml('<div>content</div>') }) } }] }), document)
    await registry.prepare([node], new Map(), { data: {}, unit: 'mm' }, new AbortController().signal)

    renderPages([{
      index: 0,
      width: 80,
      height: 60,
      elements: [node],
      fragments: [{ ...createFragmentFromNode(node), runtimeRef: registry.runtimeRefs.get(node.id) }],
      yOffset: 0,
    }], registry, {
      container,
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map(),
      pageSchema: {
        mode: 'fixed',
        width: 80,
        height: 60,
        layers: [
          { id: 'top', kind: 'watermark', type: 'text', enabled: true, text: 'TOP', placement: 'top' },
          { id: 'under', kind: 'watermark', type: 'text', enabled: true, text: 'UNDER', placement: 'under-content' },
          { id: 'over', kind: 'watermark', type: 'text', enabled: true, text: 'OVER', placement: 'over-content' },
        ],
      },
    }, [])

    const page = container.querySelector('.ei-viewer-page') as HTMLElement | null
    expect(page).not.toBeNull()
    expect([...page!.children].map((child) => {
      const element = child as HTMLElement
      return element.dataset.pageLayerId ?? element.className
    })).toEqual([
      'under',
      'ei-viewer-content-layer',
      'over',
      'top',
    ])
  })

  it('skips page watermark when disabled or blank', async () => {
    const container = document.createElement('div')
    const registry = new MaterialRendererRegistry(await createViewerMaterialHost({ kind: 'viewer', materials: [] }), document)

    renderPages([{
      index: 0,
      width: 80,
      height: 60,
      elements: [],
      yOffset: 0,
    }], registry, {
      container,
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map(),
      pageSchema: {
        mode: 'fixed',
        width: 80,
        height: 60,
        layers: [{ id: 'page-watermark', kind: 'watermark', type: 'text', enabled: true, text: '   ' }],
      },
    }, [])

    expect(container.querySelector('.ei-viewer-page-layer--watermark')).toBeNull()
  })
})
