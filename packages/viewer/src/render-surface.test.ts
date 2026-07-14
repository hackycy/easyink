import type { MaterialViewerExtension, ViewerFacetCapabilities, ViewerRenderContext, ViewerRenderTree } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { CommittedPagePlan, RuntimeMaterialInstancePlan } from './layout-runtime'
import type { ViewerDiagnosticEvent } from './types'
import { createBrowserDomCapabilities } from '@easyink/browser-dom'
import { freezeMaterialFragmentPlan, freezeMaterialLayoutPlan, viewerFragment, viewerText } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { mountCommittedMaterial, mountMaterialTree, RenderSurface } from './index'
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

  it('checkpoints immediately after each registered mount and stops later synchronous mounts', async () => {
    const host = document.createElement('div')
    const surface = new RenderSurface(host)
    const disposed: string[] = []
    await surface.commitAtomically((root) => {
      root.textContent = 'committed'
    }, new AbortController().signal)
    const controller = new AbortController()
    const reason = new Error('aborted between mounts')
    let continued = false

    await expect(surface.commitAtomically((_root, transaction) => {
      transaction.register(() => disposed.push('first'))
      controller.abort(reason)
      transaction.register(() => disposed.push('second'))
      continued = true
      transaction.register(() => disposed.push('third'))
    }, controller.signal)).rejects.toBe(reason)

    expect(continued).toBe(false)
    expect(disposed).toEqual(['second', 'first'])
    expect(host.textContent).toBe('committed')
  })

  it.each(['abort', 'supersede', 'dispose'] as const)(
    'adopts every disposer from an async build result before the %s checkpoint',
    async (mode) => {
      const host = document.createElement('div')
      const surface = new RenderSurface(host)
      await surface.commitAtomically((root) => {
        root.textContent = 'old'
      }, new AbortController().signal)
      const controller = new AbortController()
      const reason = new Error('batch aborted')
      const disposed: string[] = []
      let release!: () => void
      const blocked = new Promise<void>((resolve) => {
        release = resolve
      })
      const pending = surface.commitAtomically(async (root) => {
        root.textContent = 'pending'
        await blocked
        return [
          () => disposed.push('first'),
          () => disposed.push('second'),
          () => disposed.push('third'),
        ]
      }, controller.signal)

      if (mode === 'abort') {
        controller.abort(reason)
      }
      else if (mode === 'supersede') {
        await surface.commitAtomically((root) => {
          root.textContent = 'newer'
        }, new AbortController().signal)
      }
      else {
        surface.dispose()
      }
      release()

      if (mode === 'abort')
        await expect(pending).rejects.toBe(reason)
      else if (mode === 'supersede')
        await expect(pending).rejects.toThrowError('RENDER_SURFACE_COMMIT_SUPERSEDED')
      else
        await expect(pending).rejects.toThrowError('RENDER_SURFACE_DISPOSED')
      expect(disposed).toEqual(['third', 'second', 'first'])
      expect(host.textContent).toBe(mode === 'abort' ? 'old' : mode === 'supersede' ? 'newer' : '')
    },
  )

  it('cleans every valid returned disposer when an async build result contains an invalid entry', async () => {
    const host = document.createElement('div')
    const surface = new RenderSurface(host)
    await surface.commitAtomically((root) => {
      root.textContent = 'old'
    }, new AbortController().signal)
    const disposed: string[] = []

    await expect(surface.commitAtomically(async () => [
      () => disposed.push('first'),
      { invalid: true } as never,
      () => disposed.push('third'),
    ], new AbortController().signal)).rejects.toThrowError('RENDER_SURFACE_DISPOSER_INVALID')

    expect(disposed).toEqual(['third', 'first'])
    expect(host.textContent).toBe('old')
  })

  it('commits successfully and reports old cleanup errors in stable reverse order', async () => {
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

    let newDisposed = false
    const result = await surface.commitAtomically((root, transaction) => {
      root.textContent = 'new'
      transaction.register(() => {
        newDisposed = true
      })
    }, new AbortController().signal)

    expect(calls).toEqual(['second', 'first'])
    expect(result.root).toBeInstanceOf(HTMLElement)
    expect(result.cleanupDiagnostics).toEqual([
      expect.objectContaining({ code: 'MATERIAL_DISPOSE_ERROR', severity: 'warning', message: 'second', cause: { message: 'second' } }),
      expect.objectContaining({ code: 'MATERIAL_DISPOSE_ERROR', severity: 'warning', message: 'first', cause: { message: 'first' } }),
    ])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.cleanupDiagnostics)).toBe(true)
    expect(host.textContent).toBe('new')
    expect(newDisposed).toBe(false)
    expect(host.childNodes).toHaveLength(1)
    surface.dispose()
    expect(newDisposed).toBe(true)
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
      .toThrowError('VIEWER_RENDER_TREE_BUDGET_EXCEEDED')
    expect(captured?.renderBudget.nodesUsed).toBe(1)
    expect(Object.isFrozen(captured)).toBe(true)
    expect(diagnostics).toEqual([expect.objectContaining({
      code: 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
      nodeId: 'ready',
    })])
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
    expect(budgets[0]?.nodesUsed).toBe(5)
    expect(fragments).toEqual([childA.instance.embeddedFragmentPlan!.id, childB.instance.embeddedFragmentPlan!.id])
    expect(diagnostics).toEqual([])
  })

  it('charges material-owned aliases beyond one core slot occurrence credit', async () => {
    const owner = committedFacts('aliased-slot-owner-instance', committedNode('aliased-slot-owner', 'committed-aliased-slot-owner'))
    let budget: ViewerRenderContext['renderBudget'] | undefined
    const materials = await createCommittedMaterials([{ type: owner.instance.node.type, extension: {
      render: (_node, context) => {
        budget = context.renderBudget
        const slot = context.renderSlot('slot:missing')
        return { tree: viewerFragment([slot, slot]) }
      },
    } }])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const host = document.createElement('div')

    mountCommittedMaterial(host, {
      committedPlan: committedPagePlan([owner.instance]),
      fragmentPlan: owner.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 5,
      browserDom: { maxNodes: 5 },
      diagnostics,
    })

    expect(host.textContent).toBe('[slot unavailable][slot unavailable]')
    expect(budget?.nodesUsed).toBe(5)
    expect(diagnostics.map(item => item.code)).toEqual(['VIEWER_SLOT_INSTANCE_MISSING'])
  })

  it('quarantines an over-budget core slot alias before browser mount', async () => {
    const owner = committedFacts('aliased-slot-overflow-owner-instance', committedNode('aliased-slot-overflow-owner', 'committed-aliased-slot-overflow-owner'))
    const render = vi.fn((_node: MaterialNode, context: ViewerRenderContext) => {
      const slot = context.renderSlot('slot:missing')
      return { tree: viewerFragment([slot, slot]) }
    })
    const materials = await createCommittedMaterials([{ type: owner.instance.node.type, extension: { render } }])
    const committedPlan = committedPagePlan([owner.instance])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const mount = (): HTMLElement => {
      const host = document.createElement('div')
      mountCommittedMaterial(host, {
        committedPlan,
        fragmentPlan: owner.fragmentPlan,
        materials,
        pageIndex: 0,
        unit: 'mm',
        zoom: 1,
        viewerMaxNodes: 4,
        browserDom: { maxNodes: 4 },
        diagnostics,
      })
      return host
    }

    expect(mount().textContent).toBe('[material unavailable]')
    expect(mount().textContent).toBe('[material unavailable]')
    expect(render).toHaveBeenCalledTimes(1)
    expect(diagnostics.map(item => item.code)).toEqual([
      'VIEWER_SLOT_INSTANCE_MISSING',
      'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
    ])
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_RENDER_ERROR')).toBe(false)
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_MOUNT_ERROR')).toBe(false)
  })

  it('credits two separately produced core slot trees once each', async () => {
    const owner = committedFacts('separate-slot-owner-instance', committedNode('separate-slot-owner', 'committed-separate-slot-owner'))
    let budget: ViewerRenderContext['renderBudget'] | undefined
    const materials = await createCommittedMaterials([{ type: owner.instance.node.type, extension: {
      render: (_node, context) => {
        budget = context.renderBudget
        return { tree: viewerFragment([
          context.renderSlot('slot:missing'),
          context.renderSlot('slot:missing'),
        ]) }
      },
    } }])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const host = document.createElement('div')

    mountCommittedMaterial(host, {
      committedPlan: committedPagePlan([owner.instance]),
      fragmentPlan: owner.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 5,
      browserDom: { maxNodes: 5 },
      diagnostics,
    })

    expect(host.textContent).toBe('[slot unavailable][slot unavailable]')
    expect(budget?.nodesUsed).toBe(5)
    expect(diagnostics.map(item => item.code)).toEqual([
      'VIEWER_SLOT_INSTANCE_MISSING',
      'VIEWER_SLOT_INSTANCE_MISSING',
    ])
  })

  it('does not carry unused core occurrence credits into a later child audit', async () => {
    const child = committedFacts('unused-credit-child-instance', committedNode('unused-credit-child', 'committed-unused-credit-child'), { embedded: true })
    const slotInstanceKey = 'slot:unused-credit'
    const owner = committedFacts('unused-credit-owner-instance', committedNode('unused-credit-owner', 'committed-unused-credit-owner'), {
      slotChildren: { [slotInstanceKey]: [child.instance.instanceKey] },
      slotInstanceKeys: [slotInstanceKey],
    })
    let captured: ViewerRenderTree | undefined
    let budget: ViewerRenderContext['renderBudget'] | undefined
    const materials = await createCommittedMaterials([
      { type: owner.instance.node.type, extension: { render: (_node, context) => {
        captured = context.renderSlot('slot:missing')
        return { tree: context.renderSlot(slotInstanceKey) }
      } } },
      { type: child.instance.node.type, extension: { render: (_node, context) => {
        budget = context.renderBudget
        return { tree: viewerFragment([captured!, captured!]) }
      } } },
    ])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const host = document.createElement('div')

    mountCommittedMaterial(host, {
      committedPlan: committedPagePlan([owner.instance, child.instance]),
      fragmentPlan: owner.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 10,
      browserDom: { maxNodes: 10 },
      diagnostics,
    })

    expect(host.textContent).toBe('[slot unavailable][slot unavailable]')
    expect(budget?.nodesUsed).toBe(9)
    expect(diagnostics.map(item => item.code)).toEqual(['VIEWER_SLOT_INSTANCE_MISSING'])
  })

  it('discards rolled-back core occurrence credits before a later sibling audit', async () => {
    const failed = committedFacts('rollback-credit-failed-instance', committedNode('rollback-credit-failed', 'committed-rollback-credit-failed'), { embedded: true })
    const later = committedFacts('rollback-credit-later-instance', committedNode('rollback-credit-later', 'committed-rollback-credit-later'), { embedded: true })
    const slotInstanceKey = 'slot:rollback-credit'
    const owner = committedFacts('rollback-credit-owner-instance', committedNode('rollback-credit-owner', 'committed-rollback-credit-owner'), {
      slotChildren: { [slotInstanceKey]: [failed.instance.instanceKey, later.instance.instanceKey] },
      slotInstanceKeys: [slotInstanceKey],
    })
    let captured: ViewerRenderTree | undefined
    let budget: ViewerRenderContext['renderBudget'] | undefined
    const materials = await createCommittedMaterials([
      { type: owner.instance.node.type, extension: { render: (_node, context) => ({ tree: context.renderSlot(slotInstanceKey) }) } },
      { type: failed.instance.node.type, extension: { render: (_node, context) => {
        captured = context.renderSlot('slot:missing')
        try {
          context.renderBudget.reserveNodes('element', 20)
        }
        catch {}
        return { tree: viewerText('unsafe failed child') }
      } } },
      { type: later.instance.node.type, extension: { render: (_node, context) => {
        budget = context.renderBudget
        return { tree: viewerFragment([captured!, captured!]) }
      } } },
    ])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const host = document.createElement('div')

    mountCommittedMaterial(host, {
      committedPlan: committedPagePlan([owner.instance, failed.instance, later.instance]),
      fragmentPlan: owner.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 10,
      browserDom: { maxNodes: 10 },
      diagnostics,
    })

    expect(host.textContent).toBe('[material unavailable][slot unavailable][slot unavailable]')
    expect(budget?.nodesUsed).toBe(9)
    expect(diagnostics.map(item => item.code)).toEqual([
      'VIEWER_SLOT_INSTANCE_MISSING',
      'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
    ])
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_MOUNT_ERROR')).toBe(false)
  })

  it('does not let core slot reservations hide an owner under-reported returned tree', async () => {
    const child = committedFacts('underreported-child-instance', committedNode('underreported-child', 'committed-underreported-child'), { embedded: true })
    const healthy = committedFacts('underreported-healthy-instance', committedNode('underreported-healthy', 'committed-underreported-healthy'))
    const slotInstanceKey = 'slot:underreported'
    const owner = committedFacts('underreported-owner-instance', committedNode('underreported-owner', 'committed-underreported-owner'), {
      slotChildren: { [slotInstanceKey]: [child.instance.instanceKey] },
      slotInstanceKeys: [slotInstanceKey],
    })
    const childRender = vi.fn(() => ({ tree: viewerText('unsafe child') }))
    const healthyRender = vi.fn(() => ({ tree: viewerText('healthy sibling') }))
    const materials = await createCommittedMaterials([
      { type: owner.instance.node.type, extension: { render: (_node, context) => ({
        tree: viewerFragment([viewerText('unsafe owner'), context.renderSlot(slotInstanceKey)]),
      }) } },
      { type: child.instance.node.type, extension: { render: childRender } },
      { type: healthy.instance.node.type, extension: { render: healthyRender } },
    ])
    const committedPlan = committedPagePlan([owner.instance, child.instance, healthy.instance])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const ownerHost = document.createElement('div')
    const healthyHost = document.createElement('div')

    mountCommittedMaterial(ownerHost, {
      committedPlan,
      fragmentPlan: owner.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 4,
      browserDom: { maxNodes: 4 },
      diagnostics,
    })
    mountCommittedMaterial(healthyHost, {
      committedPlan,
      fragmentPlan: healthy.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 4,
      browserDom: { maxNodes: 4 },
      diagnostics,
    })

    expect(ownerHost.textContent).toBe('[material unavailable]')
    expect(ownerHost.textContent).not.toContain('unsafe owner')
    expect(childRender).not.toHaveBeenCalled()
    expect(healthyHost.textContent).toBe('healthy sibling')
    expect(healthyRender).toHaveBeenCalledTimes(1)
    expect(diagnostics.filter(item => item.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toEqual([
      expect.objectContaining({ nodeId: owner.instance.nodeId }),
    ])
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_RENDER_ERROR')).toBe(false)
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_MOUNT_ERROR')).toBe(false)
  })

  it('consumes a reserved child fallback without escalating a maxNodes=2 overflow to the owner', async () => {
    const child = committedFacts('fallback-child-instance', committedNode('fallback-child', 'committed-fallback-child'), { embedded: true })
    const healthy = committedFacts('fallback-healthy-instance', committedNode('fallback-healthy', 'committed-fallback-healthy'))
    const slotInstanceKey = 'slot:fallback'
    const owner = committedFacts('fallback-owner-instance', committedNode('fallback-owner', 'committed-fallback-owner'), {
      slotChildren: { [slotInstanceKey]: [child.instance.instanceKey] },
      slotInstanceKeys: [slotInstanceKey],
    })
    const childRender = vi.fn((_node, context: ViewerRenderContext) => {
      context.renderBudget.reserveNodes('text', 1)
      return { tree: viewerText('child must not commit') }
    })
    const healthyRender = vi.fn(() => ({ tree: viewerText('healthy sibling') }))
    const materials = await createCommittedMaterials([
      { type: owner.instance.node.type, extension: { render: (_node, context) => ({ tree: context.renderSlot(slotInstanceKey) }) } },
      { type: child.instance.node.type, extension: { render: childRender } },
      { type: healthy.instance.node.type, extension: { render: healthyRender } },
    ])
    const committedPlan = committedPagePlan([owner.instance, child.instance, healthy.instance])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const ownerHost = document.createElement('div')
    const healthyHost = document.createElement('div')

    mountCommittedMaterial(ownerHost, {
      committedPlan,
      fragmentPlan: owner.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 2,
      browserDom: { maxNodes: 2 },
      diagnostics,
    })
    mountCommittedMaterial(healthyHost, {
      committedPlan,
      fragmentPlan: healthy.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 2,
      browserDom: { maxNodes: 2 },
      diagnostics,
    })

    expect(ownerHost.textContent).toContain('material unavailable')
    expect(healthyHost.textContent).toBe('healthy sibling')
    expect(childRender).not.toHaveBeenCalled()
    expect(healthyRender).toHaveBeenCalledTimes(1)
    expect(diagnostics.filter(item => item.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toHaveLength(1)
    expect(diagnostics.find(item => item.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toMatchObject({ nodeId: 'fallback-child' })
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_MOUNT_ERROR')).toBe(false)
  })

  it('consumes the reserved nested fallback when a child swallows its render overflow', async () => {
    const child = committedFacts('swallowed-child-instance', committedNode('swallowed-child', 'committed-swallowed-child'), { embedded: true })
    const slotInstanceKey = 'slot:swallowed-child'
    const owner = committedFacts('swallowed-owner-instance', committedNode('swallowed-owner', 'committed-swallowed-owner'), {
      slotChildren: { [slotInstanceKey]: [child.instance.instanceKey] },
      slotInstanceKeys: [slotInstanceKey],
    })
    const childRender = vi.fn((_node, context: ViewerRenderContext) => {
      if (childRender.mock.calls.length === 1) {
        try {
          context.renderBudget.reserveNodes('element', 2)
        }
        catch {}
        return { tree: viewerText('unsafe child tree') }
      }
      return { tree: viewerText('recovered child tree') }
    })
    const materials = await createCommittedMaterials([
      { type: owner.instance.node.type, extension: { render: (_node, context) => ({ tree: context.renderSlot(slotInstanceKey) }) } },
      { type: child.instance.node.type, extension: { render: childRender } },
    ])
    const currentPlan = committedPagePlan([owner.instance, child.instance])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const mount = (plan: CommittedPagePlan): HTMLElement => {
      const host = document.createElement('div')
      mountCommittedMaterial(host, {
        committedPlan: plan,
        fragmentPlan: owner.fragmentPlan,
        materials,
        pageIndex: 0,
        unit: 'mm',
        zoom: 1,
        viewerMaxNodes: 4,
        browserDom: { maxNodes: 4 },
        diagnostics,
      })
      return host
    }

    const firstHost = mount(currentPlan)
    const samePlanHost = mount(currentPlan)
    const newPlanHost = mount(committedPagePlan([owner.instance, child.instance]))

    expect(firstHost.textContent).toBe('[material unavailable]')
    expect(samePlanHost.textContent).toBe('[material unavailable]')
    expect(newPlanHost.textContent).toBe('recovered child tree')
    expect(childRender).toHaveBeenCalledTimes(2)
    expect(diagnostics.filter(item => item.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toHaveLength(1)
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_RENDER_ERROR')).toBe(false)
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_MOUNT_ERROR')).toBe(false)
  })

  it('quarantines a render-overflow child only for the current committed plan identity', async () => {
    const child = committedFacts('plan-quarantine-child-instance', committedNode('plan-quarantine-child', 'committed-plan-quarantine-child'), { embedded: true })
    const healthy = committedFacts('plan-quarantine-healthy-instance', committedNode('plan-quarantine-healthy', 'committed-plan-quarantine-healthy'))
    const slotInstanceKey = 'slot:plan-quarantine'
    const owner = committedFacts('plan-quarantine-owner-instance', committedNode('plan-quarantine-owner', 'committed-plan-quarantine-owner'), {
      slotChildren: { [slotInstanceKey]: [child.instance.instanceKey] },
      slotInstanceKeys: [slotInstanceKey],
    })
    const childRender = vi.fn((_node, context: ViewerRenderContext) => {
      context.renderBudget.reserveNodes('element', 2)
      return { tree: viewerText('child overflow') }
    })
    const healthyRender = vi.fn(() => ({ tree: viewerText('healthy root') }))
    const materials = await createCommittedMaterials([
      { type: owner.instance.node.type, extension: { render: (_node, context) => ({ tree: context.renderSlot(slotInstanceKey) }) } },
      { type: child.instance.node.type, extension: { render: childRender } },
      { type: healthy.instance.node.type, extension: { render: healthyRender } },
    ])
    const currentPlan = committedPagePlan([owner.instance, child.instance, healthy.instance])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const mountOwner = (plan: CommittedPagePlan): void => {
      mountCommittedMaterial(document.createElement('div'), {
        committedPlan: plan,
        fragmentPlan: owner.fragmentPlan,
        materials,
        pageIndex: 0,
        unit: 'mm',
        zoom: 1,
        viewerMaxNodes: 4,
        browserDom: { maxNodes: 4 },
        diagnostics,
      })
    }

    mountOwner(currentPlan)
    mountOwner(currentPlan)
    mountCommittedMaterial(document.createElement('div'), {
      committedPlan: currentPlan,
      fragmentPlan: healthy.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 4,
      browserDom: { maxNodes: 4 },
      diagnostics,
    })

    expect(childRender).toHaveBeenCalledTimes(1)
    expect(healthyRender).toHaveBeenCalledTimes(1)
    expect(diagnostics.filter(item => item.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toHaveLength(1)

    mountOwner(committedPagePlan([owner.instance, child.instance, healthy.instance]))

    expect(childRender).toHaveBeenCalledTimes(2)
    expect(diagnostics.filter(item => item.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toHaveLength(2)
  })

  it('continues past multiple same-plan quarantined children to later healthy siblings', async () => {
    const badA = committedFacts('continue-bad-a-instance', committedNode('continue-bad-a', 'committed-continue-bad'), { embedded: true })
    const badB = committedFacts('continue-bad-b-instance', committedNode('continue-bad-b', 'committed-continue-bad'), { embedded: true })
    const healthyA = committedFacts('continue-healthy-a-instance', committedNode('continue-healthy-a', 'committed-continue-healthy'), { embedded: true })
    const healthyB = committedFacts('continue-healthy-b-instance', committedNode('continue-healthy-b', 'committed-continue-healthy'), { embedded: true })
    const slotInstanceKey = 'slot:continue-quarantine'
    const owner = committedFacts('continue-owner-instance', committedNode('continue-owner', 'committed-continue-owner'), {
      slotChildren: {
        [slotInstanceKey]: [
          badA.instance.instanceKey,
          healthyA.instance.instanceKey,
          badB.instance.instanceKey,
          healthyB.instance.instanceKey,
        ],
      },
      slotInstanceKeys: [slotInstanceKey],
    })
    const badRender = vi.fn((_node, context: ViewerRenderContext) => {
      context.renderBudget.reserveNodes('element', 20)
      return { tree: viewerText('unsafe bad') }
    })
    const healthyRender = vi.fn((node: MaterialNode) => ({ tree: viewerText(node.id) }))
    const materials = await createCommittedMaterials([
      { type: owner.instance.node.type, extension: { render: (_node, context) => ({ tree: context.renderSlot(slotInstanceKey) }) } },
      { type: badA.instance.node.type, extension: { render: badRender } },
      { type: healthyA.instance.node.type, extension: { render: healthyRender } },
    ])
    const committedPlan = committedPagePlan([
      owner.instance,
      badA.instance,
      healthyA.instance,
      badB.instance,
      healthyB.instance,
    ])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const mount = (): HTMLElement => {
      const host = document.createElement('div')
      mountCommittedMaterial(host, {
        committedPlan,
        fragmentPlan: owner.fragmentPlan,
        materials,
        pageIndex: 0,
        unit: 'mm',
        zoom: 1,
        viewerMaxNodes: 20,
        browserDom: { maxNodes: 20 },
        diagnostics,
      })
      return host
    }

    const firstHost = mount()
    const secondHost = mount()

    expect(firstHost.textContent).toBe('[material unavailable]continue-healthy-a[material unavailable]continue-healthy-b')
    expect(secondHost.textContent).toBe(firstHost.textContent)
    expect(badRender).toHaveBeenCalledTimes(2)
    expect(healthyRender).toHaveBeenCalledTimes(4)
    expect(diagnostics.filter(item => item.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toHaveLength(2)
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_RENDER_ERROR')).toBe(false)
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_MOUNT_ERROR')).toBe(false)
  })

  it('quarantines a swallowed root overflow before auditing or mounting its returned tree', async () => {
    const source = committedFacts('swallowed-root-instance', committedNode('swallowed-root', 'committed-swallowed-root'))
    const render = vi.fn((_node, context: ViewerRenderContext) => {
      if (render.mock.calls.length === 1) {
        try {
          context.renderBudget.reserveNodes('element', 2)
        }
        catch {}
        return { tree: viewerText('unsafe first tree') }
      }
      return { tree: viewerText('recovered tree') }
    })
    const materials = await createCommittedMaterials([
      { type: source.instance.node.type, extension: { render } },
    ])
    const currentPlan = committedPagePlan([source.instance])
    const diagnostics: ViewerDiagnosticEvent[] = []
    const mount = (plan: CommittedPagePlan): HTMLElement => {
      const host = document.createElement('div')
      mountCommittedMaterial(host, {
        committedPlan: plan,
        fragmentPlan: source.fragmentPlan,
        materials,
        pageIndex: 0,
        unit: 'mm',
        zoom: 1,
        viewerMaxNodes: 1,
        browserDom: { maxNodes: 1 },
        diagnostics,
      })
      return host
    }

    const firstHost = mount(currentPlan)
    const samePlanHost = mount(currentPlan)
    const newPlanHost = mount(committedPagePlan([source.instance]))

    expect(firstHost.textContent).toBe('[material unavailable]')
    expect(samePlanHost.textContent).toBe('[material unavailable]')
    expect(newPlanHost.textContent).toBe('recovered tree')
    expect(render).toHaveBeenCalledTimes(2)
    expect(diagnostics.filter(item => item.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toHaveLength(1)
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_RENDER_ERROR')).toBe(false)
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_MOUNT_ERROR')).toBe(false)
  })

  it.each(['empty', 'large'] as const)(
    'does not audit a swallowed-overflow %s tree before using the root sentinel',
    async (treeKind) => {
      const source = committedFacts(`swallowed-${treeKind}-instance`, committedNode(`swallowed-${treeKind}`, `committed-swallowed-${treeKind}`))
      let childReads = 0
      const child = viewerText('unsafe child')
      const largeTree = Object.freeze({
        kind: 'fragment',
        children: new Proxy(Array.from({ length: 10 }).fill(child), {
          get(target, property, receiver) {
            if (typeof property === 'string' && /^(?:0|[1-9]\d*)$/.test(property))
              childReads++
            return Reflect.get(target, property, receiver)
          },
        }),
      }) as ViewerRenderTree
      const unsafeTree = treeKind === 'empty' ? viewerFragment([]) : largeTree
      const render = vi.fn((_node, context: ViewerRenderContext) => {
        try {
          context.renderBudget.reserveNodes('element', 2)
        }
        catch {}
        return { tree: unsafeTree }
      })
      const materials = await createCommittedMaterials([
        { type: source.instance.node.type, extension: { render } },
      ])
      const diagnostics: ViewerDiagnosticEvent[] = []
      const host = document.createElement('div')

      mountCommittedMaterial(host, {
        committedPlan: committedPagePlan([source.instance]),
        fragmentPlan: source.fragmentPlan,
        materials,
        pageIndex: 0,
        unit: 'mm',
        zoom: 1,
        viewerMaxNodes: 1,
        browserDom: { maxNodes: 1 },
        diagnostics,
      })

      expect(host.textContent).toBe('[material unavailable]')
      expect(render).toHaveBeenCalledTimes(1)
      expect(childReads).toBe(0)
      expect(diagnostics.filter(item => item.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toHaveLength(1)
      expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_RENDER_ERROR')).toBe(false)
      expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_MOUNT_ERROR')).toBe(false)
    },
  )

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

  it('stops iterating slot children at the first over-budget host mount', async () => {
    const child = committedFacts('bounded-child', committedNode('bounded-child', 'committed-bounded-child'), { embedded: true })
    const slotInstanceKey = 'slot:bounded'
    const ownerFacts = committedFacts('bounded-owner', committedNode('bounded-owner', 'committed-bounded-owner'), {
      slotChildren: { [slotInstanceKey]: [] },
      slotInstanceKeys: [slotInstanceKey],
    })
    let childKeyReads = 0
    const childKeys = new Proxy(Array.from({ length: 50 }).fill(child.instance.instanceKey) as string[], {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^(?:0|[1-9]\d*)$/.test(property))
          childKeyReads++
        return Reflect.get(target, property, receiver)
      },
    })
    const ownerInstance: RuntimeMaterialInstancePlan = Object.freeze({
      ...ownerFacts.instance,
      slotChildren: Object.freeze({ [slotInstanceKey]: childKeys }),
    })
    const childRender = vi.fn(() => ({ tree: viewerText('must-not-mount') }))
    const materials = await createCommittedMaterials([
      { type: ownerInstance.node.type, extension: { render: (_node, context) => ({ tree: context.renderSlot(slotInstanceKey) }) } },
      { type: child.instance.node.type, extension: { render: childRender } },
    ])
    const host = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []

    mountCommittedMaterial(host, {
      committedPlan: committedPagePlan([ownerInstance, child.instance]),
      fragmentPlan: ownerFacts.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 2,
      browserDom: { maxNodes: 2 },
      diagnostics,
    })

    expect(childKeyReads).toBe(2)
    expect(childRender).not.toHaveBeenCalled()
    expect(host.textContent).toContain('material unavailable')
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED' })])
  })

  it('indexes declared slot keys once for repeated mapped and missing lookups', async () => {
    const mappedSlotKey = 'slot:indexed'
    const missingSlotKey = 'slot:missing'
    const ownerFacts = committedFacts('indexed-owner', committedNode('indexed-owner', 'committed-indexed-owner'), {
      slotChildren: { [mappedSlotKey]: [] },
      slotInstanceKeys: [mappedSlotKey],
    })
    let slotBoxReads = 0
    const slotBoxes = new Proxy(Array.from({ length: 64 }, (_, index) => Object.freeze({
      slotId: `slot-${index}`,
      slotInstanceKey: index === 63 ? mappedSlotKey : `slot:unused:${index}`,
      box: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
      ownership: 'managed' as const,
      clip: true,
    })), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^(?:0|[1-9]\d*)$/.test(property))
          slotBoxReads++
        return Reflect.get(target, property, receiver)
      },
    })
    const ownerInstance: RuntimeMaterialInstancePlan = Object.freeze({
      ...ownerFacts.instance,
      layoutPlan: Object.freeze({ ...ownerFacts.instance.layoutPlan, slotBoxes }),
    })
    const materials = await createCommittedMaterials([{ type: ownerInstance.node.type, extension: {
      render: (_node, context) => ({
        tree: viewerFragment([
          ...Array.from({ length: 10 }, () => context.renderSlot(mappedSlotKey)),
          context.renderSlot(missingSlotKey),
        ]),
      }),
    } }])
    const host = document.createElement('div')
    const diagnostics: ViewerDiagnosticEvent[] = []

    mountCommittedMaterial(host, {
      committedPlan: committedPagePlan([ownerInstance]),
      fragmentPlan: ownerFacts.fragmentPlan,
      materials,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      viewerMaxNodes: 100,
      browserDom: { maxNodes: 100 },
      diagnostics,
    })

    expect(slotBoxReads).toBe(64)
    expect(host.textContent).toContain('slot unavailable')
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'VIEWER_SLOT_INSTANCE_MISSING' })])
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
      'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
    ])
  })
})

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
