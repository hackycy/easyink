import type { MaterialNode } from '@easyink/core'
import type { MaterialRenderContext } from '@easyink/renderer'
import { describe, expect, it } from 'vitest'
import { renderText } from '../src/render'

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
    computedLayout: { x: 0, y: 0, width: 100, height: 30, boundingBox: { x: 0, y: 0, width: 100, height: 30 }, needsMeasure: false },
    renderChild: () => document.createElement('div'),
    ...overrides,
  }
}

function createTextNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'text-1',
    type: 'text',
    props: { content: 'Hello', verticalAlign: 'top', wordBreak: 'normal', overflow: 'visible' },
    layout: { position: 'absolute', width: 100, height: 30 },
    ...overrides,
  } as MaterialNode
}

describe('renderText', () => {
  it('should render text content', () => {
    const node = createTextNode()
    const el = renderText(node, createMockContext())
    expect(el.textContent).toBe('Hello')
    expect(el.className).toContain('easyink-text')
  })

  it('should set materialId data attribute', () => {
    const node = createTextNode()
    const el = renderText(node, createMockContext())
    expect(el.dataset.materialId).toBe('text-1')
  })

  it('should handle vertical align middle', () => {
    const node = createTextNode({
      props: { content: 'Test', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
    })
    const el = renderText(node, createMockContext())
    expect(el.style.display).toBe('flex')
    expect(el.style.alignItems).toBe('center')
  })

  it('should handle vertical align bottom', () => {
    const node = createTextNode({
      props: { content: 'Test', verticalAlign: 'bottom', wordBreak: 'normal', overflow: 'visible' },
    })
    const el = renderText(node, createMockContext())
    expect(el.style.display).toBe('flex')
    expect(el.style.alignItems).toBe('flex-end')
  })

  it('should handle overflow ellipsis', () => {
    const node = createTextNode({
      props: { content: 'Test', verticalAlign: 'top', wordBreak: 'normal', overflow: 'ellipsis' },
    })
    const el = renderText(node, createMockContext())
    expect(el.style.overflow).toBe('hidden')
    expect(el.style.textOverflow).toBe('ellipsis')
    expect(el.style.whiteSpace).toBe('nowrap')
  })

  it('should handle overflow hidden', () => {
    const node = createTextNode({
      props: { content: 'Test', verticalAlign: 'top', wordBreak: 'normal', overflow: 'hidden' },
    })
    const el = renderText(node, createMockContext())
    expect(el.style.overflow).toBe('hidden')
  })

  it('should show binding placeholder in design mode', () => {
    const node = createTextNode({
      binding: { path: 'user.name' },
    })
    const el = renderText(node, createMockContext({ designMode: true }))
    expect(el.textContent).toBe('{{user.name}}')
  })

  it('should resolve binding in render mode', () => {
    const node = createTextNode({
      binding: { path: 'user.name' },
    })
    const ctx = createMockContext({
      resolver: {
        resolve: () => 'John',
        format: () => '',
      } as unknown as MaterialRenderContext['resolver'],
    })
    const el = renderText(node, ctx)
    expect(el.textContent).toBe('John')
  })

  it('should join arrays with comma', () => {
    const node = createTextNode({
      binding: { path: 'tags' },
    })
    const ctx = createMockContext({
      resolver: {
        resolve: () => ['a', 'b', 'c'],
        format: () => '',
      } as unknown as MaterialRenderContext['resolver'],
    })
    const el = renderText(node, ctx)
    expect(el.textContent).toBe('a, b, c')
  })
})
