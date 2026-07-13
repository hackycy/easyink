import type { MaterialManifest, MaterialViewerExtension, PagePlanEntry, ViewerFacetCapabilities, ViewerRenderContext } from '@easyink/core'
import type { MaterialNode, PageSchema } from '@easyink/schema'
import type { CommittedPagePlan, RuntimeMaterialInstancePlan } from './layout-runtime'
import type { ViewerDiagnosticEvent } from './types'
import { createBrowserDomCapabilities } from '@easyink/browser-dom'
import { defineMaterialManifest, freezeMaterialFragmentPlan, freezeMaterialLayoutPlan, viewerElement, viewerFragment, viewerImperativeDom, viewerSanitizedMarkup, viewerText } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { mountCommittedMaterial, mountMaterialTree, renderPages, RenderSurface } from './index'
import { ProfileMaterialRuntime } from './material-runtime'

describe('mountMaterialTree', () => {
  it('renders raw text as text and leaves a later mount intact when an old disposer runs', () => {
    const host = document.createElement('div')
    const first = mountMaterialTree(host, viewerText('<img src=x onerror=alert(1)>'), { document, maxNodes: 2 })
    const second = mountMaterialTree(host, viewerText('second'), { document, maxNodes: 2 })

    first.dispose()

    expect(host.children).toHaveLength(0)
    expect(host.textContent).toBe('second')
    second.dispose()
    expect(host.textContent).toBe('')
  })

  it('rolls back a failed mount and disposes its owned capabilities', () => {
    const host = document.createElement('div')
    host.textContent = 'previous'
    const capabilities = createBrowserDomCapabilities({ document, maxNodes: 1 })

    expect(() => mountMaterialTree(host, viewerFragment([
      viewerText('one'),
      viewerText('two'),
    ]), { document, capabilities, maxNodes: 1 })).toThrowError('VIEWER_TREE_NODE_LIMIT_EXCEEDED')

    expect(host.textContent).toBe('previous')
    expect(() => capabilities.sanitizeMarkup({ format: 'svg', source: '<svg />' }))
      .toThrowError('VIEWER_CAPABILITIES_DISPOSED')
  })
})

describe('renderSurface', () => {
  it('preserves the committed root and disposers when a replacement build fails', async () => {
    const host = document.createElement('div')
    const surface = new RenderSurface(host)
    const disposed: string[] = []
    await surface.commitAtomically((root, transaction) => {
      root.textContent = 'old'
      transaction.register(() => disposed.push('old'))
    }, new AbortController().signal)

    await expect(surface.commitAtomically((root, transaction) => {
      root.textContent = 'new'
      transaction.register(() => disposed.push('new'))
      throw new Error('build failed')
    }, new AbortController().signal)).rejects.toThrowError('build failed')

    expect(host.textContent).toBe('old')
    expect(disposed).toEqual(['new'])
  })

  it('swaps once before disposing old mounts in reverse order', async () => {
    const host = document.createElement('div')
    const surface = new RenderSurface(host)
    const events: string[] = []
    await surface.commitAtomically((root, transaction) => {
      root.textContent = 'old'
      transaction.register(() => events.push(`first:${host.textContent}`))
      transaction.register(() => events.push(`second:${host.textContent}`))
    }, new AbortController().signal)

    await surface.commitAtomically((root) => {
      root.textContent = 'new'
    }, new AbortController().signal)

    expect(host.textContent).toBe('new')
    expect(events).toEqual(['second:new', 'first:new'])
  })

  it('prevents an earlier async build from overwriting a newer commit', async () => {
    const host = document.createElement('div')
    const surface = new RenderSurface(host)
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const disposed: string[] = []
    const earlier = surface.commitAtomically(async (root, transaction) => {
      root.textContent = 'earlier'
      transaction.register(() => disposed.push('earlier'))
      await blocked
      transaction.checkpoint()
    }, new AbortController().signal)

    await surface.commitAtomically((root) => {
      root.textContent = 'newer'
    }, new AbortController().signal)
    release()

    await expect(earlier).rejects.toThrowError('RENDER_SURFACE_COMMIT_SUPERSEDED')
    expect(host.textContent).toBe('newer')
    expect(disposed).toEqual(['earlier'])
  })

  it('lets a reentrant inner commit win and cleans the superseded outer build', async () => {
    const host = document.createElement('div')
    const surface = new RenderSurface(host)
    const disposed: string[] = []

    await expect(surface.commitAtomically(async (root, transaction) => {
      root.textContent = 'outer'
      transaction.register(() => disposed.push('outer'))
      await surface.commitAtomically((innerRoot) => {
        innerRoot.textContent = 'inner'
      }, new AbortController().signal)
    }, new AbortController().signal)).rejects.toThrowError('RENDER_SURFACE_COMMIT_SUPERSEDED')

    expect(host.textContent).toBe('inner')
    expect(disposed).toEqual(['outer'])
  })

  it('checks abort after awaited work, cleans only new mounts, and makes dispose idempotent', async () => {
    const host = document.createElement('div')
    const surface = new RenderSurface(host)
    const controller = new AbortController()
    const reason = new Error('cancelled')
    const disposed: string[] = []

    const commit = surface.commitAtomically(async (root, transaction) => {
      root.textContent = 'aborted'
      transaction.register(() => disposed.push('new'))
      await Promise.resolve()
      controller.abort(reason)
    }, controller.signal)

    await expect(commit).rejects.toBe(reason)
    expect(host.textContent).toBe('')
    expect(disposed).toEqual(['new'])
    surface.dispose()
    surface.dispose()
    await expect(surface.commitAtomically(() => {}, new AbortController().signal))
      .rejects
      .toThrowError('RENDER_SURFACE_DISPOSED')
  })

  it('continues reverse disposal and reports errors in stable order', async () => {
    const host = document.createElement('div')
    const surface = new RenderSurface(host)
    const calls: string[] = []
    const first = new Error('first')
    const second = new Error('second')
    await surface.commitAtomically((_root, transaction) => {
      transaction.register(() => {
        calls.push('first')
        throw first
      })
      transaction.register(() => {
        calls.push('second')
        throw second
      })
    }, new AbortController().signal)

    let caught: unknown
    try {
      await surface.commitAtomically(() => {}, new AbortController().signal)
    }
    catch (error) {
      caught = error
    }

    expect(calls).toEqual(['second', 'first'])
    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual([second, first])
    expect(host.childNodes).toHaveLength(1)
  })

  it('cleans the detached build and preserves the old commit when the atomic swap throws', async () => {
    const host = document.createElement('div')
    const surface = new RenderSurface(host)
    const disposed: string[] = []
    await surface.commitAtomically((root, transaction) => {
      root.textContent = 'old'
      transaction.register(() => disposed.push('old'))
    }, new AbortController().signal)
    const swapError = new Error('swap failed')
    vi.spyOn(host, 'replaceChildren').mockImplementationOnce(() => {
      throw swapError
    })

    await expect(surface.commitAtomically((root, transaction) => {
      root.textContent = 'new'
      transaction.register(() => disposed.push('new'))
    }, new AbortController().signal)).rejects.toBe(swapError)

    expect(host.textContent).toBe('old')
    expect(disposed).toEqual(['new'])
  })
})

describe('mountCommittedMaterial', () => {
  it('renders ready instances from exact frozen committed facts and the current page fragment', async () => {
    const node = committedNode('ready', 'committed-ready')
    const facts = committedFacts('ready-instance', node)
    let captured: ViewerRenderContext | undefined
    let capturedNode: Readonly<MaterialNode> | undefined
    const materials = await createCommittedMaterials([{ type: node.type, extension: {
      render: (renderNode, context) => {
        capturedNode = renderNode
        captured = context
        return { tree: viewerText(String(context.resolvedModel.label)) }
      },
    } }])
    const host = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []

    const mount = mountCommittedMaterial(host, {
      committedPlan: committedPagePlan([facts.instance]),
      fragmentPlan: facts.fragmentPlan,
      materials,
      pageIndex: 2,
      unit: 'mm',
      zoom: 1.5,
      viewerMaxNodes: 20,
      browserDom: { maxNodes: 15 },
      diagnostics,
    })

    expect(host.textContent).toBe('ready-instance')
    expect(capturedNode).toBe(facts.instance.node)
    expect(captured).toMatchObject({ instanceKey: 'ready-instance', pageIndex: 2, unit: 'mm', zoom: 1.5 })
    expect(captured?.data).toBe(facts.instance.scopeData)
    expect(captured?.resolvedModel).toBe(facts.instance.resolvedModel)
    expect(captured?.layoutPlan).toBe(facts.instance.layoutPlan)
    expect(captured?.fragmentPlan).toBe(facts.fragmentPlan)
    expect(captured?.renderBudget.maxNodes).toBe(15)
    expect('snapshot' in captured!.renderBudget).toBe(false)
    expect('restore' in captured!.renderBudget).toBe(false)
    expect(() => captured!.renderBudget.reserveNodes('text', Number.MAX_SAFE_INTEGER))
      .toThrowError('VIEWER_RENDER_BUDGET_EXCEEDED')
    expect(captured?.renderBudget.nodesUsed).toBe(0)
    expect(Object.isFrozen(captured)).toBe(true)
    expect(diagnostics).toEqual([])
    mount.dispose()
    expect(() => mountCommittedMaterial(document.createElement('div'), {
      committedPlan: committedPagePlan([facts.instance]),
      fragmentPlan: facts.fragmentPlan,
      materials,
      pageIndex: 2,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 0,
      diagnostics: [],
    })).toThrowError('VIEWER_COMMITTED_RENDER_BUDGET_INVALID')
  })

  it('does not enter quarantined or identity-mismatched material extensions', async () => {
    const quarantinedNode = committedNode('quarantined', 'committed-quarantined')
    const quarantined = committedFacts('quarantined-instance', quarantinedNode, { status: 'quarantined' })
    const mismatchedNode = committedNode('mismatched', 'committed-mismatched')
    const mismatched = committedFacts('mismatched-instance', mismatchedNode)
    const render = vi.fn(() => ({ tree: viewerText('unsafe') }))
    const materials = await createCommittedMaterials([
      { type: quarantinedNode.type, extension: { render } },
      { type: mismatchedNode.type, extension: { render } },
    ])
    const diagnostics: ViewerDiagnosticEvent[] = []

    const quarantinedHost = document.createElement('div')
    mountCommittedMaterial(quarantinedHost, {
      committedPlan: committedPagePlan([quarantined.instance]),
      fragmentPlan: quarantined.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      diagnostics,
    })
    const mismatchedHost = document.createElement('div')
    mountCommittedMaterial(mismatchedHost, {
      committedPlan: committedPagePlan([mismatched.instance]),
      fragmentPlan: freezeMaterialFragmentPlan({ ...mismatched.fragmentPlan, sourceNodeId: 'foreign-node' }),
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      diagnostics,
    })

    expect(render).not.toHaveBeenCalled()
    expect(quarantinedHost.textContent).toContain('quarantined')
    expect(mismatchedHost.textContent).toContain('unavailable')
    expect(diagnostics.map(item => item.code)).toEqual([
      'VIEWER_MATERIAL_INSTANCE_QUARANTINED',
      'VIEWER_MATERIAL_INSTANCE_IDENTITY_MISMATCH',
    ])
  })

  it('recursively renders only parent-mapped slot children with shared budget and child fragments', async () => {
    const childA = committedFacts('child-a-instance', committedNode('child-a', 'committed-child-a'), { embedded: true })
    const childB = committedFacts('child-b-instance', committedNode('child-b', 'committed-child-b'), { embedded: true })
    const slotInstanceKey = 'slot:content:instance'
    const owner = committedFacts('owner-instance', committedNode('owner', 'committed-owner'), {
      slotChildren: { [slotInstanceKey]: [childA.instance.instanceKey, childB.instance.instanceKey] },
      slotInstanceKeys: [slotInstanceKey],
    })
    const budgets: ViewerRenderContext['renderBudget'][] = []
    const fragments: string[] = []
    const materials = await createCommittedMaterials([
      { type: owner.instance.node.type, extension: { render: (_node, context) => {
        budgets.push(context.renderBudget)
        return { tree: context.renderSlot(slotInstanceKey) }
      } } },
      { type: childA.instance.node.type, extension: { render: (_node, context) => {
        budgets.push(context.renderBudget)
        fragments.push(context.fragmentPlan.id)
        return { tree: viewerText('A') }
      } } },
      { type: childB.instance.node.type, extension: { render: (_node, context) => {
        budgets.push(context.renderBudget)
        fragments.push(context.fragmentPlan.id)
        return { tree: viewerText('B') }
      } } },
    ])
    const host = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []

    mountCommittedMaterial(host, {
      committedPlan: committedPagePlan([owner.instance, childA.instance, childB.instance]),
      fragmentPlan: owner.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 12,
      browserDom: { maxNodes: 10 },
      diagnostics,
    })

    expect(host.textContent).toBe('AB')
    expect(new Set(budgets).size).toBe(1)
    expect(budgets[0]?.maxNodes).toBe(10)
    expect(budgets[0]?.nodesUsed).toBe(3)
    expect(fragments).toEqual([childA.instance.embeddedFragmentPlan!.id, childB.instance.embeddedFragmentPlan!.id])
    expect(diagnostics).toEqual([])
  })

  it('diagnoses absent, foreign, and cyclic slot references with safe sentinels', async () => {
    const missingSlotKey = 'slot:missing-child'
    const cycleSlotKey = 'slot:cycle'
    const owner = committedFacts('cycle-owner', committedNode('cycle-owner', 'committed-cycle-owner'), {
      embedded: true,
      slotChildren: {
        [missingSlotKey]: ['foreign-child'],
        [cycleSlotKey]: ['cycle-owner'],
      },
      slotInstanceKeys: [missingSlotKey, cycleSlotKey],
    })
    const materials = await createCommittedMaterials([{ type: owner.instance.node.type, extension: {
      render: (_node, context) => ({ tree: viewerFragment([
        context.renderSlot('slot:absent'),
        context.renderSlot(missingSlotKey),
        context.renderSlot(cycleSlotKey),
      ]) }),
    } }])
    const host = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []

    mountCommittedMaterial(host, {
      committedPlan: committedPagePlan([owner.instance]),
      fragmentPlan: owner.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      diagnostics,
    })

    expect(host.textContent).toContain('slot unavailable')
    expect(diagnostics.map(item => item.code)).toEqual([
      'VIEWER_SLOT_INSTANCE_MISSING',
      'VIEWER_SLOT_INSTANCE_MISSING',
      'VIEWER_SLOT_INSTANCE_CYCLE',
    ])
  })

  it('isolates extension and browser-boundary failures and disposes per-material capabilities', async () => {
    const throwing = committedFacts('throwing-instance', committedNode('throwing', 'committed-throwing'))
    const oversized = committedFacts('oversized-instance', committedNode('oversized', 'committed-oversized'))
    let throwingCapabilities: ViewerRenderContext['capabilities'] | undefined
    const materials = await createCommittedMaterials([
      { type: throwing.instance.node.type, capabilities: { sanitizedMarkup: true }, extension: { render: (_node, context) => {
        throwingCapabilities = context.capabilities
        context.capabilities.sanitizeMarkup({ format: 'svg', source: '<svg />' })
        context.renderBudget.reserveNodes('text', context.renderBudget.maxNodes)
        throw new Error('extension failed')
      } } },
      { type: oversized.instance.node.type, extension: { render: () => ({
        tree: viewerFragment(Array.from({ length: 8 }, () => viewerText('x'))),
      }) } },
    ])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const throwingHost = document.createElement('div')
    mountCommittedMaterial(throwingHost, {
      committedPlan: committedPagePlan([throwing.instance]),
      fragmentPlan: throwing.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      diagnostics,
    })
    const oversizedHost = document.createElement('div')
    mountCommittedMaterial(oversizedHost, {
      committedPlan: committedPagePlan([oversized.instance]),
      fragmentPlan: oversized.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 4,
      browserDom: { maxNodes: 4 },
      diagnostics,
    })

    expect(throwingHost.textContent).toContain('unavailable')
    expect(oversizedHost.textContent).toContain('unavailable')
    expect(() => throwingCapabilities!.sanitizeMarkup({ format: 'svg', source: '<svg />' }))
      .toThrowError('VIEWER_CAPABILITIES_DISPOSED')
    expect(diagnostics.map(item => item.code)).toEqual([
      'VIEWER_MATERIAL_RENDER_ERROR',
      'VIEWER_MATERIAL_MOUNT_ERROR',
    ])
  })
})

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

  it('passes committed pagination facts through to rendering and fragment geometry', async () => {
    const container = document.createElement('div')
    const node: MaterialNode = {
      id: 'committed',
      type: 'custom',
      x: 5,
      y: 0,
      width: 30,
      height: 40,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }
    const layoutPlan = freezeMaterialLayoutPlan({
      instanceKey: 'committed:instance',
      nodeId: node.id,
      nodeRevision: 1,
      constraintKey: '30:20:mm:horizontal-tb',
      borderBox: { x: 5, y: 0, width: 30, height: 40 },
      contentBox: { x: 5, y: 0, width: 30, height: 40 },
      slotBoxes: [],
      breakOpportunities: [{ id: 'row-1', blockOffset: 20, penalty: 0 }],
      diagnostics: [],
      payload: { measured: true },
    })
    const fragmentPlan = freezeMaterialFragmentPlan({
      id: 'committed-fragment-2',
      sourceInstanceKey: layoutPlan.instanceKey,
      sourceNodeId: node.id,
      box: { x: 5, y: 20, width: 30, height: 20 },
      consumedRange: { startBlockOffset: 20, endBlockOffset: 40 },
      renderPayload: { rows: [1] },
      diagnostics: [],
    })
    let captured: ViewerRenderContext | undefined
    const materials = await createMaterials({
      render: (_node, context) => {
        captured = context
        return { tree: viewerText('committed') }
      },
    })

    renderPages([{
      index: 1,
      width: 80,
      height: 20,
      elements: [node],
      fragments: [{ node, layoutPlan, fragmentPlan }],
      yOffset: 20,
    }], materials, {
      container,
      document,
      zoom: 1,
      unit: 'mm',
      data: {},
      resolvedPropsMap: new Map(),
      pageSchema: { mode: 'fixed', width: 80, height: 20 },
    }, [])

    expect(captured?.instanceKey).toBe(layoutPlan.instanceKey)
    expect(captured?.layoutPlan).toBe(layoutPlan)
    expect(captured?.fragmentPlan).toBe(fragmentPlan)
    const wrapper = container.querySelector('[data-element-id="committed"]') as HTMLElement
    expect(wrapper.style.top).toBe('0mm')
    expect(wrapper.style.height).toBe('20mm')
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

function committedNode(id: string, type: string): Readonly<MaterialNode> {
  return Object.freeze({
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 10,
    modelVersion: 1,
    model: Object.freeze({ source: id }),
    slots: Object.freeze({}),
    bindings: Object.freeze({}),
    output: Object.freeze({ visibility: 'include' as const }),
  })
}

function committedFacts(
  instanceKey: string,
  sourceNode: Readonly<MaterialNode>,
  options: {
    status?: RuntimeMaterialInstancePlan['status']
    embedded?: boolean
    slotChildren?: Readonly<Record<string, readonly string[]>>
    slotInstanceKeys?: readonly string[]
  } = {},
): { instance: RuntimeMaterialInstancePlan, fragmentPlan: ReturnType<typeof freezeMaterialFragmentPlan> } {
  const layoutPlan = freezeMaterialLayoutPlan({
    instanceKey,
    nodeId: sourceNode.id,
    nodeRevision: 1,
    constraintKey: '20:10:mm:horizontal-tb',
    borderBox: { x: 0, y: 0, width: 20, height: 10 },
    contentBox: { x: 0, y: 0, width: 20, height: 10 },
    slotBoxes: (options.slotInstanceKeys ?? []).map((slotInstanceKey, index) => ({
      slotId: `slot-${index}`,
      slotInstanceKey,
      box: { x: 0, y: 0, width: 20, height: 10 },
      ownership: 'managed' as const,
      clip: true,
    })),
    breakOpportunities: [],
    diagnostics: [],
  })
  const fragmentPlan = freezeMaterialFragmentPlan({
    id: `fragment:${instanceKey}`,
    sourceInstanceKey: instanceKey,
    sourceNodeId: sourceNode.id,
    box: { x: 0, y: 0, width: 20, height: 10 },
    consumedRange: { startBlockOffset: 0, endBlockOffset: 10 },
    diagnostics: [],
  })
  const slotChildren = Object.freeze(Object.fromEntries(
    Object.entries(options.slotChildren ?? {}).map(([key, children]) => [key, Object.freeze([...children])]),
  ))
  const instance: RuntimeMaterialInstancePlan = Object.freeze({
    instanceKey,
    nodeId: sourceNode.id,
    node: sourceNode,
    scopeKey: `scope:${instanceKey}`,
    scopeData: Object.freeze({ label: instanceKey }),
    status: options.status ?? 'ready',
    resolvedModel: Object.freeze({ label: instanceKey }),
    layoutPlan,
    ...(options.embedded ? { embeddedFragmentPlan: fragmentPlan } : {}),
    slotChildren,
  })
  return { instance, fragmentPlan }
}

function committedPagePlan(instances: readonly RuntimeMaterialInstancePlan[]): CommittedPagePlan {
  return Object.freeze({
    documentRevision: 1,
    dataRevision: 1,
    resourceRevision: 1,
    pages: Object.freeze([]),
    outputStates: new Map(),
    runtimeInstances: new Map(instances.map(instance => [instance.instanceKey, instance])),
    diagnostics: Object.freeze([]),
  })
}

async function createCommittedMaterials(specs: readonly {
  type: string
  extension: MaterialViewerExtension
  capabilities?: ViewerFacetCapabilities
}[]): Promise<ProfileMaterialRuntime> {
  const profile = createTestCompiledMaterialProfile(specs.map(spec => createTestMaterialManifest({
    type: spec.type,
    viewer: () => ({ extension: spec.extension, capabilities: spec.capabilities ?? {} }),
  })))
  const materials = new ProfileMaterialRuntime(profile)
  await materials.prepare(specs.map(spec => spec.type))
  return materials
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
