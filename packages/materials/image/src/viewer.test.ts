import type { ViewerElementTree, ViewerTextTree } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createImageNode } from './schema'
import { renderImage } from './viewer'

describe('renderImage', () => {
  it('renders a semantic image tree with attribute-safe dynamic values', () => {
    const tree = renderImage(createImageNode({ model: { src: 'https://example.test/a?<x>', alt: '<logo>', fit: 'contain' } })).tree as ViewerElementTree
    const image = tree.children[0] as ViewerElementTree
    expect(image.tag).toBe('img')
    expect(image.attributes).toMatchObject({ src: 'https://example.test/a?<x>', alt: '<logo>' })
  })

  it('renders an empty semantic placeholder', () => {
    const tree = renderImage(createImageNode()).tree as ViewerElementTree
    expect((tree.children[0] as ViewerTextTree).value).toBe('[Image]')
  })
})
