import type { MaterialNode } from '@easyink/core'
import type { MaterialRenderContext } from '@easyink/renderer'
import { describe, expect, it } from 'vitest'
import { renderImage } from '../src/render'

function createMockContext(overrides: Partial<MaterialRenderContext> = {}): MaterialRenderContext {
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
    computedLayout: { x: 0, y: 0, width: 100, height: 100, boundingBox: { x: 0, y: 0, width: 100, height: 100 }, needsMeasure: false },
    renderChild: () => document.createElement('div'),
    ...overrides,
  }
}

function createImageNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'img-1',
    type: 'image',
    props: { src: 'https://example.com/img.png', fit: 'contain', alt: '' },
    layout: { position: 'absolute', width: 100, height: 100 },
    ...overrides,
  } as MaterialNode
}

describe('renderImage', () => {
  it('should render image element', () => {
    const node = createImageNode()
    const el = renderImage(node, createMockContext())
    expect(el.className).toContain('easyink-image')
    const img = el.querySelector('img')
    expect(img).toBeTruthy()
    expect(img!.src).toContain('example.com/img.png')
  })

  it('should set materialId data attribute', () => {
    const node = createImageNode()
    const el = renderImage(node, createMockContext())
    expect(el.dataset.materialId).toBe('img-1')
  })

  it('should apply object-fit from props', () => {
    const node = createImageNode({
      props: { src: 'test.png', fit: 'cover', alt: '' },
    })
    const el = renderImage(node, createMockContext())
    const img = el.querySelector('img')
    expect(img!.style.objectFit).toBe('cover')
  })

  it('should show placeholder in design mode with binding', () => {
    const node = createImageNode({
      binding: { path: 'product.image' },
    })
    const el = renderImage(node, createMockContext({ designMode: true }))
    expect(el.textContent).toContain('{{product.image}}')
    expect(el.querySelector('img')).toBeNull()
  })

  it('should resolve binding in render mode', () => {
    const node = createImageNode({
      binding: { path: 'product.image' },
    })
    const ctx = createMockContext({
      resolver: {
        resolve: () => 'https://example.com/resolved.png',
        format: () => '',
      } as unknown as MaterialRenderContext['resolver'],
    })
    const el = renderImage(node, ctx)
    const img = el.querySelector('img')
    expect(img!.src).toContain('resolved.png')
  })
})
