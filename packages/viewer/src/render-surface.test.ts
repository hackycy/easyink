import type { PagePlanEntry } from '@easyink/core'
import type { MaterialNode, PageSchema } from '@easyink/schema'
import { trustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { MaterialRendererRegistry } from './material-registry'
import { renderPages } from './render-surface'

describe('renderPages', () => {
  it('uses the registered render-size callback for wrapper dimensions', () => {
    const container = document.createElement('div')
    const registry = new MaterialRendererRegistry()
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

    registry.register('custom', { kind: 'none' }, {
      render: () => ({ html: trustedViewerHtml('<div>custom</div>') }),
      getRenderSize: () => ({ height: 7 }),
    })

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

  it('applies page background styles consistently for repeat modes', () => {
    const container = document.createElement('div')
    const registry = new MaterialRendererRegistry()
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

  it('applies page font to the viewer page root', () => {
    const container = document.createElement('div')
    const registry = new MaterialRendererRegistry()
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

  it('renders text watermark as a page overlay', () => {
    const container = document.createElement('div')
    const registry = new MaterialRendererRegistry()
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

  it('skips page watermark when disabled or blank', () => {
    const container = document.createElement('div')
    const registry = new MaterialRendererRegistry()

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
