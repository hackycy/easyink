import type { ViewerElementTree } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createLineNode } from './schema'
import { getLineRenderSize, renderLine } from './viewer'

describe('renderLine', () => {
  it('uses semantic SVG rectangles and element height', () => {
    const node = createLineNode({ width: 50, height: 2, model: { lineType: 'dashed' } })
    const tree = renderLine(node, {} as never).tree as ViewerElementTree
    expect(tree.tag).toBe('svg')
    expect(tree.children.length).toBeGreaterThan(1)
    expect(getLineRenderSize(node).height).toBe(2)
  })
})
