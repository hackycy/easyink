import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { MaterialFragmentContribution, MaterialLayoutPlan } from './material-layout-plan'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runLayoutPipeline } from './layout-strategy'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans, freezeMaterialFragmentPlan, freezeMaterialLayoutPlan } from './material-layout-plan'
import { chooseBreak, commitMaterialFragment, fragmentRangeMadeProgress, runPagination } from './pagination-engine'

function makeNode(id: string, overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id,
    type: 'table-data',
    x: 0,
    y: 10,
    width: 80,
    height: 130,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
    ...overrides,
  }
}

function makeSchema(elements: MaterialNode[]): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'fixed',
      width: 80,
      height: 100,
      pageModel: { kind: 'paged-paper', paper: { width: 80, height: 100 } },
      layout: { strategy: 'stack-flow', flowAxis: 'y' },
      reflow: { strategy: 'flow-y' },
      pagination: { strategy: 'auto-sheets' },
    },
    guides: { x: [], y: [] },
    elements,
  }
}

function makePlan(height = 140, breakOffsets: Array<{ offset: number, penalty?: number }> = []): MaterialLayoutPlan {
  return freezeMaterialLayoutPlan({
    instanceKey: 'table:instance',
    nodeId: 'table',
    nodeRevision: 1,
    constraintKey: '80:100:mm:horizontal-tb',
    borderBox: { x: 4, y: 10, width: 80, height },
    contentBox: { x: 4, y: 10, width: 80, height },
    slotBoxes: [],
    breakOpportunities: breakOffsets.map(({ offset, penalty = 0 }, index) => ({
      id: `row-${index}`,
      blockOffset: offset,
      penalty,
    })),
    diagnostics: [],
  })
}

describe('pagination ownership helpers', () => {
  it('removes legacy material-owned pagination APIs from direct runtime consumers', () => {
    const files = [
      'packages/core/src/material-viewer.ts',
      'packages/core/src/index.ts',
      'packages/viewer/src/types.ts',
      'packages/viewer/src/material-runtime.ts',
      'packages/viewer/src/runtime.ts',
      'packages/materials/table/data/src/viewer.ts',
      'packages/materials/table/data/src/manifest.ts',
      'packages/materials/page-number/src/schema.ts',
    ]
    const source = files.map(file => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n')

    expect(source).not.toMatch(/FragmentPaginator|FragmentPaginate|fragmentPaginator|pageAware|repeat:\s*\{\s*scope:\s*['"]every-output-page/)
  })

  it('selects from the remaining range and prefers the later offset on a penalty tie', () => {
    const plan = makePlan(140, [
      { offset: 40, penalty: 1 },
      { offset: 80 },
      { offset: 90 },
      { offset: 120 },
    ])

    expect(chooseBreak(plan, 40, 60)?.blockOffset).toBe(90)
    expect(chooseBreak(plan, 90, 50)).toEqual({ id: '$end', blockOffset: 140, penalty: 0 })
    expect(chooseBreak(plan, 90, 20)).toBeUndefined()
  })

  it.each([
    ['negative start', -1, 20],
    ['non-finite start', Number.NaN, 20],
    ['start past end', 141, 20],
    ['negative available height', 0, -1],
    ['non-finite available height', 0, Number.POSITIVE_INFINITY],
  ])('rejects %s', (_name, start, available) => {
    expect(() => chooseBreak(makePlan(), start, available)).toThrow('MATERIAL_BREAK_INPUT_INVALID')
  })

  it('rejects a layout plan that failed Task1 validation', () => {
    const invalid = {
      ...makePlan(),
      breakOpportunities: [{ id: 'outside', blockOffset: 200, penalty: 0 }],
    }

    expect(() => chooseBreak(invalid, 0, 20)).toThrow('MATERIAL_LAYOUT_PLAN_INVALID')
  })

  it('requires the exact requested range and positive progress', () => {
    const requested = { startBlockOffset: 40, endBlockOffset: 90 }
    expect(fragmentRangeMadeProgress(requested, { startBlockOffset: 40, endBlockOffset: 40 })).toBe(false)
    expect(fragmentRangeMadeProgress(requested, { startBlockOffset: 40, endBlockOffset: 91 })).toBe(false)
    expect(fragmentRangeMadeProgress(requested, { startBlockOffset: 40, endBlockOffset: 90 })).toBe(true)
  })

  it('mints injective identity and places a nonzero-start fragment exactly once', () => {
    const plan = makePlan(140)
    const contribution: MaterialFragmentContribution = {
      inlineSize: 80,
      blockSize: 50,
      consumedRange: { startBlockOffset: 40, endBlockOffset: 90 },
      renderPayload: { rows: ['r2'] },
      diagnostics: [{
        code: 'TABLE_FRAGMENT',
        severity: 'info',
        message: 'fragmented',
        instanceKey: plan.instanceKey,
        nodeId: plan.nodeId,
        detail: { range: [40, 90] },
      }],
    }
    const request = { plan, startBlockOffset: 40, endBlockOffset: 90, availableHeight: 60, pageIndex: 1 }

    const committed = commitMaterialFragment(request, contribution, { x: 4, y: 100 })
    const other = commitMaterialFragment({ ...request, plan: { ...plan, instanceKey: 'table:other' } }, {
      ...contribution,
      diagnostics: contribution.diagnostics.map(diagnostic => ({ ...diagnostic, instanceKey: 'table:other' })),
    }, { x: 4, y: 100 })

    expect(committed).toMatchObject({
      sourceInstanceKey: plan.instanceKey,
      sourceNodeId: plan.nodeId,
      box: { x: 4, y: 100, width: 80, height: 50 },
      consumedRange: { startBlockOffset: 40, endBlockOffset: 90 },
    })
    expect(committed.id).not.toBe(other.id)
    expect(Object.isFrozen(committed)).toBe(true)
    expect(Object.isFrozen(committed.renderPayload)).toBe(true)
    expect(Object.isFrozen(contribution)).toBe(false)
    expect(committed.renderPayload).not.toBe(contribution.renderPayload)
  })

  it('rejects legacy page authority even when hidden in a non-enumerable property', () => {
    const contribution: Record<string, unknown> = {
      inlineSize: 80,
      blockSize: 50,
      consumedRange: { startBlockOffset: 0, endBlockOffset: 50 },
      diagnostics: [],
    }
    Object.defineProperty(contribution, 'pageIndex', { value: 9, enumerable: false })

    expect(() => commitMaterialFragment({
      plan: makePlan(50),
      startBlockOffset: 0,
      endBlockOffset: 50,
      availableHeight: 50,
      pageIndex: 0,
    }, contribution as unknown as MaterialFragmentContribution, { x: 0, y: 0 })).toThrow('MATERIAL_FRAGMENT_LEGACY_FIELD')
  })

  it('rejects invalid range, size, diagnostic identity, JSON, request, and placement facts', () => {
    const plan = makePlan(50)
    const base: MaterialFragmentContribution = {
      inlineSize: 80,
      blockSize: 50,
      consumedRange: { startBlockOffset: 0, endBlockOffset: 50 },
      diagnostics: [],
    }
    const request = { plan, startBlockOffset: 0, endBlockOffset: 50, availableHeight: 50, pageIndex: 0 }

    expect(() => commitMaterialFragment(request, { ...base, consumedRange: { startBlockOffset: 0, endBlockOffset: 49 } }, { x: 0, y: 0 })).toThrow('MATERIAL_FRAGMENT_RANGE_MISMATCH')
    expect(() => commitMaterialFragment(request, { ...base, inlineSize: -1 }, { x: 0, y: 0 })).toThrow('MATERIAL_FRAGMENT_BOX_INVALID')
    expect(() => commitMaterialFragment(request, {
      ...base,
      diagnostics: [{ code: 'X', severity: 'info', message: 'x', instanceKey: 'spoof', nodeId: plan.nodeId }],
    }, { x: 0, y: 0 })).toThrow('MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    expect(() => commitMaterialFragment(request, {
      ...base,
      diagnostics: [{
        code: 'X',
        severity: 'info',
        message: 'x',
        instanceKey: plan.instanceKey,
        nodeId: plan.nodeId,
        detail: { bad: undefined } as never,
      }],
    }, { x: 0, y: 0 })).toThrow('MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    expect(() => commitMaterialFragment(request, { ...base, renderPayload: { bad: undefined } as never }, { x: 0, y: 0 })).toThrow('MATERIAL_FRAGMENT_RENDER_PAYLOAD_INVALID')
    expect(() => commitMaterialFragment({ ...request, pageIndex: -1 }, base, { x: 0, y: 0 })).toThrow('MATERIAL_FRAGMENT_REQUEST_INVALID')
    expect(() => commitMaterialFragment(request, base, { x: Number.NaN, y: 0 })).toThrow('MATERIAL_FRAGMENT_PLACEMENT_INVALID')
  })

  it('rejects request and placement accessors before reading runtime facts', () => {
    const plan = makePlan(50)
    const contribution: MaterialFragmentContribution = {
      inlineSize: 80,
      blockSize: 50,
      consumedRange: { startBlockOffset: 0, endBlockOffset: 50 },
      diagnostics: [],
    }
    const request = { plan, startBlockOffset: 0, endBlockOffset: 50, availableHeight: 50, pageIndex: 0 }
    const accessorRequest = { ...request }
    Object.defineProperty(accessorRequest, 'pageIndex', { get: () => 0, enumerable: true })
    const accessorPlacement = { x: 0, y: 0 }
    Object.defineProperty(accessorPlacement, 'x', { get: () => 0, enumerable: true })

    expect(() => commitMaterialFragment(accessorRequest, contribution, { x: 0, y: 0 })).toThrow('MATERIAL_FRAGMENT_REQUEST_INVALID')
    expect(() => commitMaterialFragment(request, contribution, accessorPlacement)).toThrow('MATERIAL_FRAGMENT_PLACEMENT_INVALID')
  })

  it('accepts only size deviations within the fragment tolerance', () => {
    const plan = makePlan(50)
    const request = { plan, startBlockOffset: 0, endBlockOffset: 50, availableHeight: 50, pageIndex: 0 }
    const contribution: MaterialFragmentContribution = {
      inlineSize: 80 + 5e-10,
      blockSize: 50 - 5e-10,
      consumedRange: { startBlockOffset: 0, endBlockOffset: 50 },
      diagnostics: [],
    }

    expect(() => commitMaterialFragment(request, contribution, { x: 0, y: 0 })).not.toThrow()
    expect(() => commitMaterialFragment(request, { ...contribution, inlineSize: 80 + 2e-9 }, { x: 0, y: 0 })).toThrow('MATERIAL_FRAGMENT_BOX_INVALID')
  })
})

describe('runPagination', () => {
  it('owns a monotonic multi-page cursor and commits adapter contributions', () => {
    const schema = makeSchema([makeNode('table', { height: 240 })])
    const plan = makePlan(240, [{ offset: 90 }, { offset: 180 }])
    const document = runLayoutPipeline(schema, { plans: new Map([['table', plan]]) })
    const requested: Array<[number, number]> = []

    const result = runPagination(schema, document, {
      resolveFragmentAdapter: () => ({
        createFragment(request) {
          requested.push([request.startBlockOffset, request.endBlockOffset])
          return {
            inlineSize: request.plan.borderBox.width,
            blockSize: request.endBlockOffset - request.startBlockOffset,
            consumedRange: { startBlockOffset: request.startBlockOffset, endBlockOffset: request.endBlockOffset },
            renderPayload: { range: [request.startBlockOffset, request.endBlockOffset] },
            diagnostics: [],
          }
        },
      }),
    })

    expect(requested).toEqual([[0, 90], [90, 180], [180, 240]])
    expect(result.pages).toHaveLength(3)
    expect(result.pages.map(page => page.fragments[0]!.fragmentPlan?.consumedRange)).toEqual([
      { startBlockOffset: 0, endBlockOffset: 90 },
      { startBlockOffset: 90, endBlockOffset: 180 },
      { startBlockOffset: 180, endBlockOffset: 240 },
    ])
    expect(result.pages[1]!.fragments[0]!.fragmentPlan?.box.y).toBe(100)
    expect(result.pages[1]!.fragments[0]!.fragmentPlan?.renderPayload).toEqual({ range: [90, 180] })
    expect(new Set(result.pages.map(page => page.fragments[0]!.fragmentPlan?.id)).size).toBe(3)
  })

  it('selects a later boundary on overflow, reports it, and still terminates', () => {
    const schema = makeSchema([makeNode('table', { height: 250 })])
    const plan = makePlan(250, [{ offset: 120 }, { offset: 240 }])
    const document = runLayoutPipeline(schema, { plans: new Map([['table', plan]]) })
    let calls = 0

    const result = runPagination(schema, document, {
      resolveFragmentAdapter: () => ({
        createFragment(request) {
          calls += 1
          if (calls > 3)
            throw new Error('pagination did not terminate')
          return {
            inlineSize: 80,
            blockSize: request.endBlockOffset - request.startBlockOffset,
            consumedRange: { startBlockOffset: request.startBlockOffset, endBlockOffset: request.endBlockOffset },
            diagnostics: [],
          }
        },
      }),
    })

    expect(calls).toBe(3)
    expect(result.pages.flatMap(page => page.fragments).map(fragment => fragment.fragmentPlan?.consumedRange)).toEqual([
      { startBlockOffset: 0, endBlockOffset: 120 },
      { startBlockOffset: 120, endBlockOffset: 240 },
      { startBlockOffset: 240, endBlockOffset: 250 },
    ])
    expect(result.diagnostics.filter(diagnostic => diagnostic.code === 'MATERIAL_FRAGMENT_OVERFLOW')).toHaveLength(2)
  })

  it('uses a core-owned full contribution without an adapter and cannot loop on over-tall content', () => {
    const schema = makeSchema([makeNode('plain', { type: 'rect', height: 250 })])
    const plan = freezeMaterialLayoutPlan({ ...makePlan(250), instanceKey: 'plain', nodeId: 'plain', breakOpportunities: [] })
    const document = runLayoutPipeline(schema, { plans: new Map([['plain', plan]]) })

    const result = runPagination(schema, document)

    expect(result.pages).toHaveLength(1)
    expect(result.pages[0]!.fragments[0]!.fragmentPlan).toMatchObject({
      sourceInstanceKey: 'plain',
      consumedRange: { startBlockOffset: 0, endBlockOffset: 250 },
    })
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'MATERIAL_FRAGMENT_OVERFLOW')).toBe(true)
  })

  it('reuses exact embedded fragment payload facts without trusting embedded authority fields', () => {
    const schema = makeSchema([makeNode('plain', { type: 'rect', y: 0, height: 50 })])
    const basePlan = makePlan(50)
    const plan = freezeMaterialLayoutPlan({
      ...basePlan,
      instanceKey: 'plain',
      nodeId: 'plain',
      borderBox: { ...basePlan.borderBox, y: 0 },
      contentBox: { ...basePlan.contentBox, y: 0 },
    })
    const document = runLayoutPipeline(schema, { plans: new Map([['plain', plan]]) })
    document.fragments = [{
      ...document.fragments[0]!,
      fragmentPlan: freezeMaterialFragmentPlan({
        id: 'embedded-id-is-not-authoritative',
        sourceInstanceKey: 'plain',
        sourceNodeId: 'plain',
        box: { x: 99, y: 99, width: 80, height: 50 },
        consumedRange: { startBlockOffset: 0, endBlockOffset: 50 },
        renderPayload: { embedded: true },
        diagnostics: [],
      }),
    }]

    const result = runPagination(schema, document)
    const committed = result.pages[0]!.fragments[0]!.fragmentPlan!

    expect(committed.renderPayload).toEqual({ embedded: true })
    expect(committed.id).not.toBe('embedded-id-is-not-authoritative')
    expect(committed.box).toEqual({ x: 4, y: 0, width: 80, height: 50 })
  })

  it('warns when fixed-sheets fragments overflow their owning page', () => {
    const schema = {
      ...makeSchema([
        makeNode('wide', { type: 'rect', x: 70, y: 10, width: 20, height: 20 }),
        makeNode('tall', { type: 'rect', x: 0, y: 90, width: 20, height: 20 }),
      ]),
      page: {
        ...makeSchema([]).page,
        layout: { strategy: 'absolute' as const },
        reflow: { strategy: 'measure-only' as const },
        pagination: { strategy: 'fixed-sheets' as const, pageCount: 1 },
      },
    }
    const document = createLayoutDocument(schema)

    const result = runPagination(schema, document)

    expect(result.diagnostics.filter(d => d.code === 'FIXED_SHEETS_FRAGMENT_OVERFLOW').map(d => d.sourceNodeId)).toEqual([
      'wide',
      'tall',
    ])
  })
})

function createLayoutDocument(schema: DocumentSchema) {
  const constraintKey = createLayoutConstraintKey({
    availableWidth: schema.page.width,
    availableHeight: schema.page.height,
    unit: schema.unit,
    writingMode: 'horizontal-tb',
  })
  const plans = new Map(schema.elements.map((node) => {
    const borderBox = { x: node.x, y: node.y, width: node.width, height: node.height }
    return [node.id, createNonFragmentingMaterialPlans({
      instanceKey: node.id,
      nodeId: node.id,
      nodeRevision: 0,
      constraintKey,
      pageIndex: 0,
      borderBox,
      fragmentBox: borderBox,
    }).layoutPlan]
  }))
  return runLayoutPipeline(schema, { plans })
}
