import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { svgHeartDesignerPropSchemas } from './prop-schemas'
import { createSvgHeartNode } from './schema'
import { renderSvgHeart } from './viewer'

describe('renderSvgHeart', () => {
  it('renders with fill and stroke when border is set', () => {
    const node = createSvgHeartNode({
      width: 80,
      height: 72,
      props: {
        fillColor: '#ff7a90',
        borderWidth: 6,
        borderColor: '#7a1020',
      },
    })

    const html = readTrustedViewerHtml(renderSvgHeart(node).html!)

    expect(html).toContain('viewBox="')
    expect(html).toContain('fill="#ff7a90"')
    expect(html).toContain('stroke="#7a1020"')
    expect(html).toContain('stroke-width=')
    expect(html).not.toContain('overflow:visible')
  })

  it('renders a single fill path when border width is zero', () => {
    const html = readTrustedViewerHtml(renderSvgHeart(createSvgHeartNode()).html!)

    expect(html.match(/<path /g)).toHaveLength(1)
    expect(html).toContain('fill="#E5484D"')
    expect(html).not.toContain('stroke=')
  })

  it('renders stroke without fill when fillColor is transparent', () => {
    const node = createSvgHeartNode({
      width: 100,
      height: 90,
      props: {
        fillColor: 'transparent',
        borderWidth: 6,
        borderColor: '#7a1020',
      },
    })

    const html = readTrustedViewerHtml(renderSvgHeart(node).html!)

    expect(html).toContain('fill="transparent"')
    expect(html).toContain('stroke="#7a1020"')
  })

  it('uses locale keys in the designer schema', () => {
    expect(svgHeartDesignerPropSchemas.map(item => item.label)).toEqual([
      'designer.property.fillColor',
      'designer.property.borderWidth',
      'designer.property.borderColor',
    ])
  })
})
