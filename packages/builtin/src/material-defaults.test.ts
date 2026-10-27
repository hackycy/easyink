import { describe, expect, it } from 'vitest'
import { materials } from './all/designer'

// Physical default dimensions in mm and the factory's partial-props policy.
const defaults = [
  ['text', 80, 20, 'merge'],
  ['image', 100, 100, 'replace'],
  ['barcode', 150, 60, 'merge'],
  ['qrcode', 100, 100, 'replace'],
  ['line', 100, 0.26, 'replace'],
  ['rect', 100, 60, 'replace'],
  ['signature', 80, 35, 'merge'],
  ['ellipse', 100, 80, 'merge'],
  ['table-static', 180, 24, 'replace'],
  ['table-data', 180, 40, 'replace'],
  ['flow-row', 72, 26.3, 'merge'],
  ['ring-progress', 36, 36, 'merge'],
  ['progress', 60, 12, 'merge'],
  ['rating', 36, 8, 'merge'],
  ['chart-bar', 160, 90, 'merge'],
  ['chart-line', 160, 90, 'merge'],
  ['chart-pie', 120, 100, 'merge'],
  ['chart-radar', 120, 100, 'merge'],
  ['chart-scatter', 160, 90, 'merge'],
  ['chart-gauge', 130, 90, 'merge'],
  ['chart-custom', 160, 90, 'merge'],
  ['svg', 100, 100, 'content-only'],
  ['svg-star', 100, 100, 'merge'],
  ['svg-heart', 100, 90, 'merge'],
  ['page-number', 26, 8, 'replace'],
] as const

describe.each([
  ['mm', 1],
  ['pt', 72 / 25.4],
  ['px', 96 / 25.4],
] as const)('builtin default nodes in %s', (unit, scale) => {
  it.each(defaults)('%s preserves physical geometry and %s × %s defaults with %s props', (type, width, height, policy) => {
    const model = materials.find(material => material.model.type === type)!.model
    const node = model.createDefaultNode({ id: 'default' }, unit)
    expect(node).toMatchObject({ id: 'default', type, x: 0, y: 0 })
    expect(node.width).toBeCloseTo(width * scale, 8)
    expect(node.height).toBeCloseTo(height * scale, 8)

    const partial = { id: 'custom', x: 7, width: 13, height: 17, props: { content: 'custom content', color: '#123456', custom: { keep: true } } }
    const before = JSON.stringify(partial)
    const overridden = model.createDefaultNode(partial, unit)
    expect(overridden).toMatchObject({ id: 'custom', type, x: 7, y: 0, width: 13, height: 17 })
    const expectedProps = policy === 'content-only'
      ? { content: 'custom content' }
      : policy === 'merge' ? { ...node.props, ...partial.props } : partial.props
    expect(overridden.props).toEqual(expectedProps)
    expect(JSON.stringify(partial)).toBe(before)
  })
})
