import type { TableNode } from '@easyink/schema'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { canResizeTableDataRow, createTableDataExtension } from './designer'
import { createTableDataNode } from './schema'

const schema = normalizeDocumentSchema({ unit: 'mm' })

const context = {
  getSchema: () => schema,
  getNode: () => undefined,
  getSelection: () => ({ ids: [], count: 0, isEmpty: true }),
  getBindingLabel: () => '',
  commitCommand: () => {},
  tx: {
    run: () => {},
    batch: () => {},
  },
  requestPropertyPanel: () => {},
  emit: () => {},
  on: () => () => {},
  getZoom: () => 1,
  getPageEl: () => null,
  t: (key: string) => key,
}

describe('table-data designer', () => {
  it('creates a default node tall enough for template and preview rows', () => {
    const node = createTableDataNode()

    expect(node.width).toBe(180)
    expect(node.height).toBe(40)
    expect(node.props?.headerBackground).toBe('')
    expect(node.props?.summaryBackground).toBe('')
  })

  it('declares runtime height as disabled and hides outer resize handles', () => {
    const ext = createTableDataExtension(context as never)
    const policy = ext.resolveControlPolicy?.(createTableDataNode(), { getSchema: context.getSchema, t: context.t })

    expect(policy?.geometry?.height?.state).toBe('disabled')
    expect(policy?.resize?.width?.state).toBe('hidden')
    expect(policy?.resize?.height?.state).toBe('hidden')
  })

  it('allows row resize on visible header, repeat-template, and footer rows', () => {
    const node = createTableDataNode() as TableNode

    expect(canResizeTableDataRow(node, 0)).toBe(true)
    expect(canResizeTableDataRow(node, 1)).toBe(true)
    expect(canResizeTableDataRow(node, 2)).toBe(true)
  })

  it('renders section labels as absolute overlays and keeps preview row texture', () => {
    const node = createTableDataNode() as TableNode
    const ext = createTableDataExtension({
      ...context,
      t: (key: string) => {
        if (key === 'materials.tableData.section.header')
          return '表头'
        if (key === 'materials.tableData.section.data')
          return '数据行'
        if (key === 'materials.tableData.section.footer')
          return '表尾'
        return key
      },
    } as never)
    const container = document.createElement('div')
    const unsubscribe = ext.renderContent?.({
      get: () => node,
      subscribe: () => () => {},
    } as never, container)

    expect(container.innerHTML).toContain('repeating-linear-gradient')
    expect(container.innerHTML).toContain('pointer-events:none')
    expect(container.innerHTML).toContain('position:absolute')
    expect(container.innerHTML).toContain('表头')
    expect(container.innerHTML).toContain('数据行')
    expect(container.innerHTML).toContain('表尾')
    expect(container.innerHTML).not.toContain('rgba(24,144,255')

    unsubscribe?.()
  })
})
