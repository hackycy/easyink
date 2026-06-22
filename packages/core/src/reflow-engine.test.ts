import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { runFlowYReflow } from './reflow-engine'

function makeNode(id: string, overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id,
    type: 'rect',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    props: {},
    ...overrides,
  }
}

describe('runFlowYReflow', () => {
  it('pulls later flow nodes upward when an earlier runtime node is removed', () => {
    const originalElements = [
      makeNode('header', { y: 0, height: 10 }),
      makeNode('optional', { y: 20, height: 12 }),
      makeNode('summary', { y: 40, height: 5 }),
    ]
    const measuredElements = [
      makeNode('header', { y: 0, height: 10 }),
      makeNode('summary', { y: 40, height: 5 }),
    ]

    const result = runFlowYReflow({ originalElements, measuredElements })

    expect(result.elements.map(node => node.id)).toEqual(['header', 'summary'])
    expect(result.elements.find(node => node.id === 'summary')?.y).toBe(28)
  })

  it('does not pull later flow nodes upward when a removed runtime node is fixed', () => {
    const originalElements = [
      makeNode('header', { y: 0, height: 10 }),
      makeNode('watermark', { y: 20, height: 12, props: { layoutMode: 'fixed' } }),
      makeNode('summary', { y: 40, height: 5 }),
    ]
    const measuredElements = [
      makeNode('header', { y: 0, height: 10 }),
      makeNode('summary', { y: 40, height: 5 }),
    ]

    const result = runFlowYReflow({ originalElements, measuredElements })

    expect(result.elements.map(node => node.id)).toEqual(['header', 'summary'])
    expect(result.elements.find(node => node.id === 'summary')?.y).toBe(40)
  })

  it('reports fixed overlaps introduced by flow-y reflow', () => {
    const originalElements = [
      makeNode('header', { y: 0, height: 10 }),
      makeNode('summary', { y: 20, height: 5 }),
      makeNode('stamp', { y: 25, height: 10, props: { layoutMode: 'fixed' } }),
    ]
    const measuredElements = [
      makeNode('header', { y: 0, height: 15 }),
      makeNode('summary', { y: 20, height: 5 }),
      makeNode('stamp', { y: 25, height: 10, props: { layoutMode: 'fixed' } }),
    ]

    const result = runFlowYReflow({ originalElements, measuredElements })

    expect(result.elements.find(node => node.id === 'summary')?.y).toBe(25)
    expect(result.elements.find(node => node.id === 'stamp')?.y).toBe(25)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'FLOW_Y_FIXED_OVERLAP',
        sourceNodeId: 'summary',
        detail: { flowNodeId: 'summary', fixedNodeId: 'stamp' },
      }),
    ])
  })
})
