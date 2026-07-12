import type { ViewerElementTree, ViewerTextTree } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createRingProgressNode } from './schema'
import { renderRingProgress } from './viewer'

describe('renderRingProgress', () => {
  it('renders clamped text in a semantic SVG tree', () => {
    const tree = renderRingProgress(createRingProgressNode({ model: { value: 128 } })).tree as ViewerElementTree
    const text = tree.children.find(child => child.kind === 'element' && child.tag === 'text') as ViewerElementTree
    expect((text.children[0] as ViewerTextTree).value).toBe('100%')
  })

  it('omits text when disabled', () => {
    const tree = renderRingProgress(createRingProgressNode({ model: { showText: false } })).tree as ViewerElementTree
    expect(tree.children.every(child => child.kind !== 'element' || child.tag !== 'text')).toBe(true)
  })
})
