import type { ViewerElementTree, ViewerTextTree } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createProgressNode } from './schema'
import { renderProgress } from './viewer'

describe('renderProgress', () => {
  it('renders clamped value as semantic text and attributes', () => {
    const tree = renderProgress(createProgressNode({ model: { value: 128 } })).tree as ViewerElementTree
    expect(tree.attributes['aria-label']).toBe('100%')
    const label = tree.children[0] as ViewerElementTree
    expect((label.children[0] as ViewerTextTree).value).toBe('100%')
  })

  it('omits text when disabled', () => {
    const tree = renderProgress(createProgressNode({ model: { showText: false } })).tree as ViewerElementTree
    expect(tree.children).toHaveLength(1)
  })
})
