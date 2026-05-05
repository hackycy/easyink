import type { TableTopologySchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { renderTableHtml } from './render'
import { TABLE_BASE_DEFAULTS } from './types'

function renderSimpleTable(topology: TableTopologySchema): string {
  return renderTableHtml({
    topology,
    props: TABLE_BASE_DEFAULTS,
    unit: 'mm',
    elementHeight: 10,
    tableStyle: 'height:100%',
    cellRenderer: cell => cell.content?.text ?? '',
  })
}

describe('renderTableHtml', () => {
  it('keeps table borders inside the element box', () => {
    const html = renderSimpleTable({
      columns: [{ ratio: 1 }],
      rows: [{ height: 10, role: 'normal', cells: [{ content: { text: 'A' } }] }],
    })

    expect(html).toContain('border-collapse:separate')
    expect(html).toContain('border-spacing:0')
    expect(html).not.toContain('border-collapse:collapse')
  })

  it('renders shared internal borders once in separate border mode', () => {
    const html = renderSimpleTable({
      columns: [{ ratio: 0.5 }, { ratio: 0.5 }],
      rows: [{ height: 10, role: 'normal', cells: [{ content: { text: 'A' } }, { content: { text: 'B' } }] }],
    })

    expect(html).toContain('border-right:none')
    expect(html).toContain('border-left:0.26mm solid #000000')
  })
})
