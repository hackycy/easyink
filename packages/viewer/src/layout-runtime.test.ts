import type { LayoutDocument, MaterialLayoutPlan, MaterialMeasureRequest, PaginationResult } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { EffectiveOutputState } from './effective-output-state'
import type { LayoutRuntimeDependencies, MaterialMeasurementBudget, RuntimeMaterialInstancePlan } from './layout-runtime'
import type { ResolvedRuntimeModel } from './runtime-model-resolver'
import { createNonFragmentingMaterialPlans, MeasureService, runPagination, viewerText } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { runLayoutPipeline } from '../../core/src/layout-strategy'
import {
  createDefaultLayoutRuntime,
  createLayoutRuntime,
  createMaterialLayoutBudgetToken,
  createMaterialMeasureNodes,
  createMaterialRenderBudgetToken,
  flattenMeasurableNodes,

} from './layout-runtime'
import { ProfileMaterialRuntime } from './material-runtime'
import { createBoundedMeasureScheduler } from './measure-scheduler'
import { createRuntimeModelResolutionCache } from './runtime-model-resolver'

function node(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'n1',
    type: 'box',
    x: 2,
    y: 3,
    width: 10,
    height: 7,
    modelVersion: 1,
    model: { nested: { values: [1] } },
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
    ...overrides,
  }
}

function document(elements: MaterialNode[] = []): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 80, height: 60 },
    guides: { x: [], y: [] },
    elements,
  }
}

function materialPlan(source = node()): MaterialLayoutPlan {
  return createNonFragmentingMaterialPlans({
    instanceKey: source.id,
    nodeId: source.id,
    nodeRevision: 1,
    constraintKey: '80:60:mm:horizontal-tb',
    pageIndex: 0,
    borderBox: { x: source.x, y: source.y, width: 18, height: 11 },
    fragmentBox: { x: source.x, y: source.y, width: 18, height: 11 },
  }).layoutPlan
}

function pipelineDependencies(calls: string[] = []): LayoutRuntimeDependencies {
  return {
    resolveEffectiveOutput: () => {
      calls.push('output')
      return new Map([['n1', { visibility: 'include' as const, shouldMeasure: true, shouldPaint: true }]])
    },
    resolveRuntimeModels: async () => {
      calls.push('bindings')
      return new Map()
    },
    prepareResources: async () => {
      calls.push('resources')
      return 4
    },
    measureNodes: async () => {
      calls.push('measure')
      return { plans: new Map(), instances: new Map() }
    },
    layoutDocument: () => {
      calls.push('layout')
      return { width: 80, height: 60, fragments: [], diagnostics: [] }
    },
    paginateDocument: () => {
      calls.push('paginate')
      return { mode: 'fixed', pages: [], diagnostics: [] }
    },
  }
}

const runtimeInput = {
  document: document(),
  nodeStates: new Map(),
  documentRevision: 1,
  data: {},
  dataRevision: 2,
}

describe('createLayoutRuntime', () => {
  it('runs output, bindings, resources, measure, layout, and paginate in exact order', async () => {
    const calls: string[] = []
    const committed = await createLayoutRuntime(pipelineDependencies(calls))
      .plan(runtimeInput, new AbortController().signal)

    expect(calls).toEqual(['output', 'bindings', 'resources', 'measure', 'layout', 'paginate'])
    expect(committed).toMatchObject({ documentRevision: 1, dataRevision: 2, resourceRevision: 4 })
  })

  it.each(['output', 'bindings', 'resources', 'measure', 'layout', 'paginate'] as const)(
    'checks abort after the %s stage and does not run a later stage',
    async (abortStage) => {
      const controller = new AbortController()
      const reason = new Error(`aborted after ${abortStage}`)
      const calls: string[] = []
      const base = pipelineDependencies()
      const wrap = <T extends (...args: never[]) => unknown>(name: string, fn: T): T => ((...args: never[]) => {
        calls.push(name)
        const result = fn(...args)
        if (result instanceof Promise) {
          return result.then((value) => {
            if (name === abortStage)
              controller.abort(reason)
            return value
          })
        }
        if (name === abortStage)
          controller.abort(reason)
        return result
      }) as T
      const deps: LayoutRuntimeDependencies = {
        resolveEffectiveOutput: wrap('output', base.resolveEffectiveOutput as never),
        resolveRuntimeModels: wrap('bindings', base.resolveRuntimeModels as never),
        prepareResources: wrap('resources', base.prepareResources as never),
        measureNodes: wrap('measure', base.measureNodes as never),
        layoutDocument: wrap('layout', base.layoutDocument as never),
        paginateDocument: wrap('paginate', base.paginateDocument as never),
      }

      await expect(createLayoutRuntime(deps).plan(runtimeInput, controller.signal)).rejects.toBe(reason)
      expect(calls.at(-1)).toBe(abortStage)
    },
  )

  it('checks an already-aborted signal before publishing or invoking any stage', async () => {
    const calls: string[] = []
    const controller = new AbortController()
    const reason = new Error('already superseded')
    controller.abort(reason)
    await expect(createLayoutRuntime(pipelineDependencies(calls)).plan(runtimeInput, controller.signal)).rejects.toBe(reason)
    expect(calls).toEqual([])
  })

  it.each([
    ['documentRevision', -1],
    ['documentRevision', 1.5],
    ['dataRevision', Number.MAX_SAFE_INTEGER + 1],
  ] as const)('rejects invalid %s before stages', async (field, value) => {
    const calls: string[] = []
    await expect(createLayoutRuntime(pipelineDependencies(calls)).plan({ ...runtimeInput, [field]: value }, new AbortController().signal))
      .rejects
      .toThrow('LAYOUT_RUNTIME_REVISION_INVALID')
    expect(calls).toEqual([])
  })

  it('publishes recursively isolated frozen pages, map values, instances, and strict JSON diagnostics', async () => {
    const sourceNode = node()
    const plan = materialPlan(sourceNode)
    const instance: RuntimeMaterialInstancePlan = {
      instanceKey: 'n1',
      nodeId: 'n1',
      node: sourceNode,
      scopeKey: 'document',
      scopeData: { rows: [{ value: 1 }] },
      status: 'ready',
      resolvedModel: { nested: { values: [1] } },
      layoutPlan: plan,
    }
    const fragment = {
      node: sourceNode,
      plan,
    }
    const layout: LayoutDocument = {
      width: 80,
      height: 60,
      fragments: [fragment],
      diagnostics: [{ code: 'LAYOUT_NOTE', severity: 'info', message: 'layout', stage: 'layout', detail: { nested: [1] } }],
    }
    const pagination: PaginationResult = {
      mode: 'fixed',
      pages: [{ index: 0, sheetIndex: 0, width: 80, height: 60, yOffset: 0, fragments: [fragment], pageContext: { pageNumber: 1, totalPages: 1 } }],
      diagnostics: [{ code: 'PAGE_NOTE', severity: 'warning', message: 'page', stage: 'pagination', detail: { values: [2] } }],
    }
    const deps: LayoutRuntimeDependencies = {
      ...pipelineDependencies(),
      measureNodes: async () => ({ plans: new Map([['n1', plan]]), instances: new Map([['n1', instance]]) }),
      layoutDocument: () => layout,
      paginateDocument: () => pagination,
    }

    const committed = await createLayoutRuntime(deps).plan({ ...runtimeInput, document: document([sourceNode]) }, new AbortController().signal)
    sourceNode.model.nested = { values: [9] }
    ;(instance.scopeData.rows as Array<{ value: number }>)[0]!.value = 9
    ;((instance.resolvedModel.nested as { values: number[] }).values)[0] = 9
    ;(pagination.pages[0]!.pageContext as { totalPages: number }).totalPages = 9
    ;((layout.diagnostics[0]!.detail as { nested: number[] }).nested)[0] = 9

    expect(committed.pages[0]!.pageContext.totalPages).toBe(1)
    expect(committed.pages[0]!.fragments[0]!.node.model).toEqual({ nested: { values: [1] } })
    expect(committed.runtimeInstances.get('n1')?.scopeData).toEqual({ rows: [{ value: 1 }] })
    expect(committed.runtimeInstances.get('n1')?.resolvedModel).toEqual({ nested: { values: [1] } })
    expect(committed.diagnostics).toEqual([
      expect.objectContaining({ detail: { nested: [1] } }),
      expect.objectContaining({ detail: { values: [2] } }),
    ])
    expect(Object.isFrozen((committed.pages[0]!.fragments[0]!.node.model as { nested: object }).nested)).toBe(true)
    expect(Object.isFrozen(committed.runtimeInstances.get('n1')?.scopeData.rows as unknown[])).toBe(true)
    expect(Object.isFrozen(committed.runtimeInstances.get('n1')?.resolvedModel.nested as object)).toBe(true)
    expect('set' in committed.outputStates).toBe(false)
    expect('set' in committed.runtimeInstances).toBe(false)
    expect(Object.isFrozen(sourceNode.model)).toBe(false)
  })

  it('rejects non-JSON diagnostics instead of retaining capabilities', async () => {
    const deps: LayoutRuntimeDependencies = {
      ...pipelineDependencies(),
      layoutDocument: () => ({
        width: 80,
        height: 60,
        fragments: [],
        diagnostics: [{ code: 'BAD', severity: 'error', message: 'bad', stage: 'layout', detail: { run: () => 1 } }],
      }),
    }
    await expect(createLayoutRuntime(deps).plan(runtimeInput, new AbortController().signal))
      .rejects
      .toThrow('LAYOUT_RUNTIME_DIAGNOSTIC_INVALID')
  })
})

describe('plan-backed core layout', () => {
  it('uses plan geometry without mutating measured width or height into schema nodes', () => {
    const source = node({ width: 10, height: 7 })
    const schema = document([source])
    const before = structuredClone(schema)
    const plan = materialPlan(source)

    const layout = runLayoutPipeline(schema, { plans: new Map([['n1', plan]]) })

    expect(Object.keys(layout.fragments[0]!)).toEqual(['node', 'plan'])
    expect(layout.fragments[0]).toMatchObject({
      node: { width: 10, height: 7 },
      plan: { borderBox: { width: 18, height: 11 } },
    })
    expect(schema).toEqual(before)
    expect(source.width).toBe(10)
    expect(source.height).toBe(7)
  })

  it('skips missing removed plans without expanding continuous layout while reserved plans retain space', () => {
    const removed = node({ id: 'removed', y: 1_000, height: 100 })
    const reserved = node({ id: 'reserved', y: 10, height: 20, output: { visibility: 'reserve' } })
    const schema: DocumentSchema = {
      ...document([removed, reserved]),
      page: {
        mode: 'continuous',
        width: 80,
        height: 60,
        pagination: { strategy: 'none' },
        reflow: { strategy: 'measure-only', preserveTrailingGap: false },
      },
    }
    const reservedBox = { x: reserved.x, y: reserved.y, width: reserved.width, height: reserved.height }
    const reservedPlan = createNonFragmentingMaterialPlans({
      instanceKey: 'reserved',
      nodeId: 'reserved',
      nodeRevision: 1,
      constraintKey: '80:60:mm:horizontal-tb',
      pageIndex: 0,
      borderBox: reservedBox,
      fragmentBox: reservedBox,
    }).layoutPlan

    const layout = runLayoutPipeline(schema, { plans: new Map([['reserved', reservedPlan]]) })
    const pagination = runPagination(schema, layout)

    expect(layout.fragments.map(fragment => fragment.plan.nodeId)).toEqual(['reserved'])
    expect(layout.height).toBe(60)
    expect(pagination.pages).toHaveLength(1)
    expect(pagination.pages[0]!.height).toBe(60)
  })
})

const measurementBudget: MaterialMeasurementBudget = {
  maxRuntimeRows: 4,
  maxLayoutFacts: 8,
  maxDataNodes: 100,
  maxDataStringBytes: 1_000,
  maxKeyTokens: 20,
  maxKeyBytes: 200,
}

function readyModel(source: MaterialNode, overrides: Partial<ResolvedRuntimeModel> = {}): ResolvedRuntimeModel {
  return {
    instanceKey: source.id,
    nodeId: source.id,
    scopeKey: 'document',
    nodeRevision: 5,
    dataRevision: 2,
    status: 'ready',
    value: source.model,
    ...overrides,
  }
}

function createViewerFacet(measure?: (request: MaterialMeasureRequest) => Promise<MaterialLayoutPlan>) {
  return () => ({
    extension: { render: () => ({ tree: viewerText('material') }) },
    capabilities: {},
    ...(measure ? { layout: { measure } } : {}),
  })
}

async function measurementHarness(input: {
  manifests: ReturnType<typeof createTestMaterialManifest>[]
  maxInFlight?: number
  measureCacheEntries?: number
  budget?: MaterialMeasurementBudget
  provider?: Parameters<typeof createMaterialMeasureNodes>[0]['preparedCollections']
}) {
  const profile = createTestCompiledMaterialProfile(input.manifests)
  const materials = new ProfileMaterialRuntime(profile)
  await materials.prepare(input.manifests.map(manifest => manifest.type))
  const measureService = new MeasureService({ maxEntries: input.measureCacheEntries ?? 32 })
  const reportDiagnostic = vi.fn()
  const measureNodes = createMaterialMeasureNodes({
    profile,
    materials,
    measureService,
    runtimeModelCache: createRuntimeModelResolutionCache(profile),
    scheduler: createBoundedMeasureScheduler(input.maxInFlight ?? 2),
    textMeasure: vi.fn(async () => ({ width: 1, height: 2 })),
    budget: input.budget ?? measurementBudget,
    preparedCollections: input.provider,
    reportDiagnostic,
  })
  return { profile, materials, measureService, measureNodes, reportDiagnostic }
}

function measureInput(nodes: MaterialNode[], runtimeModels: ReadonlyMap<string, ResolvedRuntimeModel>, resourceRevision = 9) {
  const outputStates = new Map<string, EffectiveOutputState>()
  const visit = (item: MaterialNode): void => {
    outputStates.set(item.id, { visibility: 'include', shouldMeasure: true, shouldPaint: true })
    for (const children of Object.values(item.slots)) {
      for (const child of children)
        visit(child)
    }
  }
  nodes.forEach(visit)
  return {
    document: document(nodes),
    nodeStates: new Map(),
    documentRevision: 5,
    data: { title: 'bound', rows: [{ id: 1 }] },
    dataRevision: 2,
    outputStates,
    runtimeModels,
    resourceRevision,
  }
}

describe('material measurement integration', () => {
  it('uses the active layout facet authoritatively and passes exact services and revisions', async () => {
    const source = node({ type: 'custom', bindings: { title: { sourceId: 'invoice', fieldPath: 'title' } } })
    let captured: MaterialMeasureRequest | undefined
    const measure = vi.fn(async (request: MaterialMeasureRequest) => {
      captured = request
      expect(request.resolveBinding('title')).toEqual({ status: 'resolved', value: 'bound' })
      await expect(request.measureText({
        text: 'x',
        availableWidth: 10,
        unit: 'mm',
        style: { fontFamily: 'sans-serif', fontSize: 3, lineHeight: 1.2, whiteSpace: 'normal', overflowWrap: 'normal' },
      })).resolves.toEqual({ width: 1, height: 2 })
      return {
        instanceKey: request.instanceKey,
        nodeId: request.node.id,
        nodeRevision: request.nodeRevision,
        constraintKey: '10:60:mm:horizontal-tb',
        borderBox: { x: request.node.x, y: request.node.y, width: 10, height: 15 },
        contentBox: { x: request.node.x, y: request.node.y, width: 10, height: 15 },
        slotBoxes: [],
        breakOpportunities: [],
        diagnostics: [],
      }
    })
    const manifest = createTestMaterialManifest({
      type: 'custom',
      binding: { kind: 'ports', ports: [{ id: 'title', key: { kind: 'exact', value: 'title' }, role: 'semantic', valueShape: 'scalar', formatEditor: false }] },
      viewer: createViewerFacet(measure),
    })
    const harness = await measurementHarness({ manifests: [manifest] })
    const models = new Map([['n1', readyModel(source)]])

    const measured = await harness.measureNodes(measureInput(source ? [source] : [], models), new AbortController().signal)

    expect(measure).toHaveBeenCalledTimes(1)
    expect(captured).toMatchObject({
      mode: 'authoritative',
      instanceKey: 'n1',
      nodeRevision: 5,
      dataRevision: 2,
      resourceRevision: 9,
      constraints: { availableWidth: 10, availableHeight: 60, unit: 'mm', writingMode: 'horizontal-tb' },
    })
    expect(captured?.schedule.maxInFlight).toBe(2)
    expect(measured.plans.get('n1')?.borderBox.height).toBe(15)
    expect(measured.instances.get('n1')).toMatchObject({ status: 'ready', scopeKey: 'document' })
    expect(Object.isFrozen(captured?.node)).toBe(true)
    expect(Object.isFrozen(captured?.resolvedModel)).toBe(true)
  })

  it('routes exact profile, mode, instance, node, revisions, resource, and constraint through MeasureService cache', async () => {
    const source = node({ type: 'cached' })
    const measure = vi.fn(async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => ({
      instanceKey: request.instanceKey,
      nodeId: request.node.id,
      nodeRevision: request.nodeRevision,
      constraintKey: '10:60:mm:horizontal-tb',
      borderBox: { x: 2, y: 3, width: 10, height: 7 },
      contentBox: { x: 2, y: 3, width: 10, height: 7 },
      slotBoxes: [],
      breakOpportunities: [],
      diagnostics: [],
    }))
    const harness = await measurementHarness({ manifests: [createTestMaterialManifest({ type: 'cached', viewer: createViewerFacet(measure) })] })
    const models = new Map([['n1', readyModel(source)]])

    await harness.measureNodes(measureInput([source], models, 9), new AbortController().signal)
    await harness.measureNodes(measureInput([source], models, 9), new AbortController().signal)
    await harness.measureNodes(measureInput([source], models, 10), new AbortController().signal)
    await harness.measureNodes(measureInput([source], new Map([['n1', readyModel(source, { nodeRevision: 6 })]]), 10), new AbortController().signal)

    expect(measure).toHaveBeenCalledTimes(3)
  })

  it('uses core nonfragmenting geometry for an absent adapter or quarantined model without entering material code', async () => {
    const plain = node({ id: 'plain', type: 'plain', width: 12, height: 8 })
    const quarantined = node({ id: 'bad', type: 'bad', width: 13, height: 9 })
    const forbidden = vi.fn(async () => {
      throw new Error('must not enter material')
    })
    const harness = await measurementHarness({ manifests: [
      createTestMaterialManifest({ type: 'plain', viewer: createViewerFacet() }),
      createTestMaterialManifest({ type: 'bad', viewer: createViewerFacet(forbidden) }),
    ] })
    const models = new Map<string, ResolvedRuntimeModel>([
      ['plain', readyModel(plain, { instanceKey: 'plain', nodeId: 'plain' })],
      ['bad', readyModel(quarantined, {
        instanceKey: 'bad',
        nodeId: 'bad',
        status: 'quarantined',
        value: {},
        diagnostic: { code: 'QUARANTINED', nodeId: 'bad', message: 'bad' },
      })],
    ])

    const measured = await harness.measureNodes(measureInput([plain, quarantined], models), new AbortController().signal)

    expect(forbidden).not.toHaveBeenCalled()
    expect(measured.plans.get('plain')?.borderBox).toMatchObject({ width: 12, height: 8 })
    expect(measured.plans.get('bad')?.borderBox).toMatchObject({ width: 13, height: 9 })
    expect(measured.instances.get('bad')?.status).toBe('quarantined')
  })

  it('restores fallback embedded fragments on a cache hit and clears paired artifacts with the measurement runtime', async () => {
    const source = node({ id: 'fallback', type: 'fallback' })
    const harness = await measurementHarness({
      manifests: [createTestMaterialManifest({ type: 'fallback', viewer: createViewerFacet() })],
    })
    const input = measureInput([source], new Map([
      ['fallback', readyModel(source, { instanceKey: 'fallback', nodeId: 'fallback' })],
    ]))

    const first = await harness.measureNodes(input, new AbortController().signal)
    const second = await harness.measureNodes(input, new AbortController().signal)

    expect(first.instances.get('fallback')?.embeddedFragmentPlan).toBeDefined()
    expect(second.instances.get('fallback')?.embeddedFragmentPlan).toEqual(
      first.instances.get('fallback')?.embeddedFragmentPlan,
    )

    harness.measureNodes.clear()
    const afterClear = await harness.measureNodes(input, new AbortController().signal)
    expect(afterClear.instances.get('fallback')?.embeddedFragmentPlan).toBeDefined()
  })

  it('disposes the paired plan and artifact caches and rejects later measurement', async () => {
    const source = node({ id: 'disposed', type: 'disposed' })
    const harness = await measurementHarness({
      manifests: [createTestMaterialManifest({ type: 'disposed', viewer: createViewerFacet() })],
    })
    const input = measureInput([source], new Map([
      ['disposed', readyModel(source, { instanceKey: 'disposed', nodeId: 'disposed' })],
    ]))
    await harness.measureNodes(input, new AbortController().signal)

    await harness.measureNodes.dispose()

    expect(harness.measureService.size).toBe(0)
    await expect(harness.measureNodes(input, new AbortController().signal))
      .rejects
      .toThrow('MATERIAL_MEASURE_RUNTIME_DISPOSED')
  })

  it('measures nested slots with injective identities, fresh budgets, shared services, and union content bounds', async () => {
    const childA = node({ id: 'a', type: 'child', x: 2, y: 3, width: 5, height: 7 })
    const childB = node({ id: 'b', type: 'child', x: 10, y: 1, width: 2, height: 4 })
    const owner = node({ id: 'owner', type: 'owner', slots: { content: [childA, childB] } })
    const budgets: MaterialMeasureRequest['budget'][] = []
    let slotResult: Awaited<ReturnType<MaterialMeasureRequest['measureSlot']>> | undefined
    const childMeasure = async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => {
      budgets.push(request.budget)
      request.budget.reserveRuntimeRows(1)
      return {
        instanceKey: request.instanceKey,
        nodeId: request.node.id,
        nodeRevision: request.nodeRevision,
        constraintKey: request.constraints.availableWidth === 10 ? '10:60:mm:horizontal-tb' : `${request.constraints.availableWidth}:60:mm:horizontal-tb`,
        borderBox: { x: request.node.x, y: request.node.y, width: request.node.width, height: request.node.height },
        contentBox: { x: request.node.x, y: request.node.y, width: request.node.width, height: request.node.height },
        slotBoxes: [],
        breakOpportunities: [],
        diagnostics: [],
      }
    }
    const ownerMeasure = async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => {
      budgets.push(request.budget)
      request.budget.reserveRuntimeRows(1)
      slotResult = await request.measureSlot({ slot: 'content', scope: request.scope, constraints: request.constraints }, request.signal)
      return {
        instanceKey: request.instanceKey,
        nodeId: request.node.id,
        nodeRevision: request.nodeRevision,
        constraintKey: '10:60:mm:horizontal-tb',
        borderBox: { x: request.node.x, y: request.node.y, width: request.node.width, height: request.node.height },
        contentBox: { x: request.node.x, y: request.node.y, width: request.node.width, height: request.node.height },
        slotBoxes: [],
        breakOpportunities: [],
        diagnostics: [],
      }
    }
    const harness = await measurementHarness({
      budget: { ...measurementBudget, maxRuntimeRows: 1 },
      manifests: [
        createTestMaterialManifest({
          type: 'owner',
          slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
          viewer: createViewerFacet(ownerMeasure),
        }),
        createTestMaterialManifest({ type: 'child', viewer: createViewerFacet(childMeasure) }),
      ],
    })

    const measured = await harness.measureNodes(measureInput([owner], new Map([['owner', readyModel(owner, { instanceKey: 'owner', nodeId: 'owner' })]])), new AbortController().signal)

    expect(slotResult?.contentBounds).toEqual({ x: 2, y: 1, width: 10, height: 9 })
    expect(slotResult?.childPlans).toHaveLength(2)
    expect(new Set(slotResult?.childPlans.map(plan => plan.instanceKey)).size).toBe(2)
    expect(slotResult?.instanceKey).not.toBe(slotResult?.childPlans[0]?.instanceKey)
    expect(new Set(budgets).size).toBe(3)
    expect([...measured.instances.keys()]).toEqual(expect.arrayContaining(['owner', slotResult!.childPlans[0]!.instanceKey, slotResult!.childPlans[1]!.instanceKey]))
  })

  it('restores a frozen custom slot subtree on cache hits without rerunning material callbacks', async () => {
    const child = node({ id: 'child', type: 'cached-child', model: { nested: { values: [1] } } })
    const owner = node({ id: 'owner', type: 'cached-owner', slots: { content: [child] } })
    const childMeasure = vi.fn(async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => ({
      instanceKey: request.instanceKey,
      nodeId: request.node.id,
      nodeRevision: request.nodeRevision,
      constraintKey: request.constraints.availableWidth === 10 ? '10:60:mm:horizontal-tb' : `${request.constraints.availableWidth}:60:mm:horizontal-tb`,
      borderBox: { x: request.node.x, y: request.node.y, width: request.node.width, height: request.node.height },
      contentBox: { x: request.node.x, y: request.node.y, width: request.node.width, height: request.node.height },
      slotBoxes: [],
      breakOpportunities: [],
      diagnostics: [],
    }))
    const ownerMeasure = vi.fn(async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => {
      await request.measureSlot({ slot: 'content', scope: request.scope, constraints: request.constraints }, request.signal)
      return {
        instanceKey: request.instanceKey,
        nodeId: request.node.id,
        nodeRevision: request.nodeRevision,
        constraintKey: '10:60:mm:horizontal-tb',
        borderBox: { x: request.node.x, y: request.node.y, width: request.node.width, height: request.node.height },
        contentBox: { x: request.node.x, y: request.node.y, width: request.node.width, height: request.node.height },
        slotBoxes: [],
        breakOpportunities: [],
        diagnostics: [],
      }
    })
    const harness = await measurementHarness({ manifests: [
      createTestMaterialManifest({
        type: 'cached-owner',
        slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
        viewer: createViewerFacet(ownerMeasure),
      }),
      createTestMaterialManifest({ type: 'cached-child', viewer: createViewerFacet(childMeasure) }),
    ] })
    const input = measureInput([owner], new Map([
      ['owner', readyModel(owner, { instanceKey: 'owner', nodeId: 'owner' })],
    ]))

    const first = await harness.measureNodes(input, new AbortController().signal)
    child.model.nested = { values: [9] }
    const second = await harness.measureNodes(input, new AbortController().signal)
    const nestedKey = [...first.instances.keys()].find(key => key !== 'owner')!

    expect(ownerMeasure).toHaveBeenCalledTimes(1)
    expect(childMeasure).toHaveBeenCalledTimes(1)
    expect(second.instances.has(nestedKey)).toBe(true)
    expect(second.instances.get(nestedKey)?.resolvedModel).toEqual({ nested: { values: [1] } })
    expect(Object.isFrozen(second.instances.get(nestedKey)?.resolvedModel.nested as object)).toBe(true)
    expect(Object.isFrozen(child.model)).toBe(false)
  })

  it('does not reuse stale subtree artifacts after invalidation or LRU eviction', async () => {
    const child = node({ id: 'child', type: 'artifact-child' })
    const owner = node({ id: 'owner', type: 'artifact-owner', slots: { content: [child] } })
    const childMeasure = vi.fn(async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => ({
      instanceKey: request.instanceKey,
      nodeId: request.node.id,
      nodeRevision: request.nodeRevision,
      constraintKey: '10:60:mm:horizontal-tb',
      borderBox: { x: 0, y: 0, width: 10, height: childMeasure.mock.calls.length },
      contentBox: { x: 0, y: 0, width: 10, height: childMeasure.mock.calls.length },
      slotBoxes: [],
      breakOpportunities: [],
      diagnostics: [],
    }))
    const ownerMeasure = vi.fn(async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => {
      const slot = await request.measureSlot({ slot: 'content', scope: request.scope, constraints: request.constraints }, request.signal)
      const height = slot.childPlans[0]!.borderBox.height
      return {
        instanceKey: request.instanceKey,
        nodeId: request.node.id,
        nodeRevision: request.nodeRevision,
        constraintKey: '10:60:mm:horizontal-tb',
        borderBox: { x: 0, y: 0, width: 10, height },
        contentBox: { x: 0, y: 0, width: 10, height },
        slotBoxes: [],
        breakOpportunities: [],
        diagnostics: [],
      }
    })
    const harness = await measurementHarness({
      measureCacheEntries: 2,
      manifests: [
        createTestMaterialManifest({
          type: 'artifact-owner',
          slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
          viewer: createViewerFacet(ownerMeasure),
        }),
        createTestMaterialManifest({ type: 'artifact-child', viewer: createViewerFacet(childMeasure) }),
      ],
    })
    const models = new Map([['owner', readyModel(owner, { instanceKey: 'owner', nodeId: 'owner' })]])
    const base = measureInput([owner], models, 9)

    const first = await harness.measureNodes(base, new AbortController().signal)
    harness.measureService.invalidateNode('owner')
    const afterInvalidation = await harness.measureNodes(base, new AbortController().signal)
    await harness.measureNodes(measureInput([owner], models, 10), new AbortController().signal)
    const afterEviction = await harness.measureNodes(base, new AbortController().signal)

    expect(ownerMeasure).toHaveBeenCalledTimes(4)
    expect(childMeasure).toHaveBeenCalledTimes(3)
    expect(first.plans.get('owner')?.borderBox.height).toBe(1)
    expect(afterInvalidation.instances.size).toBe(2)
    expect(afterEviction.plans.get('owner')?.borderBox.height).toBe(3)
    expect(afterEviction.instances.size).toBe(2)
  })

  it('skips removed slot children while preserving reserved child measurement and budget isolation', async () => {
    const removed = node({ id: 'removed', type: 'output-child' })
    const reserved = node({ id: 'reserved', type: 'output-child' })
    const owner = node({ id: 'owner', type: 'output-owner', slots: { content: [removed, reserved] } })
    const childMeasure = vi.fn(async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => {
      request.budget.reserveRuntimeRows(1)
      return {
        instanceKey: request.instanceKey,
        nodeId: request.node.id,
        nodeRevision: request.nodeRevision,
        constraintKey: '10:60:mm:horizontal-tb',
        borderBox: { x: 0, y: 0, width: 10, height: 1 },
        contentBox: { x: 0, y: 0, width: 10, height: 1 },
        slotBoxes: [],
        breakOpportunities: [],
        diagnostics: [],
      }
    })
    const ownerMeasure = async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => {
      const slot = await request.measureSlot({ slot: 'content', scope: request.scope, constraints: request.constraints }, request.signal)
      return {
        instanceKey: request.instanceKey,
        nodeId: request.node.id,
        nodeRevision: request.nodeRevision,
        constraintKey: '10:60:mm:horizontal-tb',
        borderBox: { x: 0, y: 0, width: 10, height: slot.childPlans.length },
        contentBox: { x: 0, y: 0, width: 10, height: slot.childPlans.length },
        slotBoxes: [],
        breakOpportunities: [],
        diagnostics: [],
      }
    }
    const harness = await measurementHarness({
      budget: { ...measurementBudget, maxRuntimeRows: 1 },
      manifests: [
        createTestMaterialManifest({
          type: 'output-owner',
          slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
          viewer: createViewerFacet(ownerMeasure),
        }),
        createTestMaterialManifest({ type: 'output-child', viewer: createViewerFacet(childMeasure) }),
      ],
    })
    const input = measureInput([owner], new Map([
      ['owner', readyModel(owner, { instanceKey: 'owner', nodeId: 'owner' })],
    ]))
    input.outputStates = new Map([
      ['owner', { visibility: 'include', shouldMeasure: true, shouldPaint: true }],
      ['removed', { visibility: 'remove', shouldMeasure: false, shouldPaint: false }],
      ['reserved', { visibility: 'reserve', shouldMeasure: true, shouldPaint: false }],
    ])

    const measured = await harness.measureNodes(input, new AbortController().signal)

    expect(childMeasure).toHaveBeenCalledTimes(1)
    expect(childMeasure.mock.calls[0]![0].node.id).toBe('reserved')
    expect(measured.plans.get('owner')?.borderBox.height).toBe(1)
    expect([...measured.instances.values()].map(instance => instance.nodeId)).toEqual(['owner', 'reserved'])
  })

  it('detects a repeated node identity in recursive slot measurement', async () => {
    const repeated = node({ id: 'owner', type: 'recursive', slots: {} })
    const child = node({ id: 'child', type: 'recursive', slots: { content: [repeated] } })
    const owner = node({ id: 'owner', type: 'recursive', slots: { content: [child] } })
    const recursiveMeasure = async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => {
      if ((request.node.slots.content?.length ?? 0) > 0)
        await request.measureSlot({ slot: 'content', scope: request.scope, constraints: request.constraints }, request.signal)
      return {
        instanceKey: request.instanceKey,
        nodeId: request.node.id,
        nodeRevision: request.nodeRevision,
        constraintKey: '10:60:mm:horizontal-tb',
        borderBox: { x: 0, y: 0, width: 10, height: 7 },
        contentBox: { x: 0, y: 0, width: 10, height: 7 },
        slotBoxes: [],
        breakOpportunities: [],
        diagnostics: [],
      }
    }
    const harness = await measurementHarness({ manifests: [createTestMaterialManifest({
      type: 'recursive',
      slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      viewer: createViewerFacet(recursiveMeasure),
    })] })

    await expect(harness.measureNodes(
      measureInput([owner], new Map([['owner', readyModel(owner, { instanceKey: 'owner', nodeId: 'owner' })]])),
      new AbortController().signal,
    )).rejects.toThrow('MATERIAL_SLOT_MEASURE_CYCLE')
  })

  it('disposes opened collection cursors when material measurement fails', async () => {
    const source = node({ id: 'table', type: 'table', bindings: { rows: { sourceId: 'invoice', fieldPath: 'rows' } } })
    const close = vi.fn()
    const providerOpen = vi.fn(async () => ({ declaredRowCount: 0, keyMultiplicity: 'unknown' as const, readNext: async () => ({ records: [], done: true }), close }))
    const measure = async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => {
      const opened = await request.openCollection('rows', request.scope, request.signal)
      expect(opened.status).toBe('opened')
      throw new Error('measure failed')
    }
    const harness = await measurementHarness({
      provider: { open: providerOpen },
      manifests: [createTestMaterialManifest({
        type: 'table',
        binding: { kind: 'ports', ports: [{ id: 'rows', key: { kind: 'exact', value: 'rows' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }] },
        viewer: createViewerFacet(measure),
      })],
    })

    await expect(harness.measureNodes(measureInput([source], new Map([['table', readyModel(source, { instanceKey: 'table', nodeId: 'table' })]])), new AbortController().signal))
      .rejects
      .toThrow('measure failed')
    expect(providerOpen).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('measurement budgets and flattening', () => {
  it('reserves layout and render budgets atomically with bounded positive safe integer limits', () => {
    const layout = createMaterialLayoutBudgetToken({ maxRuntimeRows: 2, maxLayoutFacts: 3 })
    layout.reserveRuntimeRows(2)
    layout.reserveLayoutFacts('row', 3)
    expect(layout).toMatchObject({ runtimeRowsUsed: 2, layoutFactsUsed: 3 })
    expect(() => layout.reserveRuntimeRows(1)).toThrow('MATERIAL_LAYOUT_RUNTIME_ROW_LIMIT')
    expect(layout.runtimeRowsUsed).toBe(2)
    expect(() => layout.reserveLayoutFacts('cell', 1)).toThrow('MATERIAL_LAYOUT_FACT_LIMIT')
    expect(layout.layoutFactsUsed).toBe(3)

    const render = createMaterialRenderBudgetToken(2)
    render.reserveNodes('element', 2)
    expect(() => render.reserveNodes('text', 1)).toThrow('MATERIAL_RENDER_NODE_LIMIT')
    expect(render.nodesUsed).toBe(2)
    expect(() => createMaterialLayoutBudgetToken({ maxRuntimeRows: 0, maxLayoutFacts: 1 })).toThrow('MATERIAL_LAYOUT_BUDGET_INVALID')
    expect(() => createMaterialRenderBudgetToken(1.5)).toThrow('MATERIAL_RENDER_BUDGET_INVALID')
  })

  it('flattens only inherited measurable branches without recomputing conditions', () => {
    const removedChild = node({ id: 'removed-child' })
    const removedOwner = node({ id: 'removed-owner', slots: { content: [removedChild] } })
    const reservedChild = node({ id: 'reserved-child' })
    const reservedOwner = node({ id: 'reserved-owner', slots: { content: [reservedChild] } })
    const states = new Map([
      ['removed-owner', { visibility: 'remove' as const, shouldMeasure: false, shouldPaint: false }],
      ['removed-child', { visibility: 'include' as const, shouldMeasure: true, shouldPaint: true }],
      ['reserved-owner', { visibility: 'reserve' as const, shouldMeasure: true, shouldPaint: false }],
      ['reserved-child', { visibility: 'reserve' as const, shouldMeasure: true, shouldPaint: false }],
    ])

    expect(flattenMeasurableNodes([removedOwner, reservedOwner], states).map(item => item.id))
      .toEqual(['reserved-owner', 'reserved-child'])
  })
})

describe('default layout runtime wiring', () => {
  it('connects output, runtime models, resources, measurement, layout, and pagination without mutating input', async () => {
    const source = node({ type: 'wired' })
    const before = structuredClone(source)
    const measure = vi.fn(async (request: MaterialMeasureRequest): Promise<MaterialLayoutPlan> => ({
      instanceKey: request.instanceKey,
      nodeId: request.node.id,
      nodeRevision: request.nodeRevision,
      constraintKey: '10:60:mm:horizontal-tb',
      borderBox: { x: request.node.x, y: request.node.y, width: 10, height: 15 },
      contentBox: { x: request.node.x, y: request.node.y, width: 10, height: 15 },
      slotBoxes: [],
      breakOpportunities: [],
      diagnostics: [],
    }))
    const manifest = createTestMaterialManifest({ type: 'wired', viewer: createViewerFacet(measure) })
    const profile = createTestCompiledMaterialProfile([manifest])
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['wired'])
    const prepareResources = vi.fn(async () => 11)
    const runtime = createDefaultLayoutRuntime({
      profile,
      materials,
      measureService: new MeasureService({ maxEntries: 8 }),
      runtimeModelCache: createRuntimeModelResolutionCache(profile),
      scheduler: createBoundedMeasureScheduler(1),
      textMeasure: async () => ({ width: 0, height: 0 }),
      budget: measurementBudget,
      reportDiagnostic: vi.fn(),
      prepareResources,
    })

    const committed = await runtime.plan({
      document: document([source]),
      nodeStates: new Map(),
      documentRevision: 5,
      data: {},
      dataRevision: 2,
    }, new AbortController().signal)

    expect(prepareResources).toHaveBeenCalledTimes(1)
    expect(measure).toHaveBeenCalledWith(expect.objectContaining({ nodeRevision: 5, dataRevision: 2, resourceRevision: 11 }))
    expect(committed.resourceRevision).toBe(11)
    expect(committed.pages[0]!.fragments[0]!.plan.borderBox.height).toBe(15)
    expect(committed.outputStates.get('n1')).toMatchObject({ shouldMeasure: true, shouldPaint: true })
    expect(source).toEqual(before)
    expect(Object.isFrozen(source.model)).toBe(false)
  })
})
