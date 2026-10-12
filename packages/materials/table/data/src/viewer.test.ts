import type { LayoutRuntimeRef } from '@easyink/core'
import type { ViewerContext } from '@easyink/plugin-api/viewer'
import type { TableNode } from '@easyink/schema'
import { createFragmentFromNode, readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createTableDataNode } from './schema'
import { createTableDataSession, renderTableData } from './viewer'

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
  it('splits prepared runtime rows without mutating the source or accumulating repeated measurement', async () => {
    const node = createTableDataNode() as TableNode
    const originalRowCount = node.table.topology.rows.length
    node.table.topology.rows[1]!.cells[0]!.binding = { sourceId: 'invoice', fieldPath: 'items/name' }
    node.table.topology.rows[1]!.cells[1]!.binding = { sourceId: 'invoice', fieldPath: 'items/qty' }
    let nextRef = 0
    const sessionId = Symbol('test-session')
    const runtimeRef: LayoutRuntimeRef = { session: sessionId, fragment: ++nextRef }
    const resources = { signal: new AbortController().signal, onDispose: () => {} }
    const session = createTableDataSession(resources)
    const context: ViewerContext = {
      ...resources,
      runtimeRef,
      document,
      resolvedProps: node.props,
      pageIndex: 0,
      pageNumber: 1,
      totalPages: 1,
      copyIndex: 0,
      zoom: 1,
      reportDiagnostic: () => {},
      data: {
        items: [
          { name: 'A', qty: 1 },
          { name: 'B', qty: 2 },
          { name: 'C', qty: 3 },
        ],
      },
      unit: 'mm',
    }
    await session.prepare!(node, context)
    const measured = session.measure!(node, context)
    expect(session.measure!({ ...node, height: measured.height }, context)).toEqual(measured)

    const result = session.fragmentPaginator!.paginateFragment({
      fragment: { ...createFragmentFromNode(node), runtimeRef },
      availableHeight: 24,
      pageContext: { pageIndex: 0 },
      createFragment: child => ({ ...createFragmentFromNode(child), sourceNodeId: node.id, runtimeRef: { session: sessionId, fragment: ++nextRef } }),
    })

    expect(result.nextPage).toBeDefined()
    expect(result.currentPage.node.id).toContain('__p0')
    expect(result.nextPage!.node.id).toContain('__p1')
    expect((result.currentPage.node as TableNode).table.topology.rows.length).toBeGreaterThan(0)
    expect(node.table.topology.rows).toHaveLength(originalRowCount)
    expect(result.nextPage!.runtimeRef).not.toBe(runtimeRef)
    expect(session.fragmentPaginator!.getRemainingContent!(result.nextPage!)).toBeLessThan(3)
    const nextContext = { ...context, runtimeRef: result.nextPage!.runtimeRef! }
    const html = readTrustedViewerHtml(session.render(result.nextPage!.node, nextContext).html!)
    expect(html).toContain('C')
    expect(html).not.toContain('>A<')
  })
})
