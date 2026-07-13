import type { ViewerElementTree, ViewerRenderTree } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { createFragmentFromNode, runLayoutPipeline, runPagination, viewerText } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { createDefaultDataTableModel } from './schema'
import { measureTableData, renderTableData, tableDataFragmentPaginator } from './viewer'

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

describe('tableDataFragmentPaginator', () => {
  it('paginates 200 records recursively with stable bounded identities across 50+ pages', () => {
    const first = paginateAndRender(200)
    const second = paginateAndRender(200)

    expect(first.pageTrees.length).toBeGreaterThan(50)
    expect(first.diagnostics).toEqual([])
    expect(first.sourceNodeIds.every(id => id === 'table-data')).toBe(true)
    expect(first.fragmentIds).toEqual(first.fragmentIds.map((_, index) => `table-data__p${index}`))
    expect(new Set(first.fragmentIds).size).toBe(first.fragmentIds.length)
    expect(new Set(first.domIds).size).toBe(first.domIds.length)
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
    const result = tableDataFragmentPaginator.paginateFragment({
      fragment: createFragmentFromNode(node),
      availableHeight: 20,
      pageContext: { pageIndex: 0 },
    })

    expect(result.nextPage).toBeDefined()
    expect(result.currentPage.node.id).toContain('__p0')
    expect(result.nextPage!.node.id).toContain('__p1')
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

  it('preserves keyed row metadata across pagination', () => {
    const node = createNode()
    const model = tableModel(node)
    model.data.detailKeyPort = 'detailKey'
    node.bindings.records = { sourceId: 'invoice', fieldPath: 'items' }
    node.bindings.detailKey = { sourceId: 'invoice', fieldPath: 'items/id' }
    const data = { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
    measureTableData(node, { data, unit: 'mm' })

    const pages = tableDataFragmentPaginator.paginateFragment({
      fragment: createFragmentFromNode(node),
      availableHeight: 20,
      pageContext: { pageIndex: 0 },
    })
    expect(pages.nextPage).toBeDefined()
    const rendered = [pages.currentPage, pages.nextPage!]
      .flatMap(page => bodyRows(renderTableData(page.node, renderContext(data)).tree))

    expect(new Set(rendered.map(row => row.attributes.id)).size).toBe(rendered.length)
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

function paginateAndRender(recordCount: number) {
  const node = createNode()
  const model = tableModel(node)
  model.data.detailKeyPort = 'detailKey'
  node.bindings.records = { sourceId: 'invoice', fieldPath: 'items' }
  node.bindings.detailKey = { sourceId: 'invoice', fieldPath: 'items/id' }
  const data = { items: Array.from({ length: recordCount }, (_, index) => ({ id: `record-${index}` })) }
  const measurement = measureTableData(node, { data, unit: 'mm' })
  const schema: DocumentSchema = {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'fixed',
      width: 100,
      height: 20,
      pageModel: { kind: 'paged-paper', paper: { width: 100, height: 20 } },
      layout: { strategy: 'absolute' },
      reflow: { strategy: 'measure-only' },
      pagination: { strategy: 'auto-sheets' },
    },
    guides: { x: [], y: [] },
    elements: [node],
  }
  const layout = runLayoutPipeline(schema, { measured: new Map([[node.id, measurement]]) })
  const pagination = runPagination(schema, layout, {
    resolveFragmentPaginator: fragment => fragment.node.type === 'table-data' ? tableDataFragmentPaginator : undefined,
  })
  const fragments = pagination.pages.flatMap(page => page.fragments)
  const pageTrees = fragments.map((fragment, pageIndex) => renderTableData(fragment.node, {
    ...renderContext(data),
    pageIndex,
  }).tree)
  return {
    diagnostics: pagination.diagnostics,
    fragmentIds: fragments.map(fragment => fragment.id),
    sourceNodeIds: fragments.map(fragment => fragment.sourceNodeId),
    domIds: pageTrees.flatMap(tree => findElements(tree, 'tr').concat(findElements(tree, 'th'), findElements(tree, 'td')).map(element => String(element.attributes.id))),
    pageTrees,
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
