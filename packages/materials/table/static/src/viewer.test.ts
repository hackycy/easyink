import type { MaterialNode } from '@easyink/schema'
import { projectTableTopology, renderPlainTextCell, renderTableHtml, resolveTableBaseProps } from '@easyink/material-table-kernel'
import { describe, expect, it } from 'vitest'
import { createDefaultStaticTableModel } from './schema'

describe('table-static canonical rendering input', () => {
  it('projects and escapes canonical text cell content', () => {
    const model = createDefaultStaticTableModel()
    model.bands[0]!.rows[0]!.cells[0]!.content = { kind: 'text', text: '<img src=x onerror=alert(1)>' }
    const node: MaterialNode<unknown> = {
      id: 'table',
      type: 'table-static',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      modelVersion: 1,
      model,
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }
    const html = renderTableHtml({
      topology: projectTableTopology(node).topology,
      props: resolveTableBaseProps(node),
      unit: 'mm',
      elementHeight: node.height,
      cellRenderer: cell => renderPlainTextCell(cell.content?.text),
    })

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
  })
})
