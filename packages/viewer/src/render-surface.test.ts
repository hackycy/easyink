import type { MaterialManifest, MaterialViewerExtension, PagePlanEntry, ViewerFacetCapabilities, ViewerRenderContext } from '@easyink/core'
import type { MaterialNode, PageSchema } from '@easyink/schema'
import type { ViewerDiagnosticEvent } from './types'
import { defineMaterialManifest, viewerElement, viewerFragment, viewerImperativeDom, viewerSanitizedMarkup, viewerText } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { ProfileMaterialRuntime } from './material-runtime'
import { renderPages } from './render-surface'

describe('renderPages', () => {
  it('provides frozen canonical fallback layout facts to legacy material renderers', async () => {
    const container = document.createElement('div')
    const resolvedModel = { text: 'resolved' }
    const node: MaterialNode = {
      id: 'custom-1',
      type: 'custom',
      x: 5,
      y: 75,
      width: 30,
      height: 20,
      modelVersion: 2,
      model: { text: 'source' },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }
    let captured: ViewerRenderContext | undefined
    const materials = await createMaterials({
      render: (_node, context) => {
        captured = context
        return { tree: viewerText('captured') }
      },
    })

    renderPages([{
      index: 1,
      width: 80,
      height: 60,
      elements: [node],
      yOffset: 60,
    }], materials, {
      container,
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map([[node.id, resolvedModel]]),
      pageSchema: { mode: 'fixed', width: 80, height: 60 },
      browserDom: { maxNodes: 12 },
    }, [])

    expect(captured).toBeDefined()
    expect(captured!.resolvedModel).toBe(resolvedModel)
    expect(captured!.instanceKey).toBe(node.id)
    expect(captured!.layoutPlan).toMatchObject({
      instanceKey: node.id,
      nodeId: node.id,
      nodeRevision: 2,
      constraintKey: '30:20:mm:horizontal-tb',
      borderBox: { x: 0, y: 0, width: 30, height: 20 },
      breakOpportunities: [],
    })
    expect(captured!.fragmentPlan).toMatchObject({
      id: JSON.stringify(['material-fragment', 'custom-1', 1, 0, 20]),
      box: { x: 5, y: 15, width: 30, height: 20 },
      consumedRange: { startBlockOffset: 0, endBlockOffset: 20 },
    })
    expect(Object.isFrozen(captured!.layoutPlan)).toBe(true)
    expect(Object.isFrozen(captured!.fragmentPlan)).toBe(true)
    expect(captured!.renderSlot('missing')).toEqual(viewerFragment([]))
    expect(captured!.renderBudget.maxNodes).toBe(12)
    captured!.renderBudget.reserveNodes('text', 2)
    expect(captured!.renderBudget.nodesUsed).toBe(2)
  })

  it('mints distinct fallback fragment identities for repeated output pages', async () => {
    const container = document.createElement('div')
    const node: MaterialNode = {
      id: 'repeated-node',
      type: 'custom',
      x: 5,
      y: 15,
      width: 30,
      height: 20,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }
    const fragmentIds: string[] = []
    const materials = await createMaterials({
      render: (_node, context) => {
        fragmentIds.push(context.fragmentPlan.id)
        return { tree: viewerText('repeated') }
      },
    })

    renderPages([
      { index: 2, width: 80, height: 60, elements: [node], yOffset: 0 },
      { index: 3, width: 80, height: 60, elements: [node], yOffset: 0 },
    ], materials, {
      container,
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map(),
      pageSchema: { mode: 'fixed', width: 80, height: 60 },
    }, [])

    expect(fragmentIds).toHaveLength(2)
    expect(new Set(fragmentIds).size).toBe(2)
  })

  it('does not expose legacy manifest slot keys as committed slot instances', async () => {
    let legacyContentOutputs: ViewerRenderContext['slotOutputs']
    let committedContent: ReturnType<ViewerRenderContext['renderSlot']> = viewerFragment([])
    let missing: ReturnType<ViewerRenderContext['renderSlot']> = viewerFragment([])
    const ownerExtension: MaterialViewerExtension = {
      render: (_node, context) => {
        legacyContentOutputs = context.slotOutputs
        committedContent = context.renderSlot('content')
        missing = context.renderSlot('missing')
        return { tree: committedContent }
      },
    }
    const { materials, owner, options } = await createNestedSurface({
      ownerExtension,
      children: [{ type: 'child', extension: { render: () => ({ tree: viewerText('legacy child') }) } }],
    })

    renderPages(pageWith(owner), materials, options, [])

    expect(legacyContentOutputs?.content).toHaveLength(1)
    expect(committedContent).toEqual(viewerFragment([]))
    expect(missing).toEqual(viewerFragment([]))
    expect(options.container.textContent).not.toContain('legacy child')
  })

  it('keeps committed slot authorization host-owned and freezes the assembled context', async () => {
    let captured: ViewerRenderContext | undefined
    let layoutPlanReplacementAccepted: boolean | undefined
    let slotOutputsReplacementAccepted: boolean | undefined
    let childFrozen: boolean | undefined
    let childLayoutPlanReplacementAccepted: boolean | undefined
    let renderedSlot: ReturnType<ViewerRenderContext['renderSlot']> = viewerFragment([])
    const ownerExtension: MaterialViewerExtension = {
      render: (_node, context) => {
        captured = context
        const legacyContent = context.slotOutputs?.content ?? []
        layoutPlanReplacementAccepted = Reflect.set(context, 'layoutPlan', {
          ...context.layoutPlan,
          slotBoxes: [{
            slotId: 'content',
            slotInstanceKey: 'content',
            box: { x: 0, y: 0, width: 10, height: 10 },
            ownership: 'managed',
            clip: true,
          }],
        })
        slotOutputsReplacementAccepted = Reflect.set(context, 'slotOutputs', {
          content: [viewerText('forged slot')],
        })
        renderedSlot = context.renderSlot('content')
        return { tree: viewerFragment(legacyContent) }
      },
    }
    const { materials, owner, options } = await createNestedSurface({
      ownerExtension,
      children: [{
        type: 'child',
        extension: {
          render: (_node, context) => {
            childFrozen = Object.isFrozen(context)
            childLayoutPlanReplacementAccepted = Reflect.set(context, 'layoutPlan', context.layoutPlan)
            return { tree: viewerText('legacy child') }
          },
        },
      }],
    })

    renderPages(pageWith(owner), materials, options, [])

    expect({
      frozen: Object.isFrozen(captured),
      layoutPlanReplacementAccepted,
      slotOutputsReplacementAccepted,
      childFrozen,
      childLayoutPlanReplacementAccepted,
      renderedSlot,
    }).toEqual({
      frozen: true,
      layoutPlanReplacementAccepted: false,
      slotOutputsReplacementAccepted: false,
      childFrozen: true,
      childLayoutPlanReplacementAccepted: false,
      renderedSlot: viewerFragment([]),
    })
  })

  it('mints stable injective nested instance and fragment identities', async () => {
    const first: Array<Pick<ViewerRenderContext, 'instanceKey' | 'fragmentPlan'>> = []
    const firstSurface = await createNestedSurface({
      ownerId: 'a/b',
      children: [{
        id: 'c',
        type: 'first-child',
        extension: {
          render: (_node, context) => {
            first.push({ instanceKey: context.instanceKey, fragmentPlan: context.fragmentPlan })
            return { tree: viewerText('first') }
          },
        },
      }],
    })
    renderPages(pageWith(firstSurface.owner), firstSurface.materials, firstSurface.options, [])
    renderPages(pageWith(firstSurface.owner), firstSurface.materials, firstSurface.options, [])

    let second: Pick<ViewerRenderContext, 'instanceKey' | 'fragmentPlan'> | undefined
    const secondSurface = await createNestedSurface({
      ownerId: 'a',
      children: [{
        id: 'b/c',
        type: 'second-child',
        extension: {
          render: (_node, context) => {
            second = { instanceKey: context.instanceKey, fragmentPlan: context.fragmentPlan }
            return { tree: viewerText('second') }
          },
        },
      }],
    })
    renderPages(pageWith(secondSurface.owner), secondSurface.materials, secondSurface.options, [])

    expect(first).toHaveLength(2)
    expect(second).toBeDefined()
    expect(first[0]!.instanceKey).toBe(first[1]!.instanceKey)
    expect(first[0]!.fragmentPlan.id).toBe(first[1]!.fragmentPlan.id)
    expect(first[0]!.fragmentPlan.sourceInstanceKey).toBe(first[0]!.instanceKey)
    expect(second!.fragmentPlan.sourceInstanceKey).toBe(second!.instanceKey)
    expect(first[0]!.instanceKey).not.toBe(second!.instanceKey)
    expect(first[0]!.fragmentPlan.id).not.toBe(second!.fragmentPlan.id)
  })

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

  it.each([
    { ownerDeclared: false, childDeclared: true, hostEnabled: true, rendered: true },
    { ownerDeclared: true, childDeclared: false, hostEnabled: true, rendered: false },
    { ownerDeclared: false, childDeclared: true, hostEnabled: false, rendered: false },
    { ownerDeclared: true, childDeclared: true, hostEnabled: true, rendered: true },
  ])('scopes nested imperative DOM independently: $ownerDeclared/$childDeclared/$hostEnabled', async ({ ownerDeclared, childDeclared, hostEnabled, rendered }) => {
    const childExtension: MaterialViewerExtension = {
      render: () => ({ tree: viewerImperativeDom('chart', (host) => {
        const mount = host.render(viewerText('child-chart'))
        return () => mount.dispose()
      }) }),
    }
    const { materials, owner, options } = await createNestedSurface({
      ownerCapabilities: ownerDeclared ? { imperativeDom: ['chart'] } : {},
      children: [{ type: 'child', extension: childExtension, capabilities: childDeclared ? { imperativeDom: ['chart'] } : {} }],
      hostImperativeDom: hostEnabled ? ['chart'] : [],
    })
    const diagnostics: ViewerDiagnosticEvent[] = []

    renderPages(pageWith(owner), materials, options, diagnostics)

    expect(options.container.textContent?.includes('child-chart')).toBe(rendered)
    expect(diagnostics.some(item => item.nodeId === 'child')).toBe(!rendered)
    expect(diagnostics.some(item => item.nodeId === 'owner')).toBe(false)
  })

  it('does not let an owner borrow a child imperative capability', async () => {
    const childExtension: MaterialViewerExtension = { render: () => ({ tree: viewerText('child') }) }
    const ownerExtension: MaterialViewerExtension = {
      render: (_node, context) => ({ tree: viewerFragment([
        ...(context.slotOutputs?.content ?? []),
        viewerImperativeDom('chart', host => () => host.element.replaceChildren()),
      ]) }),
    }
    const { materials, owner, options } = await createNestedSurface({
      ownerExtension,
      children: [{ type: 'child', extension: childExtension, capabilities: { imperativeDom: ['chart'] } }],
      hostImperativeDom: ['chart'],
    })
    const diagnostics: ViewerDiagnosticEvent[] = []

    renderPages(pageWith(owner), materials, options, diagnostics)

    expect(options.container.querySelector('[data-element-id="owner"]')?.getAttribute('data-render-error')).toBe('true')
    expect(diagnostics).toEqual([expect.objectContaining({ nodeId: 'owner', code: 'MATERIAL_RENDER_ERROR' })])
  })

  it('isolates nested render, size, and tree policy failures per child', async () => {
    const children = [
      { type: 'good-child', extension: { render: () => ({ tree: viewerText('healthy sibling') }) } },
      { type: 'bad-url-child', extension: { render: () => ({ tree: viewerElement('a', { attributes: { href: 'javascript:alert(1)' } }) }) } },
      { type: 'bad-tag-child', extension: { render: () => ({ tree: viewerElement('script') }) } },
      { type: 'bad-token-child', extension: { render: () => ({ tree: viewerSanitizedMarkup({} as never) }) } },
      { type: 'oversized-child', extension: { render: () => ({ tree: viewerFragment(Array.from({ length: 101 }, () => viewerText('x'))) }) } },
      { type: 'bad-size-child', extension: { render: () => ({ tree: viewerText('not mounted') }), getRenderSize: () => { throw new Error('size') } } },
    ] satisfies Array<{ type: string, extension: MaterialViewerExtension }>
    const { materials, owner, options } = await createNestedSurface({ children, maxNodes: 100 })
    const diagnostics: ViewerDiagnosticEvent[] = []

    renderPages(pageWith(owner), materials, options, diagnostics)

    expect(options.container.textContent).toContain('healthy sibling')
    expect(options.container.querySelector('[data-element-id="owner"]')?.getAttribute('data-render-error')).toBeNull()
    expect(options.container.querySelectorAll('[data-render-error="true"]')).toHaveLength(5)
    expect(diagnostics.map(item => item.nodeId).sort()).toEqual(children.slice(1).map(item => item.type).sort())
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

interface NestedChildSpec {
  id?: string
  type: string
  extension: MaterialViewerExtension
  capabilities?: ViewerFacetCapabilities
}

async function createNestedSurface(input: {
  ownerId?: string
  ownerExtension?: MaterialViewerExtension
  ownerCapabilities?: ViewerFacetCapabilities
  children: NestedChildSpec[]
  hostImperativeDom?: string[]
  maxNodes?: number
}) {
  const ownerExtension = input.ownerExtension ?? {
    render: (_node, context) => ({ tree: viewerFragment(context.slotOutputs?.content ?? []) }),
  }
  const ownerBase = createTestMaterialManifest({
    type: 'owner',
    slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
    viewer: () => ({ extension: ownerExtension, capabilities: input.ownerCapabilities ?? {} }),
  })
  const manifests: MaterialManifest[] = [
    defineMaterialManifest({ ...ownerBase, facets: { ...ownerBase.facets, viewer: () => ({ extension: ownerExtension, capabilities: input.ownerCapabilities ?? {} }) } }),
    ...input.children.map(child => createTestMaterialManifest({
      type: child.type,
      viewer: () => ({ extension: child.extension, capabilities: child.capabilities ?? {} }),
    })),
  ]
  const profile = createTestCompiledMaterialProfile(manifests)
  const materials = new ProfileMaterialRuntime(profile)
  await materials.prepare(['owner', ...input.children.map(child => child.type)])
  const children = input.children.map((child, index): MaterialNode => ({
    id: child.id ?? child.type,
    type: child.type,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
    zIndex: index,
  }))
  const owner: MaterialNode = {
    id: input.ownerId ?? 'owner',
    type: 'owner',
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    modelVersion: 1,
    model: {},
    slots: { content: children },
    bindings: {},
    output: { visibility: 'include' },
  }
  return {
    materials,
    owner,
    options: {
      container: document.createElement('div'),
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map<string, Record<string, unknown>>(),
      pageSchema: { mode: 'fixed' as const, width: 80, height: 60 },
      browserDom: { imperativeDom: input.hostImperativeDom ?? [], maxNodes: input.maxNodes ?? 1000 },
    },
  }
}

function pageWith(node: MaterialNode): PagePlanEntry[] {
  return [{ index: 0, width: 80, height: 60, elements: [node], yOffset: 0 }]
}
