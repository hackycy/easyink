import type { ViewerElementTree, ViewerRenderTree } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createFragmentFromNode, viewerText } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createDefaultDataTableModel } from './schema'
import { measureTableData, renderTableData, tableDataFragmentPaginator } from './viewer'

function createNode(): MaterialNode<unknown> {
  return {
    id: 'table-data',
    type: 'table-data',
    x: 0,
    y: 0,
    width: 100,
    height: 24,
    modelVersion: 1,
    model: createDefaultDataTableModel(),
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

describe('tableDataFragmentPaginator', () => {
  it('splits projected runtime rows without mutating the canonical model', () => {
    const node = createNode()
    const model = node.model as ReturnType<typeof createDefaultDataTableModel>
    const detailCells = model.bands.find(band => band.role === 'detail')!.rows[0]!.cells
    detailCells[0]!.content = { kind: 'text', text: '', bindingPort: 'detail:name' }
    detailCells[1]!.content = { kind: 'text', text: '', bindingPort: 'detail:qty' }
    node.bindings['detail:name'] = { sourceId: 'invoice', fieldPath: 'items/name' }
    node.bindings['detail:qty'] = { sourceId: 'invoice', fieldPath: 'items/qty' }
    const before = structuredClone(model)

    measureTableData(node, {
      data: { items: [{ name: 'A', qty: 1 }, { name: 'B', qty: 2 }, { name: 'C', qty: 3 }] },
      unit: 'mm',
    })
    const result = tableDataFragmentPaginator.paginateFragment({
      fragment: createFragmentFromNode(node),
      availableHeight: 24,
      pageContext: { pageIndex: 0 },
    })

    expect(result.nextPage).toBeDefined()
    expect(result.currentPage.node.id).toContain('__p0')
    expect(result.nextPage!.node.id).toContain('__p1')
    expect(model).toEqual(before)
  })

  it('reuses canonical detail slots for every expanded record without shifting footer identities', () => {
    const node = createNode()
    const model = node.model as ReturnType<typeof createDefaultDataTableModel>
    const detail = model.bands.find(band => band.role === 'detail')!.rows[0]!
    const footer = model.bands.find(band => band.role === 'footer')!.rows[0]!
    const hosted = detail.cells[0]!
    hosted.content = { kind: 'materials', slotId: `cell:${hosted.id}` }
    detail.cells[1]!.content = { kind: 'text', text: '', bindingPort: 'detail:name' }
    node.bindings['detail:name'] = { sourceId: 'invoice', fieldPath: 'items/name' }

    const output = renderTableData(node, {
      data: { items: [{ name: 'A' }, { name: 'B' }] },
      resolvedProps: {},
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      capabilities: { sanitizeMarkup: () => { throw new Error('unused') } },
      slotOutputs: { [`cell:${hosted.id}`]: [viewerText('HOSTED')] },
    }).tree
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
})

function findElements(tree: ViewerRenderTree, tag: string): ViewerElementTree[] {
  if (tree.kind !== 'element')
    return []
  return [
    ...(tree.tag === tag ? [tree] : []),
    ...tree.children.flatMap(child => findElements(child, tag)),
  ]
}
