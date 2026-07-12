import type { ViewerElementTree } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { getStarEditGuide } from './rendering'
import { createSvgStarNode, SVG_STAR_DEFAULTS } from './schema'
import { renderSvgStar } from './viewer'

describe('renderSvgStar', () => {
  it('renders configurable polygon attributes inside its viewBox', () => {
    const tree = renderSvgStar(createSvgStarNode({ model: { fillColor: '#f00', starPoints: 6 } })).tree as ViewerElementTree
    const polygon = tree.children[0] as ViewerElementTree
    const points = String(polygon.attributes.points).split(' ').map(pair => pair.split(',').map(Number))
    expect(polygon.tag).toBe('polygon')
    expect(points).toHaveLength(12)
    expect(points.flat().every(value => value >= 0 && value <= 100)).toBe(true)
  })

  it('retains star edit guide geometry', () => {
    expect(getStarEditGuide(SVG_STAR_DEFAULTS, 100, 100).handles).toHaveLength(5)
  })
})
