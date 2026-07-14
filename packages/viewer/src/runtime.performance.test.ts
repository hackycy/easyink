import type { MaterialLayoutPlan, MaterialMeasureRequest, MaterialViewerFacet, ViewerRenderTree } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { EffectiveOutputState } from './effective-output-state'
import type { MaterialMeasurementBudget } from './layout-runtime'
import type { ResolvedRuntimeModel } from './runtime-model-resolver'
import { createLayoutConstraintKey, MeasureService, VIEWER_TREE_ABSOLUTE_MAX_NODES, viewerFragment, viewerText } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createViewer } from './index'
import {
  createMaterialLayoutBudgetToken,
  createMaterialMeasureNodes,
  createMaterialRenderBudgetToken,
  DEFAULT_VIEWER_PERFORMANCE_BUDGET,
  enforceRuntimeBudget,
} from './layout-runtime'
import { ProfileMaterialRuntime } from './material-runtime'
import { createBoundedMeasureScheduler } from './measure-scheduler'
import { createRuntimeModelResolutionCache } from './runtime-model-resolver'

const identity = Object.freeze({
  instanceKey: 'table-1@4:7',
  nodeId: 'table-1',
  documentRevision: 4,
  dataRevision: 7,
})

const budget = Object.freeze({
  measureCacheEntries: 256,
  maxMeasureInFlight: 8,
  pageDomOverscan: 1,
  maxInlineDataNodes: 100_000,
  maxInlineDataStringBytes: 4_194_304,
  maxRuntimeRows: 100_000,
  maxLayoutFactsPerMaterial: 500_000,
  maxRenderTreeNodesPerMaterial: 50_000,
})

function materialNode(id: string, type: string): MaterialNode {
  return {
    id,
    type,
    x: 2,
    y: id === 'bad' ? 2 : 20,
    width: 20,
    height: 8,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function schema(elements: MaterialNode[]): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 80, height: 60 },
    guides: { x: [], y: [] },
    elements,
  }
}

function plan(request: MaterialMeasureRequest, rows: number): MaterialLayoutPlan {
  const borderBox = {
    x: request.node.x,
    y: request.node.y,
    width: request.node.width,
    height: request.node.height,
  }
  return {
    instanceKey: request.instanceKey,
    nodeId: request.node.id,
    nodeRevision: request.nodeRevision,
    constraintKey: createLayoutConstraintKey(request.constraints),
    borderBox,
    contentBox: borderBox,
    slotBoxes: [],
    breakOpportunities: [],
    diagnostics: [],
    payload: { rows: Array.from({ length: rows }, (_, index) => ({ index })) },
  }
}

function readyModel(node: MaterialNode, dataRevision: number): ResolvedRuntimeModel {
  return {
    instanceKey: node.id,
    nodeId: node.id,
    scopeKey: 'document',
    nodeRevision: 4,
    dataRevision,
    status: 'ready',
    value: {},
  }
}

function measureInput(
  nodes: MaterialNode[],
  dataRevision: number,
  outputStates: ReadonlyMap<string, EffectiveOutputState> = new Map(nodes.map(node => [
    node.id,
    { visibility: 'include' as const, shouldMeasure: true, shouldPaint: true },
  ])),
) {
  return {
    document: schema(nodes),
    nodeStates: new Map(),
    documentRevision: 4,
    data: {},
    dataRevision,
    outputStates,
    runtimeModels: new Map(nodes.map(node => [node.id, readyModel(node, dataRevision)])),
    resourceRevision: 1,
  }
}

async function measurementHarness(input: {
  readonly facets: Readonly<Record<string, NonNullable<MaterialViewerFacet['layout']>['measure']>>
  readonly budget: MaterialMeasurementBudget
  readonly maxEntries?: number
}) {
  const manifests = Object.entries(input.facets).map(([type, measure]) => createTestMaterialManifest({
    type,
    viewer: () => ({
      capabilities: {},
      extension: { render: () => ({ tree: viewerText(type) }) },
      layout: { measure },
    }),
  }))
  const profile = createTestCompiledMaterialProfile(manifests)
  const materials = new ProfileMaterialRuntime(profile)
  await materials.prepare(manifests.map(manifest => manifest.type))
  const measureService = new MeasureService({ maxEntries: input.maxEntries ?? 8 })
  const reportDiagnostic = vi.fn()
  const measureNodes = createMaterialMeasureNodes({
    profile,
    materials,
    measureService,
    runtimeModelCache: createRuntimeModelResolutionCache(profile, input.maxEntries ?? 8),
    scheduler: createBoundedMeasureScheduler(2),
    textMeasure: async () => ({ width: 0, height: 0 }),
    budget: input.budget,
    reportDiagnostic,
  })
  return { measureNodes, measureService, reportDiagnostic }
}

describe('viewer performance budget primitives', () => {
  it('publishes the finite default viewer performance budget', () => {
    expect(DEFAULT_VIEWER_PERFORMANCE_BUDGET).toEqual({
      measureCacheEntries: 512,
      maxMeasureInFlight: 8,
      pageDomOverscan: 1,
      maxInlineDataNodes: 100_000,
      maxInlineDataStringBytes: 4 * 1024 * 1024,
      maxRuntimeRows: 100_000,
      maxLayoutFactsPerMaterial: 500_000,
      maxRenderTreeNodesPerMaterial: 50_000,
    })
    expect(Object.isFrozen(DEFAULT_VIEWER_PERFORMANCE_BUDGET)).toBe(true)
  })

  it('keeps layout reservation counters unchanged on overflow and reports exact revision context', () => {
    const diagnostics: Array<{ code: string, detail: unknown }> = []
    const token = createMaterialLayoutBudgetToken({
      ...identity,
      maxRuntimeRows: 2,
      maxLayoutFacts: 4,
      signal: new AbortController().signal,
      reportDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })

    token.reserveRuntimeRows(2)
    token.reserveLayoutFacts('cell', 4)
    expect(() => token.reserveRuntimeRows(1)).toThrow('VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED')
    expect(() => token.reserveLayoutFacts('edge', 1)).toThrow('VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED')
    expect(token.runtimeRowsUsed).toBe(2)
    expect(token.layoutFactsUsed).toBe(4)
    expect(diagnostics).toEqual([{
      code: 'VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED',
      detail: { ...identity, kind: 'rows', used: 2, requested: 1, limit: 2 },
    }])
  })

  it('rejects invalid layout limits/counts and aborts atomically before reporting or mutation', () => {
    for (const maxRuntimeRows of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(() => createMaterialLayoutBudgetToken({
        ...identity,
        maxRuntimeRows,
        maxLayoutFacts: 1,
        signal: new AbortController().signal,
        reportDiagnostic: () => {},
      })).toThrow('MATERIAL_LAYOUT_BUDGET_LIMIT_INVALID')
    }

    const controller = new AbortController()
    const reportDiagnostic = vi.fn()
    const token = createMaterialLayoutBudgetToken({
      ...identity,
      maxRuntimeRows: 2,
      maxLayoutFacts: 2,
      signal: controller.signal,
      reportDiagnostic,
    })
    for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])
      expect(() => token.reserveRuntimeRows(count)).toThrow('MATERIAL_LAYOUT_BUDGET_COUNT_INVALID')
    controller.abort()
    expect(() => token.reserveRuntimeRows(1)).toThrowError(expect.objectContaining({ name: 'AbortError' }))
    expect(token.runtimeRowsUsed).toBe(0)
    expect(reportDiagnostic).not.toHaveBeenCalled()
  })

  it('keeps render reservations atomic across nested callers and includes exact identity', () => {
    const diagnostics: Array<{ code: string, detail: unknown }> = []
    const token = createMaterialRenderBudgetToken({
      ...identity,
      maxNodes: 3,
      signal: new AbortController().signal,
      reportDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })
    token.reserveNodes('element', 2)
    token.reserveNodes('text', 1)
    expect(() => token.reserveNodes('imperative', 1)).toThrow('VIEWER_RENDER_TREE_BUDGET_EXCEEDED')
    expect(token.nodesUsed).toBe(3)
    expect(diagnostics).toEqual([{
      code: 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
      detail: { ...identity, kind: 'imperative', used: 3, requested: 1, limit: 3 },
    }])
  })

  it('validates render limits/counts against the browser absolute ceiling and honors abort', () => {
    for (const maxNodes of [0, -1, 1.5, VIEWER_TREE_ABSOLUTE_MAX_NODES + 1, Number.NaN]) {
      expect(() => createMaterialRenderBudgetToken({
        ...identity,
        maxNodes,
        signal: new AbortController().signal,
        reportDiagnostic: () => {},
      })).toThrow('MATERIAL_RENDER_BUDGET_LIMIT_INVALID')
    }
    const controller = new AbortController()
    const token = createMaterialRenderBudgetToken({
      ...identity,
      maxNodes: 1,
      signal: controller.signal,
      reportDiagnostic: () => {},
    })
    for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])
      expect(() => token.reserveNodes('text', count)).toThrow('MATERIAL_RENDER_BUDGET_COUNT_INVALID')
    controller.abort()
    expect(() => token.reserveNodes('text', 1)).toThrowError(expect.objectContaining({ name: 'AbortError' }))
    expect(token.nodesUsed).toBe(0)
  })

  it('does not let a throwing diagnostic observer replace budget control flow', () => {
    const token = createMaterialLayoutBudgetToken({
      ...identity,
      maxRuntimeRows: 1,
      maxLayoutFacts: 1,
      signal: new AbortController().signal,
      reportDiagnostic: () => { throw new Error('observer failed') },
    })
    expect(() => token.reserveRuntimeRows(2)).toThrow('VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED')
    expect(token.runtimeRowsUsed).toBe(0)
  })

  it('keeps the first layout budget failure sticky with one diagnostic and one stable error', () => {
    const reportDiagnostic = vi.fn()
    const token = createMaterialLayoutBudgetToken({
      ...identity,
      maxRuntimeRows: 1,
      maxLayoutFacts: 1,
      signal: new AbortController().signal,
      reportDiagnostic,
    })
    let first: unknown
    let second: unknown
    try {
      token.reserveRuntimeRows(2)
    }
    catch (error) {
      first = error
    }
    try {
      token.reserveLayoutFacts('cell', 2)
    }
    catch (error) {
      second = error
    }

    expect(first).toBeInstanceOf(Error)
    expect(second).toBe(first)
    expect(reportDiagnostic).toHaveBeenCalledTimes(1)
    expect(token.runtimeRowsUsed).toBe(0)
    expect(token.layoutFactsUsed).toBe(0)
  })
})

describe('aggregate runtime budget audit', () => {
  it.each([
    ['rows', { observedRows: 100_001, observedLayoutFacts: 0, observedRenderTreeNodes: 0 }, 'VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED', 100_000, 100_001],
    ['layout facts', { observedRows: 25_000, observedLayoutFacts: 500_001, observedRenderTreeNodes: 0 }, 'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED', 500_000, 500_001],
    ['render nodes', { observedRows: 1, observedLayoutFacts: 1, observedRenderTreeNodes: 50_001 }, 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED', 50_000, 50_001],
  ])('rejects oversized %s with revision-rich diagnostics', (_name, observed, code, limit, value) => {
    const diagnostics: Array<{ code: string, detail: unknown }> = []
    expect(enforceRuntimeBudget({
      nodeId: identity.nodeId,
      instanceKey: identity.instanceKey,
      documentRevision: identity.documentRevision,
      dataRevision: identity.dataRevision,
      ...observed,
      budget,
      reportDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })).toBe(false)
    expect(diagnostics).toEqual([{
      code,
      detail: {
        ...identity,
        limit,
        observed: value,
      },
    }])
  })

  it('rejects invalid observed counts and safely ignores observer failures', () => {
    for (const observedRows of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(() => enforceRuntimeBudget({
        ...identity,
        observedRows,
        observedLayoutFacts: 0,
        observedRenderTreeNodes: 0,
        budget,
        reportDiagnostic: () => {},
      })).toThrow('VIEWER_RUNTIME_BUDGET_OBSERVED_INVALID')
    }
    expect(enforceRuntimeBudget({
      ...identity,
      observedRows: 100_001,
      observedLayoutFacts: 0,
      observedRenderTreeNodes: 0,
      budget,
      reportDiagnostic: () => { throw new Error('observer failed') },
    })).toBe(false)
  })
})

describe('layout budget integration', () => {
  const measurementBudget: MaterialMeasurementBudget = Object.freeze({
    maxRuntimeRows: 2,
    maxLayoutFacts: 2,
    maxDataNodes: 20,
    maxDataStringBytes: 1_000,
    maxKeyTokens: 20,
    maxKeyBytes: 1_000,
  })

  it('rejects an unreserved oversized plan before cache retention and quarantines only that revision', async () => {
    const bad = materialNode('bad', 'oversized-layout')
    const good = materialNode('good', 'healthy-layout')
    let badMeasures = 0
    const harness = await measurementHarness({
      facets: {
        'oversized-layout': async (request) => {
          badMeasures++
          const result = plan(request, 0)
          return {
            ...result,
            payload: { facts: Array.from({ length: request.dataRevision === 7 ? 3 : 1 }, (_, index) => ({ index })) },
          }
        },
        'healthy-layout': async request => plan(request, 1),
      },
      budget: measurementBudget,
      maxEntries: 2,
    })

    const first = await harness.measureNodes(measureInput([bad, good], 7), new AbortController().signal)

    expect(first.instances.get('bad')).toMatchObject({
      nodeId: 'bad',
      status: 'quarantined',
      diagnostic: {
        code: 'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED',
        detail: {
          instanceKey: 'bad',
          nodeId: 'bad',
          documentRevision: 4,
          dataRevision: 7,
          limit: 2,
          observed: 3,
        },
      },
    })
    expect(first.instances.get('bad')?.layoutPlan.payload).toBeUndefined()
    expect(first.instances.get('good')).toMatchObject({ nodeId: 'good', status: 'ready' })
    expect(harness.measureService.size).toBe(1)
    expect(harness.reportDiagnostic).toHaveBeenCalledWith({
      code: 'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED',
      detail: {
        instanceKey: 'bad',
        nodeId: 'bad',
        documentRevision: 4,
        dataRevision: 7,
        limit: 2,
        observed: 3,
      },
    })

    const recovered = await harness.measureNodes(measureInput([bad, good], 8), new AbortController().signal)

    expect(recovered.instances.get('bad')).toMatchObject({ nodeId: 'bad', status: 'ready' })
    expect(recovered.instances.get('bad')?.layoutPlan.payload).toEqual({ facts: [{ index: 0 }] })
    expect(recovered.instances.get('good')).toMatchObject({ nodeId: 'good', status: 'ready' })
    expect(badMeasures).toBe(2)
    expect(harness.measureService.size).toBe(2)
  })

  it('stops a cooperative material before allocating the first over-limit row', async () => {
    const source = materialNode('bad', 'cooperative-layout')
    let attemptedRows = 0
    let allocatedRows = 0
    const harness = await measurementHarness({
      facets: {
        'cooperative-layout': async (request) => {
          const rows: Array<{ index: number }> = []
          for (let index = 0; index < 100_000; index++) {
            attemptedRows++
            request.budget.reserveRuntimeRows(1)
            request.budget.reserveLayoutFacts('row', 1)
            rows.push({ index })
            allocatedRows++
          }
          return { ...plan(request, 0), payload: { rows } }
        },
      },
      budget: measurementBudget,
    })

    const measured = await harness.measureNodes(measureInput([source], 7), new AbortController().signal)

    expect(measured.instances.get('bad')).toMatchObject({
      status: 'quarantined',
      diagnostic: { code: 'VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED' },
    })
    expect(attemptedRows).toBe(3)
    expect(allocatedRows).toBe(2)
    expect(harness.measureService.size).toBe(0)
  })

  it('audits returned facts independently without double-counting exact reservations', async () => {
    const source = materialNode('good', 'exact-layout')
    const harness = await measurementHarness({
      facets: {
        'exact-layout': async (request) => {
          request.budget.reserveRuntimeRows(2)
          request.budget.reserveLayoutFacts('row', 2)
          return plan(request, 2)
        },
      },
      budget: measurementBudget,
    })

    const measured = await harness.measureNodes(measureInput([source], 7), new AbortController().signal)

    expect(measured.instances.get('good')).toMatchObject({ status: 'ready' })
    expect(harness.measureService.size).toBe(1)
  })

  it('counts nested cell facts even when an untrusted facet omits reservations', async () => {
    const source = materialNode('bad', 'nested-facts-layout')
    const harness = await measurementHarness({
      facets: {
        'nested-facts-layout': async request => ({
          ...plan(request, 0),
          payload: { rows: [{ cells: [{ id: 1 }, { id: 2 }] }] },
        }),
      },
      budget: measurementBudget,
    })

    const measured = await harness.measureNodes(measureInput([source], 7), new AbortController().signal)

    expect(measured.instances.get('bad')).toMatchObject({
      status: 'quarantined',
      diagnostic: {
        code: 'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED',
        detail: { observed: 3, limit: 2 },
      },
    })
    expect(harness.measureService.size).toBe(0)
  })

  it.each(['return', 'abort'] as const)(
    'contains a swallowed layout budget failure when the facet later chooses to %s',
    async (afterCatch) => {
      const bad = materialNode('bad', `sticky-${afterCatch}`)
      const good = materialNode('good', 'sticky-sibling')
      let badMeasures = 0
      const harness = await measurementHarness({
        facets: {
          [`sticky-${afterCatch}`]: async (request) => {
            badMeasures++
            if (request.dataRevision === 7) {
              try {
                request.budget.reserveRuntimeRows(3)
              }
              catch {
                if (afterCatch === 'abort')
                  throw new DOMException('The operation was aborted.', 'AbortError')
              }
            }
            return plan(request, 1)
          },
          'sticky-sibling': async request => plan(request, 1),
        },
        budget: measurementBudget,
        maxEntries: 2,
      })

      const first = await harness.measureNodes(measureInput([bad, good], 7), new AbortController().signal)

      expect(first.instances.get('bad')).toMatchObject({
        status: 'quarantined',
        diagnostic: { code: 'VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED' },
      })
      expect(first.instances.get('good')).toMatchObject({ status: 'ready' })
      expect(harness.reportDiagnostic).toHaveBeenCalledTimes(1)
      expect(harness.measureService.size).toBe(1)

      const recovered = await harness.measureNodes(measureInput([bad, good], 8), new AbortController().signal)
      expect(recovered.instances.get('bad')).toMatchObject({ status: 'ready' })
      expect(recovered.instances.get('good')).toMatchObject({ status: 'ready' })
      expect(badMeasures).toBe(2)
      expect(harness.measureService.size).toBe(2)
    },
  )

  it('keeps the measure cache bounded across revision churn', async () => {
    const source = materialNode('good', 'cached-layout')
    const harness = await measurementHarness({
      facets: { 'cached-layout': async request => plan(request, 1) },
      budget: measurementBudget,
      maxEntries: 2,
    })

    for (const dataRevision of [1, 2, 3])
      await harness.measureNodes(measureInput([source], dataRevision), new AbortController().signal)

    expect(harness.measureService.size).toBe(2)
  })
})

describe('viewer budget wiring and cancellation', () => {
  it('accepts zero page overscan and rejects every other non-positive or unsafe limit', () => {
    const profile = createTestCompiledMaterialProfile([])
    expect(() => createViewer({ profile, performanceBudget: { pageDomOverscan: 0 } })).not.toThrow()
    for (const key of [
      'measureCacheEntries',
      'maxMeasureInFlight',
      'maxInlineDataNodes',
      'maxInlineDataStringBytes',
      'maxRuntimeRows',
      'maxLayoutFactsPerMaterial',
      'maxRenderTreeNodesPerMaterial',
    ] as const) {
      expect(() => createViewer({ profile, performanceBudget: { [key]: 0 } }))
        .toThrow('VIEWER_PERFORMANCE_BUDGET_INVALID')
    }
    expect(() => createViewer({
      profile,
      performanceBudget: { maxRenderTreeNodesPerMaterial: VIEWER_TREE_ABSOLUTE_MAX_NODES + 1 },
    })).toThrow('VIEWER_PERFORMANCE_BUDGET_INVALID')
  })

  it('passes the minimum inline, row, fact, material-render, and browser-render capacity to repeated work', async () => {
    const source = materialNode('bounded', 'bounded-layout')
    let capturedRows: number | undefined
    const manifest = createTestMaterialManifest({
      type: source.type,
      viewer: () => ({
        capabilities: {},
        extension: { render: () => ({ tree: viewerText('bounded') }) },
        layout: {
          async measure(request: MaterialMeasureRequest) {
            capturedRows = request.budget.maxRuntimeRows
            return plan(request, 1)
          },
        },
      }),
    })
    const viewer = createViewer({
      profile: createTestCompiledMaterialProfile([manifest]),
      browserDom: { maxNodes: 3 },
      performanceBudget: {
        maxInlineDataNodes: 9,
        maxRuntimeRows: 100,
        maxLayoutFactsPerMaterial: 7,
        maxRenderTreeNodesPerMaterial: 5,
      },
    })

    await viewer.open({ schema: schema([source]), data: {}, dataRevision: 1 })

    expect(capturedRows).toBe(3)
    await viewer.destroy()
  })

  it('starts at most maxMeasureInFlight operations and starts none after supersession', async () => {
    vi.useFakeTimers()
    try {
      const maxMeasureInFlight = 4
      const scheduler = createBoundedMeasureScheduler(maxMeasureInFlight)
      const controller = new AbortController()
      const reason = new Error('superseded')
      let starts = 0
      const result = scheduler.mapOrdered(
        Array.from({ length: 100_000 }, (_, index) => index),
        async () => {
          starts++
          await new Promise(resolve => setTimeout(resolve, 10))
          return starts
        },
        controller.signal,
      )
      const rejection = expect(result).rejects.toBe(reason)

      await Promise.resolve()
      expect(starts).toBe(maxMeasureInFlight)
      controller.abort(reason)
      await vi.advanceTimersByTimeAsync(10)
      await rejection
      await vi.runAllTimersAsync()

      expect(starts).toBe(maxMeasureInFlight)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('audits an under-reported material tree before mount and keeps a healthy sibling committed', async () => {
    const bad = materialNode('bad-render', 'under-reported-render')
    const good = materialNode('good-render', 'healthy-render')
    const manifests = [
      createTestMaterialManifest({
        type: bad.type,
        viewer: () => ({
          capabilities: {},
          extension: {
            render: () => ({ tree: viewerFragment(Array.from({ length: 3 }, () => viewerText('x'))) }),
          },
        }),
      }),
      createTestMaterialManifest({
        type: good.type,
        viewer: () => ({
          capabilities: {},
          extension: { render: () => ({ tree: viewerText('healthy sibling') }) },
        }),
      }),
    ]
    const container = document.createElement('div')
    const diagnostics: Array<{ code: string, detail?: unknown }> = []
    const viewer = createViewer({
      container,
      profile: createTestCompiledMaterialProfile(manifests),
      browserDom: { maxNodes: 3 },
      performanceBudget: { maxRenderTreeNodesPerMaterial: 3 },
    })

    await viewer.open({
      schema: schema([bad, good]),
      documentRevision: 4,
      dataRevision: 7,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })

    expect(container.textContent).toContain('[material unavailable]')
    expect(container.textContent).toContain('healthy sibling')
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
      nodeId: 'bad-render',
      detail: expect.objectContaining({
        instanceKey: 'bad-render',
        nodeId: 'bad-render',
        documentRevision: 4,
        dataRevision: 7,
        kind: 'fragment',
        used: 0,
        requested: 4,
        limit: 3,
      }),
    }))
    await viewer.destroy()
  })

  it('stops returned-tree audit as soon as a small effective budget is proven exceeded', async () => {
    const source = materialNode('bounded-audit', 'bounded-audit-render')
    let childReads = 0
    const child = viewerText('x')
    const children = new Proxy(Array.from({ length: VIEWER_TREE_ABSOLUTE_MAX_NODES }).fill(child), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^(?:0|[1-9]\d*)$/.test(property))
          childReads++
        return Reflect.get(target, property, receiver)
      },
    })
    const tree = Object.freeze({ kind: 'fragment', children }) as ViewerRenderTree
    const manifest = createTestMaterialManifest({
      type: source.type,
      viewer: () => ({
        capabilities: {},
        extension: { render: () => ({ tree }) },
      }),
    })
    const container = document.createElement('div')
    const diagnostics: Array<{ code: string, detail?: unknown }> = []
    const viewer = createViewer({
      container,
      profile: createTestCompiledMaterialProfile([manifest]),
      browserDom: { maxNodes: 2 },
      performanceBudget: { maxRenderTreeNodesPerMaterial: 2 },
    })

    await viewer.open({
      schema: schema([source]),
      documentRevision: 4,
      dataRevision: 7,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })

    expect(childReads).toBeLessThanOrEqual(4)
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
      nodeId: source.id,
      detail: expect.objectContaining({
        instanceKey: source.id,
        documentRevision: 4,
        dataRevision: 7,
        limit: 2,
        observed: 3,
      }),
    }))
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_RENDER_ERROR')).toBe(false)
    expect(diagnostics.some(item => item.code === 'VIEWER_MATERIAL_MOUNT_ERROR')).toBe(false)
    await viewer.destroy()
  })

  it('contains a swallowed render overflow even when the diagnostic observer throws', async () => {
    const source = materialNode('swallowed-observer', 'swallowed-observer-render')
    const render = vi.fn((_node, context: Parameters<NonNullable<MaterialViewerFacet['extension']['render']>>[1]) => {
      try {
        context.renderBudget.reserveNodes('element', 2)
      }
      catch {}
      return { tree: viewerText('unsafe observer tree') }
    })
    const manifest = createTestMaterialManifest({
      type: source.type,
      viewer: () => ({ capabilities: {}, extension: { render } }),
    })
    const container = document.createElement('div')
    const diagnosticCodes: string[] = []
    const viewer = createViewer({
      container,
      profile: createTestCompiledMaterialProfile([manifest]),
      browserDom: { maxNodes: 1 },
      performanceBudget: { maxRenderTreeNodesPerMaterial: 1 },
    })

    await viewer.open({
      schema: schema([source]),
      documentRevision: 4,
      dataRevision: 7,
      onDiagnostic(diagnostic) {
        diagnosticCodes.push(diagnostic.code)
        throw new Error('diagnostic observer failed')
      },
    })

    expect(container.textContent).toContain('[material unavailable]')
    expect(container.textContent).not.toContain('unsafe observer tree')
    expect(render).toHaveBeenCalledTimes(1)
    expect(diagnosticCodes.filter(code => code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED')).toHaveLength(1)
    expect(diagnosticCodes).not.toContain('VIEWER_MATERIAL_RENDER_ERROR')
    expect(diagnosticCodes).not.toContain('VIEWER_MATERIAL_MOUNT_ERROR')
    await viewer.destroy()
  })
})
