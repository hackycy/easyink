import type { ViewerElementTree } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createEllipseNode } from './schema'
import { renderEllipse } from './viewer'

describe('renderEllipse', () => {
  it('renders a fitted semantic ellipse', () => {
    const tree = renderEllipse(createEllipseNode()).tree as ViewerElementTree
    expect(tree.tag).toBe('div')
    expect(tree.style).toMatchObject({ 'width': '100%', 'height': '100%', 'border-radius': '50%', 'background': 'transparent' })
  })
})
