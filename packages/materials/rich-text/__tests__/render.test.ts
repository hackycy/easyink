import type { MaterialNode } from '@easyink/core'
import type { MaterialRenderContext } from '@easyink/renderer'
import { describe, expect, it } from 'vitest'
import { renderRichText } from '../src/render'

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
    computedLayout: { x: 0, y: 0, width: 200, height: 60, boundingBox: { x: 0, y: 0, width: 200, height: 60 }, needsMeasure: false },
    renderChild: () => document.createElement('div'),
    ...overrides,
  }
}

function createRichTextNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'rich-text-1',
    type: 'rich-text',
    props: { content: '<b>Hello</b>', verticalAlign: 'top' },
    layout: { position: 'absolute', width: 200, height: 60 },
    ...overrides,
  } as MaterialNode
}

describe('renderRichText', () => {
  it('should render rich text content as HTML', () => {
    const node = createRichTextNode()
    const el = renderRichText(node, createMockContext())
    expect(el.innerHTML).toBe('<b>Hello</b>')
    expect(el.className).toContain('easyink-rich-text')
  })

  it('should set materialId data attribute', () => {
    const node = createRichTextNode()
    const el = renderRichText(node, createMockContext())
    expect(el.dataset.materialId).toBe('rich-text-1')
  })

  it('should show binding placeholder in design mode', () => {
    const node = createRichTextNode({
      binding: { path: 'user.bio' },
    })
    const el = renderRichText(node, createMockContext({ designMode: true }))
    expect(el.textContent).toBe('{{user.bio}}')
  })

  it('should resolve binding in render mode', () => {
    const node = createRichTextNode({
      binding: { path: 'user.bio' },
    })
    const ctx = createMockContext({
      resolver: {
        resolve: () => '<em>Rich</em>',
        format: () => '',
      } as unknown as MaterialRenderContext['resolver'],
    })
    const el = renderRichText(node, ctx)
    expect(el.innerHTML).toBe('<em>Rich</em>')
  })

  it('should handle vertical align middle', () => {
    const node = createRichTextNode({
      props: { content: 'Test', verticalAlign: 'middle' },
    })
    const el = renderRichText(node, createMockContext())
    expect(el.style.display).toBe('flex')
    expect(el.style.alignItems).toBe('center')
  })
})
