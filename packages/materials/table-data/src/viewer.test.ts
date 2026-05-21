import type { TableNode } from '@easyink/schema'
import { createFragmentFromNode, readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createTableDataNode } from './schema'
import { measureTableData, renderTableData, tableDataFragmentPaginator } from './viewer'

describe('renderTableData', () => {
  it('escapes plain text cell content', () => {
    const node = createTableDataNode() as TableNode
    node.table.topology.rows[1]!.cells[0]!.content = {
      text: '<script>alert(1)</script>',
    }

    const output = renderTableData(node, {
      data: {},
      resolvedProps: node.props,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
    })

    const html = readTrustedViewerHtml(output.html!)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})

describe('tableDataFragmentPaginator', () => {
  it('splits measured runtime rows without mutating the source table', () => {
    const node = createTableDataNode() as TableNode
    const originalRowCount = node.table.topology.rows.length
    node.table.topology.rows[1]!.cells[0]!.binding = { sourceId: 'invoice', fieldPath: 'items/name' }
    node.table.topology.rows[1]!.cells[1]!.binding = { sourceId: 'invoice', fieldPath: 'items/qty' }
    measureTableData(node, {
      data: {
        items: [
          { name: 'A', qty: 1 },
          { name: 'B', qty: 2 },
          { name: 'C', qty: 3 },
        ],
      },
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
    expect((result.currentPage.node as TableNode).table.topology.rows.length).toBeGreaterThan(0)
    expect(node.table.topology.rows).toHaveLength(originalRowCount)
  })
})
