import type { ViewerElementTree } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { svgHeartDesignerPropSchemas } from './prop-schemas'
import { createSvgHeartNode } from './schema'
import { renderSvgHeart } from './viewer'

describe('renderSvgHeart', () => {
  it('renders fill and optional stroke as semantic SVG attributes', () => {
    const tree = renderSvgHeart(createSvgHeartNode({ model: { fillColor: '#f00', borderColor: '#000', borderWidth: 2 } })).tree as ViewerElementTree
    const path = tree.children[0] as ViewerElementTree
    expect(tree.tag).toBe('svg')
    expect(path.attributes).toMatchObject({ fill: '#f00', stroke: '#000' })
  })

  it('keeps locale keys in Designer properties', () => {
    expect(svgHeartDesignerPropSchemas.map(item => item.key)).toEqual(['fillColor', 'borderWidth', 'borderColor'])
  })
})
