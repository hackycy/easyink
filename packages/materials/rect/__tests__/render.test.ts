import type { MaterialNode } from '@easyink/core'
import type { MaterialRenderContext } from '@easyink/renderer'
import { describe, expect, it } from 'vitest'
import { renderRect } from '../src/render'

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
    computedLayout: { x: 0, y: 0, width: 100, height: 60, boundingBox: { x: 0, y: 0, width: 100, height: 60 }, needsMeasure: false },
    renderChild: () => document.createElement('div'),
  }
}

function createRectNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'rect-1',
    type: 'rect',
    props: { borderRadius: 0, fill: 'transparent' },
    layout: { position: 'absolute', width: 100, height: 60 },
    ...overrides,
  } as MaterialNode
}

describe('renderRect', () => {
  it('should render rect element', () => {
    const node = createRectNode()
    const el = renderRect(node, createMockContext())
    expect(el.className).toContain('easyink-rect')
  })

  it('should set materialId data attribute', () => {
    const node = createRectNode()
    const el = renderRect(node, createMockContext())
    expect(el.dataset.materialId).toBe('rect-1')
  })

  it('should apply fill color', () => {
    const node = createRectNode({ props: { borderRadius: 0, fill: '#ff0000' } })
    const el = renderRect(node, createMockContext())
    expect(el.style.backgroundColor).toBeTruthy()
  })

  it('should apply border radius number', () => {
    const node = createRectNode({ props: { borderRadius: 8, fill: 'transparent' } })
    const el = renderRect(node, createMockContext())
    expect(el.style.borderRadius).toBe('8px')
  })

  it('should apply border radius array', () => {
    const node = createRectNode({ props: { borderRadius: [4, 8, 12, 16], fill: 'transparent' } })
    const el = renderRect(node, createMockContext())
    expect(el.style.borderRadius).toBe('4px 8px 12px 16px')
  })
})
