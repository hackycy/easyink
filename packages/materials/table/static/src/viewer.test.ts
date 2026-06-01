import type { TableNode } from '@easyink/schema'
import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createTableStaticNode } from './schema'
import { renderTableStatic } from './viewer'

describe('renderTableStatic', () => {
  it('escapes plain text cell content', () => {
    const node = createTableStaticNode() as TableNode
    node.table.topology.rows[0]!.cells[0]!.content = {
      text: '<img src=x onerror=alert(1)>',
    }

    const output = renderTableStatic(node)

    const html = readTrustedViewerHtml(output.html!)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
  })
})
