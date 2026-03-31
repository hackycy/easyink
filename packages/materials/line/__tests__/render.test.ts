import type { MaterialNode } from '@easyink/core'
import type { MaterialRenderContext } from '@easyink/renderer'
import { describe, expect, it } from 'vitest'
import { renderLine } from '../src/render'

function createMockContext(): MaterialRenderContext {
  return {
    data: {},
    resolver: {
      resolve: () => null,
      format: (_v: unknown) => '',
    } as unknown as MaterialRenderContext['resolver'],
    unit: 'mm',
    dpi: 96,
    zoom: 1,
    toPixels: (v: number) => v,
    computedLayout: { x: 0, y: 0, width: 100, height: 0, boundingBox: { x: 0, y: 0, width: 100, height: 0 }, needsMeasure: false },
    renderChild: () => document.createElement('div'),
  }
}

function createLineNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'line-1',
    type: 'line',
    props: { direction: 'horizontal', strokeWidth: 1, strokeColor: '#000000', strokeStyle: 'solid' },
    layout: { position: 'absolute', width: 100, height: 0 },
    ...overrides,
  } as MaterialNode
}

describe('renderLine', () => {
  it('should render horizontal line', () => {
    const node = createLineNode()
    const el = renderLine(node, createMockContext())
    expect(el.className).toContain('easyink-line')
    expect(el.style.borderTop).toContain('solid')
    expect(el.style.height).toBe('0px')
  })

  it('should render vertical line', () => {
    const node = createLineNode({
      props: { direction: 'vertical', strokeWidth: 1, strokeColor: '#000', strokeStyle: 'solid' },
    })
    const el = renderLine(node, createMockContext())
    expect(el.style.borderLeft).toContain('solid')
    expect(el.style.width).toBe('0px')
  })

  it('should render custom SVG line', () => {
    const node = createLineNode({
      props: { direction: 'custom', strokeWidth: 2, strokeColor: '#f00', strokeStyle: 'solid', endX: 50, endY: 50 },
    })
    const el = renderLine(node, createMockContext())
    expect(el.className).toContain('easyink-line--custom')
    const svg = el.querySelector('svg')
    expect(svg).toBeTruthy()
    const line = svg!.querySelector('line')
    expect(line).toBeTruthy()
    expect(line!.getAttribute('x2')).toBe('50')
    expect(line!.getAttribute('y2')).toBe('50')
  })

  it('should set materialId data attribute', () => {
    const node = createLineNode()
    const el = renderLine(node, createMockContext())
    expect(el.dataset.materialId).toBe('line-1')
  })
})
