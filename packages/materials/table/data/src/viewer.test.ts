import type { MaterialNode } from '@easyink/schema'
import { createFragmentFromNode } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createDefaultDataTableModel } from './schema'
import { measureTableData, tableDataFragmentPaginator } from './viewer'

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
})
