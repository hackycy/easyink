import type { MaterialRenderBudgetToken, ViewerElementTree, ViewerRenderContext, ViewerRenderTree } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createFlowRowNode } from './schema'
import { measureFlowRow, renderFlowRow } from './viewer'

const context = createTestViewerRenderContext({ capabilities: {} as never }) satisfies ViewerRenderContext

describe('flow-row viewer', () => {
  it('reserves owned element and text nodes before building the tree', () => {
    const reserveNodes = vi.fn()
    const renderBudget: MaterialRenderBudgetToken = {
      maxNodes: 20,
      nodesUsed: 0,
      reserveNodes,
    }
    const node = createFlowRowNode({ model: { columns: [
      { id: 'a', ratio: 1, textAlign: 'left', wrapMode: 'block', content: 'A' },
      { id: 'b', ratio: 1, textAlign: 'left', wrapMode: 'inline', content: 'B' },
    ] } })

    renderFlowRow(node, createTestViewerRenderContext({ renderBudget }))

    expect(reserveNodes).toHaveBeenNthCalledWith(1, 'element', 7)
    expect(reserveNodes).toHaveBeenNthCalledWith(2, 'text', 2)
  })

  it('renders block and inline columns as semantic text in order', () => {
    const node = createFlowRowNode({ model: { columns: [
      { id: 'a', ratio: 1, textAlign: 'left', wrapMode: 'block', content: 'Long item' },
      { id: 'b', ratio: 1, textAlign: 'right', wrapMode: 'inline', content: '12' },
    ] } })
    const tree = renderFlowRow(node, context).tree as ViewerElementTree
    expect(textValues(tree)).toEqual(['Long item', '12'])
  })

  it('applies canonical axis padding, alignment, and font resources', () => {
    const node = createFlowRowNode({ model: {
      paddingX: 2,
      paddingY: 3,
      typography: { fontFamily: 'FlowFont' },
      columns: [{ id: 'a', ratio: 1, textAlign: 'center', verticalAlign: 'bottom', wrapMode: 'block', content: 'A' }],
    } })
    const tree = renderFlowRow(node, context).tree as ViewerElementTree
    const cell = (tree.children[0] as ViewerElementTree).children[0] as ViewerElementTree
    expect(tree.style['font-family']).toBe('FlowFont')
    expect(cell.style).toMatchObject({ 'padding': '3mm 2mm', 'text-align': 'center', 'justify-content': 'flex-end' })
  })

  it('expands canonical collection bindings and measures intrinsic height', () => {
    const node = createFlowRowNode({ model: { columns: [{ id: 'a', ratio: 1, textAlign: 'left', wrapMode: 'block', bindingPort: 'flow-port:a' }] } })
    node.bindings.value = { sourceId: 's', fieldPath: 'items' }
    node.bindings['flow-port:a'] = { sourceId: 's', fieldPath: 'items/name' }
    const runtime = { ...context, data: { items: [{ name: '<A>' }, { name: 'B' }] } }
    const tree = renderFlowRow(node, runtime).tree
    expect(textValues(tree)).toEqual(['<A>', 'B'])
    expect(measureFlowRow(node, runtime).height).toBeGreaterThanOrEqual(node.height)
  })
})

function textValues(tree: ViewerRenderTree): string[] {
  if (tree.kind === 'text')
    return [tree.value]
  if (tree.kind !== 'element' && tree.kind !== 'fragment')
    return []
  return tree.children.flatMap(textValues)
}
