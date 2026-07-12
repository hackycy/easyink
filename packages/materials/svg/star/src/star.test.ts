import type { SvgStarProps } from './schema'
import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createSvgStarExtension } from './designer'
import { svgStarDesignerPropSchemas } from './prop-schemas'
import { resolveStarControl } from './rendering'
import { createSvgStarNode } from './schema'
import { renderSvgStar } from './viewer'

describe('renderSvgStar', () => {
  it('renders polygon content with configurable star props', () => {
    const node = createSvgStarNode({
      model: {
        fillColor: '#ffcc00',
        borderWidth: 0.5,
        borderColor: '#111111',
        starPoints: 6,
        starInnerRatio: 0.4,
        starRotation: -90,
      },
    })

    const output = readTrustedViewerHtml(renderSvgStar(node).html!)

    expect(output).toContain('<polygon')
    expect(output).toContain('preserveAspectRatio="none"')
    expect(output).toContain('stroke-width="0.5"')
    expect(output).toContain('#ffcc00')
  })

  it('defaults to a visible border without filling the star interior', () => {
    const output = readTrustedViewerHtml(renderSvgStar(createSvgStarNode()).html!)

    expect(output).toContain('fill="transparent"')
    expect(output).toContain('stroke="#000000"')
    expect(output).toContain('stroke-width="0.26"')
  })

  it('keeps the star path within the viewBox bounds', () => {
    const output = readTrustedViewerHtml(renderSvgStar(createSvgStarNode()).html!)
    const pointsMatch = output.match(/points="([^"]+)"/)

    expect(pointsMatch).not.toBeNull()

    const points = (pointsMatch?.[1] ?? '')
      .split(' ')
      .map((pair) => {
        const [x, y] = pair.split(',').map(Number)
        return { x, y }
      })

    expect(Math.min(...points.map(point => point.x))).toBeGreaterThanOrEqual(0)
    expect(Math.max(...points.map(point => point.x))).toBeLessThanOrEqual(100)
    expect(Math.min(...points.map(point => point.y))).toBeGreaterThanOrEqual(0)
    expect(Math.max(...points.map(point => point.y))).toBeLessThanOrEqual(100)
  })

  it('only resolves the deep-edit control when the pointer is near the handle', () => {
    const node = createSvgStarNode()
    const props = node.model as unknown as SvgStarProps

    expect(resolveStarControl({ x: 10, y: 10 }, node, props)).toBeNull()
    expect(resolveStarControl({ x: 62, y: 38 }, node, props)).toEqual({ handle: 'inner-radius', index: 0 })
  })

  it('exposes deep-edit controls only for the inner angle ratio', () => {
    const node = createSvgStarNode()
    const extension = createSvgStarExtension({} as never)
    const selectionType = extension.selectionTypes?.[0]
    const schema = selectionType?.getPropertySchema?.({
      type: 'svg-star.control',
      nodeId: node.id,
      payload: { handle: 'inner-radius', index: 0 },
    }, node)

    expect(schema?.title).toBe('materials.svgStar.property.edit')
    expect(schema?.descriptors.map(item => item.key)).toEqual(['starInnerRatio'])
    expect(schema?.read('starInnerRatio')).toBeCloseTo(0.381966, 5)
  })

  it('removes the internal rotation field from the property panel schema', () => {
    expect(svgStarDesignerPropSchemas.map(item => item.key)).toEqual([
      'fillColor',
      'borderWidth',
      'borderColor',
      'starPoints',
      'starInnerRatio',
    ])
  })

  it('creates default nodes sized for a square star viewBox', () => {
    const node = createSvgStarNode()

    expect(node.width).toBe(100)
    expect(node.height).toBe(100)
    expect((node.model as Record<string, unknown>).fillColor).toBe('transparent')
    expect((node.model as Record<string, unknown>).borderWidth).toBe(0.26)
    expect((node.model as Record<string, unknown>).starPoints).toBe(5)
    expect((node.model as Record<string, unknown>).starInnerRatio).toBeCloseTo(0.381966, 5)
  })
})
