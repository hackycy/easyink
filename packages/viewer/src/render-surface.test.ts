import type { MaterialViewerExtension, PagePlanEntry, ViewerFacetCapabilities } from '@easyink/core'
import type { MaterialNode, PageSchema } from '@easyink/schema'
import type { ViewerDiagnosticEvent } from './types'
import { viewerElement, viewerImperativeDom, viewerText } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { ProfileMaterialRuntime } from './material-runtime'
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
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
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

    const materials = await createMaterials({
      render: () => ({ tree: viewerElement('div', {}, [viewerText('custom')]) }),
      getRenderSize: () => ({ height: 7 }),
    })

    renderPages(pages, materials, {
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
    const materials = emptyMaterials()
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
    }], materials, {
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
    const materials = emptyMaterials()
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
    }], materials, {
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
    const materials = emptyMaterials()
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
    }], materials, {
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
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }

    const materials = await createMaterials({
      render: () => ({ tree: viewerElement('div', {}, [viewerText('content')]) }),
    })

    renderPages([{
      index: 0,
      width: 80,
      height: 60,
      elements: [node],
      yOffset: 0,
    }], materials, {
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

  it('skips page watermark when disabled or blank', () => {
    const container = document.createElement('div')
    const materials = emptyMaterials()

    renderPages([{
      index: 0,
      width: 80,
      height: 60,
      elements: [],
      yOffset: 0,
    }], materials, {
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

  it('allows imperative DOM only when the facet and host both declare it', async () => {
    const extension: MaterialViewerExtension = {
      render: () => ({ tree: viewerImperativeDom('chart', (host) => {
        const mount = host.render(viewerText('chart'))
        return () => mount.dispose()
      }) }),
    }
    const materials = await createMaterials(extension, { imperativeDom: ['chart'] })
    const node: MaterialNode = {
      id: 'custom-1',
      type: 'custom',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }
    const pages: PagePlanEntry[] = [{ index: 0, width: 80, height: 60, elements: [node], yOffset: 0 }]
    const options = {
      container: document.createElement('div'),
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map(),
      pageSchema: { mode: 'fixed' as const, width: 80, height: 60 },
    }

    renderPages(pages, materials, { ...options, browserDom: { imperativeDom: ['chart'], maxNodes: 100 } }, [])
    expect(options.container.textContent).toContain('chart')

    const diagnostics: ViewerDiagnosticEvent[] = []
    renderPages(pages, materials, { ...options, browserDom: { maxNodes: 100 } }, diagnostics)
    expect(options.container.querySelector('[data-render-error="true"]')).not.toBeNull()
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'MATERIAL_RENDER_ERROR' })])
  })
})

function emptyMaterials(): ProfileMaterialRuntime {
  return new ProfileMaterialRuntime(createTestCompiledMaterialProfile([]))
}

async function createMaterials(extension: MaterialViewerExtension, capabilities: ViewerFacetCapabilities = {}): Promise<ProfileMaterialRuntime> {
  const profile = createTestCompiledMaterialProfile([
    createTestMaterialManifest({ type: 'custom', viewer: () => ({ extension, capabilities }) }),
  ])
  const materials = new ProfileMaterialRuntime(profile)
  await materials.prepare(['custom'])
  return materials
}
