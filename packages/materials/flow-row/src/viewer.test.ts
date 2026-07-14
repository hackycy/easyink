import type { MaterialMeasureRequest, MaterialRenderBudgetToken, ViewerElementTree, ViewerRenderContext, ViewerRenderTree } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createFlowRowNode } from './schema'
import { flowRowViewerLayout, renderFlowRow } from './viewer'

const context = createTestViewerRenderContext({ capabilities: {} as never }) satisfies ViewerRenderContext

describe('flow-row viewer', () => {
  it('reserves authoritative runtime rows before reading record cells or building row arrays', async () => {
    const node = createFlowRowNode({ model: { columns: [{ id: 'a', ratio: 1, textAlign: 'left', wrapMode: 'block', bindingPort: 'flow-port:a' }] } })
    node.bindings.value = { sourceId: 's', fieldPath: 'items' }
    node.bindings['flow-port:a'] = { sourceId: 's', fieldPath: 'items/name' }
    let numericReads = 0
    const records = new Proxy(Array.from({ length: 100_000 }, (_, index) => ({ name: String(index) })), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^(?:0|[1-9]\d*)$/.test(property))
          numericReads++
        return Reflect.get(target, property, receiver)
      },
    })
    const reserveRuntimeRows = vi.fn((count: number) => {
      if (count > 2)
        throw new Error('VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED')
    })
    const reserveLayoutFacts = vi.fn()
    const request = {
      mode: 'authoritative',
      instanceKey: node.id,
      node,
      scope: { key: 'document', data: { items: records } },
      resolvedModel: node.model,
      nodeRevision: 1,
      dataRevision: 1,
      resourceRevision: 1,
      constraints: { availableWidth: 100, availableHeight: 100, unit: 'mm', writingMode: 'horizontal-tb' },
      signal: new AbortController().signal,
      budget: {
        maxRuntimeRows: 2,
        maxLayoutFacts: 2,
        runtimeRowsUsed: 0,
        layoutFactsUsed: 0,
        reserveRuntimeRows,
        reserveLayoutFacts,
      },
      resolveBinding: vi.fn(),
      formatBinding: vi.fn(),
      openCollection: vi.fn(),
      schedule: {} as never,
      measureText: vi.fn(),
      measureSlot: vi.fn(),
    } as unknown as MaterialMeasureRequest

    await expect(flowRowViewerLayout.measure!(request)).rejects.toThrow('VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED')
    expect(reserveRuntimeRows).toHaveBeenCalledTimes(1)
    expect(reserveRuntimeRows).toHaveBeenCalledWith(100_000)
    expect(reserveLayoutFacts).not.toHaveBeenCalled()
    expect(numericReads).toBeLessThanOrEqual(3)
  })

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

  it('expands canonical collection bindings and measures intrinsic height through the layout facet', async () => {
    const node = createFlowRowNode({ model: { columns: [{ id: 'a', ratio: 1, textAlign: 'left', wrapMode: 'block', bindingPort: 'flow-port:a' }] } })
    node.bindings.value = { sourceId: 's', fieldPath: 'items' }
    node.bindings['flow-port:a'] = { sourceId: 's', fieldPath: 'items/name' }
    const data = { items: [{ name: '<A>' }, { name: 'B' }] }
    const runtime = { ...context, data }
    const tree = renderFlowRow(node, runtime).tree
    const plan = await flowRowViewerLayout.measure!({
      mode: 'authoritative',
      instanceKey: node.id,
      node,
      scope: { key: 'document', data },
      resolvedModel: node.model,
      nodeRevision: 1,
      dataRevision: 1,
      resourceRevision: 1,
      constraints: { availableWidth: 100, availableHeight: 100, unit: 'mm', writingMode: 'horizontal-tb' },
      signal: new AbortController().signal,
      budget: {
        maxRuntimeRows: 10,
        maxLayoutFacts: 10,
        runtimeRowsUsed: 0,
        layoutFactsUsed: 0,
        reserveRuntimeRows: vi.fn(),
        reserveLayoutFacts: vi.fn(),
      },
    } as unknown as MaterialMeasureRequest)

    expect(textValues(tree)).toEqual(['<A>', 'B'])
    expect(plan.borderBox).toMatchObject({ width: node.width, height: expect.any(Number) })
    expect(plan.borderBox.height).toBeGreaterThanOrEqual(node.height)
  })
})

function textValues(tree: ViewerRenderTree): string[] {
  if (tree.kind === 'text')
    return [tree.value]
  if (tree.kind !== 'element' && tree.kind !== 'fragment')
    return []
  return tree.children.flatMap(textValues)
}
