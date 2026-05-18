import type { FlowRowProps } from './schema'
import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { isFlowRowRuntimeRepeating, renderFlowRowsHtml } from './rendering'
import { createFlowRowNode, FLOW_ROW_DEFAULTS } from './schema'
import { measureFlowRow, renderFlowRow } from './viewer'

const viewerContext = {
  data: {},
  resolvedProps: {},
  pageIndex: 0,
  unit: 'mm',
  zoom: 1,
}

describe('flow-row viewer', () => {
  it('converts default physical props but preserves partial props in the requested unit', () => {
    const node = createFlowRowNode({
      props: {
        gap: 2,
        typography: {
          ...FLOW_ROW_DEFAULTS.typography,
          fontSize: 9,
        },
      },
    }, 'pt')
    const props = node.props as unknown as FlowRowProps

    expect(node.width).toBeGreaterThan(72)
    expect(node.height).toBeGreaterThan(26)
    expect(props.paddingX).toBeGreaterThan(2)
    expect(props.paddingY).toBeGreaterThan(2)
    expect(props.gap).toBe(2)
    expect(props.typography.fontSize).toBe(9)
  })

  it('renders block columns before following inline groups', () => {
    const node = createFlowRowNode({
      props: {
        columns: [
          { ratio: 1, textAlign: 'left', wrapMode: 'block', content: 'Long item name' },
          { ratio: 1, textAlign: 'center', wrapMode: 'inline', content: '2' },
          { ratio: 2, textAlign: 'right', wrapMode: 'inline', content: '6.00' },
        ],
      },
    })

    const html = readTrustedViewerHtml(renderFlowRow(node, viewerContext).html!)

    expect(html.indexOf('>Long item name<')).toBeLessThan(html.indexOf('>2<'))
    expect(html).toContain('width:33.333333%')
    expect(html).toContain('width:66.666667%')
  })

  it('uses node height as the material frame and renders designer repeat placeholders', () => {
    const node = createFlowRowNode({ height: 32 })
    const props = node.props as unknown as FlowRowProps
    const model = {
      rows: [props.columns.map((column, index) => ({
        column,
        index,
        text: column.content ?? '',
      }))],
    }

    const html = renderFlowRowsHtml(node, model, 'mm', { designer: true, placeholderRows: 1 })

    expect(html).toContain('height:100%')
    expect(html).toContain('min-height:32mm')
    expect(html).toContain('data-flow-row-preview="1"')
    expect(html).not.toContain('data-flow-row-preview="2"')
  })

  it('renders padded cells with horizontal and vertical alignment', () => {
    const node = createFlowRowNode({
      props: {
        paddingX: 2,
        paddingY: 3,
        columns: [
          { ratio: 1, textAlign: 'center', verticalAlign: 'middle', wrapMode: 'inline', content: 'Centered' },
          { ratio: 1, textAlign: 'right', verticalAlign: 'bottom', wrapMode: 'inline', content: 'Bottom' },
        ],
      },
    })

    const html = readTrustedViewerHtml(renderFlowRow(node, viewerContext).html!)

    expect(html).toContain('text-align:center')
    expect(html).toContain('justify-content:center')
    expect(html).toContain('text-align:right')
    expect(html).toContain('justify-content:flex-end')
    expect(html).toContain('padding:3mm 2mm')
  })

  it('reads legacy padding as both horizontal and vertical padding', () => {
    const node = createFlowRowNode({
      props: {
        padding: 4,
      },
    })
    const html = readTrustedViewerHtml(renderFlowRow(node, viewerContext).html!)

    expect(html).toContain('padding:4mm 4mm')
  })

  it('expands collection-bound rows and escapes resolved content', () => {
    const node = createFlowRowNode({
      height: 10,
      binding: { sourceId: 'receipt', fieldPath: 'items' },
      props: {
        columns: [
          {
            ratio: 1,
            textAlign: 'left',
            wrapMode: 'block',
            binding: { sourceId: 'receipt', fieldPath: 'items/name' },
          },
          {
            ratio: 1,
            textAlign: 'right',
            wrapMode: 'inline',
            binding: { sourceId: 'receipt', fieldPath: 'items/amount' },
          },
        ],
      },
    })

    const context = {
      ...viewerContext,
      data: {
        items: [
          { name: '<b>Burger</b>', amount: '68.00' },
          { name: 'Cola', amount: '6.00' },
        ],
      },
    }
    const html = readTrustedViewerHtml(renderFlowRow(node, context).html!)
    const measured = measureFlowRow(node, context)

    expect(html).toContain('&lt;b&gt;Burger&lt;/b&gt;')
    expect(html).not.toContain('<b>Burger</b>')
    expect(html).toContain('Cola')
    expect(measured.height).toBeGreaterThan(node.height)
  })

  it('identifies runtime-repeating flow rows from element or column collection bindings', () => {
    const elementBound = createFlowRowNode({
      binding: { sourceId: 'receipt', fieldPath: 'items' },
    })
    const columnBound = createFlowRowNode({
      props: {
        columns: [
          { ratio: 1, textAlign: 'left', wrapMode: 'block', binding: { sourceId: 'receipt', fieldPath: 'items/name' } },
          { ratio: 1, textAlign: 'right', wrapMode: 'inline', binding: { sourceId: 'receipt', fieldPath: 'items/amount' } },
        ],
      },
    })
    const staticRow = createFlowRowNode()

    expect(isFlowRowRuntimeRepeating(elementBound)).toBe(true)
    expect(isFlowRowRuntimeRepeating(columnBound)).toBe(true)
    expect(isFlowRowRuntimeRepeating(staticRow)).toBe(false)
  })
})
