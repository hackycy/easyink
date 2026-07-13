import type { MaterialMeasureRequest, ViewerElementTree, ViewerRenderTree } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { createFragmentFromNode, createLayoutConstraintKey, createNonFragmentingMaterialPlans, freezeMaterialLayoutPlan, runLayoutPipeline, runPagination, viewerText } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultDataTableModel } from './schema'
import { measureTableData, renderTableData, tableDataFragmentAdapter, tableDataViewerLayout } from './viewer'

function createNode(): MaterialNode {
  return {
    id: 'table-data',
    type: 'table-data',
    x: 0,
    y: 0,
    width: 100,
    height: 24,
    modelVersion: 1,
    model: { ...createDefaultDataTableModel() },
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

describe('tableDataFragmentAdapter', () => {
  it('contributes only the exact range requested by core', () => {
    const plan = createTestFragment(createNode()).plan
    const contribution = tableDataFragmentAdapter.createFragment({
      plan,
      startBlockOffset: 4,
      endBlockOffset: 12,
      availableHeight: 8,
      pageIndex: 1,
    })

    expect(contribution).toEqual({
      inlineSize: plan.borderBox.width,
      blockSize: 8,
      consumedRange: { startBlockOffset: 4, endBlockOffset: 12 },
      renderPayload: { startBlockOffset: 4, endBlockOffset: 12 },
      diagnostics: [],
    })
    expect(contribution).not.toHaveProperty('box')
    expect(contribution).not.toHaveProperty('pageIndex')
  })

  it('selects measured row identities wholly contained in the requested range', () => {
    const base = createTestFragment(createNode()).plan
    const plan = freezeMaterialLayoutPlan({
      ...base,
      payload: {
        kind: 'table-data-layout',
        columnIds: ['column-a'],
        rows: [
          { rowIndex: 0, canonicalRowId: 'header', sourceRowKey: 'header', bandRole: 'header', startBlockOffset: 0, endBlockOffset: 4 },
          { rowIndex: 1, canonicalRowId: 'detail', sourceRowKey: 'detail:key-a', bandRole: 'detail', startBlockOffset: 4, endBlockOffset: 12 },
          { rowIndex: 2, canonicalRowId: 'footer', sourceRowKey: 'footer', bandRole: 'footer', startBlockOffset: 12, endBlockOffset: 16 },
        ],
      },
    })

    const contribution = tableDataFragmentAdapter.createFragment({
      plan,
      startBlockOffset: 4,
      endBlockOffset: 12,
      availableHeight: 8,
      pageIndex: 1,
    })

    expect(contribution.renderPayload).toEqual({
      kind: 'table-data-fragment',
      startBlockOffset: 4,
      endBlockOffset: 12,
      rows: [
        { rowIndex: 1, canonicalRowId: 'detail', sourceRowKey: 'detail:key-a', bandRole: 'detail', startBlockOffset: 4, endBlockOffset: 12 },
      ],
    })
  })

  it('keeps authoring-preview measurement independent from runtime collection expansion', async () => {
    const node = createNode()
    node.bindings.records = { sourceId: 'invoice', fieldPath: 'items' }
    const openCollection = vi.fn(() => {
      throw new Error('preview must not open runtime records')
    })
    const request = {
      mode: 'authoring-preview',
      instanceKey: node.id,
      node,
      scope: { key: 'document', data: { items: Array.from({ length: 10 }, () => ({})) } },
      resolvedModel: node.model,
      nodeRevision: 1,
      dataRevision: 1,
      resourceRevision: 1,
      constraints: { availableWidth: 100, availableHeight: 100, unit: 'mm', writingMode: 'horizontal-tb' },
      signal: new AbortController().signal,
      budget: {
        maxRuntimeRows: 10,
        maxLayoutFacts: 10,
        runtimeRowsUsed: 0,
        layoutFactsUsed: 0,
        reserveRuntimeRows: vi.fn(),
        reserveLayoutFacts: vi.fn(),
      },
      resolveBinding: () => ({ status: 'missing' }),
      formatBinding: () => ({ status: 'missing' }),
      openCollection,
      schedule: {} as never,
      measureText: vi.fn(),
      measureSlot: vi.fn(),
    } as unknown as MaterialMeasureRequest

    const plan = await tableDataViewerLayout.measure!(request)

    expect(openCollection).not.toHaveBeenCalled()
    expect((plan.payload as { rows: unknown[] }).rows).toHaveLength(3)
    expect(Object.isFrozen(plan)).toBe(true)
  })

  it('lets core commit 200 monotonic ranges with stable identities across 50+ pages', () => {
    const first = paginateWithCore(200)
    const second = paginateWithCore(200)

    expect(first.pageCount).toBeGreaterThan(50)
    expect(first.diagnostics).toEqual([])
    expect(first.sourceInstanceKeys.every(id => id === 'table-data')).toBe(true)
    expect(new Set(first.fragmentIds).size).toBe(first.fragmentIds.length)
    expect(first.ranges.every((range, index) => index === 0 || range.startBlockOffset === first.ranges[index - 1]!.endBlockOffset)).toBe(true)
    expect(second).toEqual(first)
  })

  it('expands records from the configured collection port without requiring detail cell bindings', () => {
    const node = createNode()
    const model = tableModel(node)
    model.data.collectionPort = 'orders'
    node.bindings.orders = { sourceId: 'invoice', fieldPath: 'orders' }

    const output = renderTableData(node, renderContext({ orders: [{ id: 1 }, { id: 2 }] })).tree

    expect(bodyRows(output)).toHaveLength(2)
  })

  it('splits projected runtime rows without mutating the canonical model', () => {
    const node = createNode()
    const model = tableModel(node)
    const detailCells = model.bands.find(band => band.role === 'detail')!.rows[0]!.cells
    detailCells[0]!.content = { kind: 'text', text: '', bindingPort: 'detail:name' }
    detailCells[1]!.content = { kind: 'text', text: '', bindingPort: 'detail:qty' }
    node.bindings.records = { sourceId: 'invoice', fieldPath: 'items' }
    node.bindings['detail:name'] = { sourceId: 'invoice', fieldPath: 'items/name' }
    node.bindings['detail:qty'] = { sourceId: 'invoice', fieldPath: 'items/qty' }
    const before = structuredClone(model)

    measureTableData(node, {
      data: { items: [{ name: 'A', qty: 1 }, { name: 'B', qty: 2 }, { name: 'C', qty: 3 }] },
      unit: 'mm',
    })
    const plan = createTestFragment(node).plan
    const result = tableDataFragmentAdapter.createFragment({
      plan,
      startBlockOffset: 0,
      endBlockOffset: 20,
      availableHeight: 20,
      pageIndex: 0,
    })

    expect(result.consumedRange).toEqual({ startBlockOffset: 0, endBlockOffset: 20 })
    expect(model).toEqual(before)
  })

  it('reuses canonical detail slots for every expanded record without shifting footer identities', () => {
    const node = createNode()
    const model = tableModel(node)
    const detail = model.bands.find(band => band.role === 'detail')!.rows[0]!
    const footer = model.bands.find(band => band.role === 'footer')!.rows[0]!
    const hosted = detail.cells[0]!
    hosted.content = { kind: 'materials', slotId: `cell:${hosted.id}` }
    node.bindings.records = { sourceId: 'invoice', fieldPath: 'items' }

    const output = renderTableData(node, createTestViewerRenderContext({
      data: { items: [{ name: 'A' }, { name: 'B' }] },
      resolvedModel: {},
      capabilities: { sanitizeMarkup: () => { throw new Error('unused') } },
      slotOutputs: { [`cell:${hosted.id}`]: [viewerText('HOSTED')] },
    })).tree
    const json = JSON.stringify(output)

    expect(json.match(/HOSTED/g)).toHaveLength(2)
    const headerIds = findElements(output, 'th').map(cell => String(cell.attributes.id))
    const bodyCells = findElements(output, 'tbody').flatMap(body => findElements(body, 'td'))
    const footerCells = findElements(output, 'tfoot').flatMap(footerTree => findElements(footerTree, 'td'))
    expect(new Set(findElements(output, 'tr').concat(findElements(output, 'th'), findElements(output, 'td')).map(element => element.attributes.id)).size)
      .toBe(findElements(output, 'tr').length + findElements(output, 'th').length + findElements(output, 'td').length)
    expect(bodyCells.filter(cell => JSON.stringify(cell).includes('HOSTED'))).toHaveLength(2)
    bodyCells.forEach((cell, index) => expect(cell.attributes.headers).toBe(headerIds[index % headerIds.length]))
    expect(footerCells).toHaveLength(footer.cells.length)
    expect(footerCells.every(cell => !bodyCells.some(body => body.attributes.id === cell.attributes.id))).toBe(true)
  })

  it('keeps keyed row and cell ids stable when records reorder', () => {
    const node = createNode()
    const model = tableModel(node)
    model.data.collectionPort = 'orders'
    model.data.detailKeyPort = 'orderId'
    const detail = model.bands.find(band => band.role === 'detail')!.rows[0]!
    detail.cells[0]!.content = { kind: 'text', text: '', bindingPort: 'detail:name' }
    node.bindings.orders = { sourceId: 'invoice', fieldPath: 'orders' }
    node.bindings.orderId = { sourceId: 'invoice', fieldPath: 'orders/id' }
    node.bindings['detail:name'] = { sourceId: 'invoice', fieldPath: 'orders/name' }

    const first = renderTableData(node, renderContext({ orders: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] })).tree
    const second = renderTableData(node, renderContext({ orders: [{ id: 'b', name: 'Beta' }, { id: 'a', name: 'Alpha' }] })).tree

    expect(rowIdentityByText(second)).toEqual(rowIdentityByText(first))
  })

  it('uses unique deterministic fallbacks and reports duplicate or missing detail keys', () => {
    const node = createNode()
    const model = tableModel(node)
    model.data.detailKeyPort = 'detailKey'
    node.bindings.records = { sourceId: 'invoice', fieldPath: 'items' }
    node.bindings.detailKey = { sourceId: 'invoice', fieldPath: 'items/id' }
    const diagnostics: Array<{ code: string }> = []
    const data = { items: [{ id: 'same' }, { id: 'same' }, { name: 'missing' }] }

    const first = renderTableData(node, renderContext(data, diagnostic => diagnostics.push(diagnostic))).tree
    const second = renderTableData(node, renderContext(data)).tree
    const firstIds = bodyRows(first).map(row => row.attributes.id)

    expect(new Set(firstIds).size).toBe(3)
    expect(bodyRows(second).map(row => row.attributes.id)).toEqual(firstIds)
    expect(diagnostics.map(item => item.code)).toEqual([
      'TABLE_DATA_DETAIL_KEY_DUPLICATE',
      'TABLE_DATA_DETAIL_KEY_DUPLICATE',
      'TABLE_DATA_DETAIL_KEY_MISSING',
    ])
  })

  it('does not disturb keyed row metadata while contributing a range', () => {
    const node = createNode()
    const model = tableModel(node)
    model.data.detailKeyPort = 'detailKey'
    node.bindings.records = { sourceId: 'invoice', fieldPath: 'items' }
    node.bindings.detailKey = { sourceId: 'invoice', fieldPath: 'items/id' }
    const data = { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
    measureTableData(node, { data, unit: 'mm' })
    const before = bodyRows(renderTableData(node, renderContext(data)).tree).map(row => row.attributes.id)
    const plan = createTestFragment(node).plan

    tableDataFragmentAdapter.createFragment({
      plan,
      startBlockOffset: 0,
      endBlockOffset: 20,
      availableHeight: 20,
      pageIndex: 0,
    })
    const after = bodyRows(renderTableData(node, renderContext(data)).tree).map(row => row.attributes.id)

    expect(after).toEqual(before)
  })
})

function renderContext(data: Record<string, unknown>, reportDiagnostic?: (diagnostic: any) => void) {
  return createTestViewerRenderContext({
    data,
    resolvedModel: {},
    capabilities: { sanitizeMarkup: () => { throw new Error('unused') } },
    reportDiagnostic,
  })
}

function createTestFragment(node: MaterialNode) {
  const constraints = {
    availableWidth: node.width,
    availableHeight: node.height,
    unit: 'mm' as const,
    writingMode: 'horizontal-tb' as const,
  }
  const borderBox = { x: node.x, y: node.y, width: node.width, height: node.height }
  const plan = createNonFragmentingMaterialPlans({
    instanceKey: node.id,
    nodeId: node.id,
    nodeRevision: 0,
    constraintKey: createLayoutConstraintKey(constraints),
    pageIndex: 0,
    borderBox,
    fragmentBox: borderBox,
  }).layoutPlan
  return createFragmentFromNode(node, plan)
}

function paginateWithCore(recordCount: number) {
  const node = createNode()
  node.height = recordCount
  const schema: DocumentSchema = {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'fixed',
      width: 100,
      height: 3,
      pageModel: { kind: 'paged-paper', paper: { width: 100, height: 3 } },
      layout: { strategy: 'absolute' },
      reflow: { strategy: 'measure-only' },
      pagination: { strategy: 'auto-sheets' },
    },
    guides: { x: [], y: [] },
    elements: [node],
  }
  const constraints = { availableWidth: schema.page.width, availableHeight: schema.page.height, unit: schema.unit, writingMode: 'horizontal-tb' as const }
  const borderBox = { x: node.x, y: node.y, width: node.width, height: recordCount }
  const fallbackPlan = createNonFragmentingMaterialPlans({
    instanceKey: node.id,
    nodeId: node.id,
    nodeRevision: 0,
    constraintKey: createLayoutConstraintKey(constraints),
    pageIndex: 0,
    borderBox,
    fragmentBox: borderBox,
  }).layoutPlan
  const measuredPlan = freezeMaterialLayoutPlan({
    ...fallbackPlan,
    breakOpportunities: Array.from({ length: recordCount - 1 }, (_, index) => ({
      id: `row-${index + 1}`,
      blockOffset: index + 1,
      penalty: 0,
    })),
  })
  const layout = runLayoutPipeline(schema, { plans: new Map([[node.id, measuredPlan]]) })
  const pagination = runPagination(schema, layout, {
    resolveFragmentAdapter: fragment => fragment.node.type === 'table-data' ? tableDataFragmentAdapter : undefined,
  })
  const fragments = pagination.pages.flatMap(page => page.fragments)
  return {
    diagnostics: pagination.diagnostics,
    pageCount: pagination.pages.length,
    fragmentIds: fragments.map(fragment => fragment.fragmentPlan!.id),
    sourceInstanceKeys: fragments.map(fragment => fragment.fragmentPlan!.sourceInstanceKey),
    ranges: fragments.map(fragment => fragment.fragmentPlan!.consumedRange),
  }
}

function tableModel(node: MaterialNode): ReturnType<typeof createDefaultDataTableModel> {
  return node.model as unknown as ReturnType<typeof createDefaultDataTableModel>
}

function bodyRows(tree: ViewerRenderTree): ViewerElementTree[] {
  return findElements(tree, 'tbody').flatMap(body => findElements(body, 'tr'))
}

function rowIdentityByText(tree: ViewerRenderTree): Record<string, string> {
  return Object.fromEntries(bodyRows(tree).map(row => [
    JSON.stringify(row).includes('Alpha') ? 'Alpha' : 'Beta',
    String(row.attributes.id),
  ]))
}

function findElements(tree: ViewerRenderTree, tag: string): ViewerElementTree[] {
  if (tree.kind !== 'element')
    return []
  return [
    ...(tree.tag === tag ? [tree] : []),
    ...tree.children.flatMap(child => findElements(child, tag)),
  ]
}
