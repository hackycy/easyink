import type { ViewerElementTree, ViewerTextTree } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
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

  it('uses the CSS in unit for an inch document', () => {
    const context = createTestViewerRenderContext({ unit: 'inch' })
    const tree = renderProgress(createProgressNode({}, 'inch'), context).tree as ViewerElementTree
    const label = tree.children[0] as ViewerElementTree
    const bar = tree.children[1] as ViewerElementTree

    expect(context.cssUnit).toBe('in')
    expect(label.style['font-size']).toMatch(/in$/)
    expect(bar.style.height).toMatch(/in$/)
    expect(tree.style.gap).toMatch(/in$/)
    expect(JSON.stringify(tree)).not.toContain('inch')
  })
})
