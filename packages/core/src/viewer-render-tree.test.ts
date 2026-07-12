import type { MaterialViewerFacet } from './material-viewer'
import { describe, expect, it, vi } from 'vitest'
import {
  assertViewerRenderTree,
  VIEWER_TREE_ABSOLUTE_MAX_NODES,
  viewerElement,
  viewerFragment,
  viewerImperativeDom,
  viewerText,
} from './viewer-render-tree'

const VIEWER_CHILDREN_KEY = 'children'

describe('viewer render tree', () => {
  it('shallow-freezes every semantic node produced by recursive builders', () => {
    const text = viewerText('safe')
    const element = viewerElement('span', {}, [text])
    const fragment = viewerFragment([element])

    expect(Object.isFrozen(text)).toBe(true)
    expect(Object.isFrozen(element)).toBe(true)
    expect(Object.isFrozen(fragment)).toBe(true)
    expect(Object.isFrozen(element[VIEWER_CHILDREN_KEY])).toBe(true)
    expect(Object.isFrozen(fragment.children)).toBe(true)
    expect(() => assertViewerRenderTree(fragment)).not.toThrow()
  })

  it('uses the public third argument for children and accepts finite scalar values', () => {
    const child = viewerText('child')
    const tree = viewerElement('div', {
      attributes: { count: 2, hidden: false },
      style: { opacity: 0.5 },
    }, [child])

    expect(tree.children).toEqual([child])
    expect(() => assertViewerRenderTree(tree)).not.toThrow()
    expect(() => assertViewerRenderTree(viewerElement('div', { attributes: { bad: Number.NaN } }))).toThrow()
    expect(() => assertViewerRenderTree(viewerElement('div', { style: { bad: Number.POSITIVE_INFINITY } }))).toThrow()
  })

  it('models viewer facet capabilities outside the extension', () => {
    const facet: MaterialViewerFacet = {
      extension: { render: () => ({ tree: viewerText('ok') }) },
      capabilities: { sanitizedMarkup: true, imperativeDom: ['chart'] },
    }

    expect(facet.capabilities.imperativeDom).toEqual(['chart'])
    expect('capabilities' in facet.extension).toBe(false)
  })

  it('publishes the single absolute node budget', () => {
    expect(VIEWER_TREE_ABSOLUTE_MAX_NODES).toBe(50_000)
  })

  it('requires an imperative mount disposer on first invocation', () => {
    const mount = vi.fn(() => undefined as never)
    const tree = viewerImperativeDom('chart', mount)
    const host = { element: {} as HTMLElement, render: vi.fn() }

    expect(() => tree.mount(host)).toThrowError('VIEWER_IMPERATIVE_DISPOSER_REQUIRED')
  })

  it('rejects arbitrary unknown fragment child kinds', () => {
    expect(() => assertViewerRenderTree({
      kind: 'fragment',
      children: [{ kind: 'future-node' }],
    } as never)).toThrowError('VIEWER_TREE_KIND_INVALID')
  })

  it('rejects invalid budgets, cycles, excessive depth, attributes, and text', () => {
    expect(() => assertViewerRenderTree(viewerText('x'), { maxNodes: Number.NaN })).toThrowError('VIEWER_TREE_BUDGET_INVALID')
    expect(() => assertViewerRenderTree(viewerText('x'), { maxNodes: 50_001 })).toThrowError('VIEWER_TREE_BUDGET_INVALID')

    const cyclic = { kind: 'fragment', children: [] } as { kind: 'fragment', children: unknown[] }
    cyclic.children.push(cyclic)
    expect(() => assertViewerRenderTree(cyclic as never)).toThrowError('VIEWER_TREE_CYCLE')

    let deep: unknown = viewerText('leaf')
    for (let index = 0; index < 129; index++)
      deep = { kind: 'fragment', children: [deep] }
    expect(() => assertViewerRenderTree(deep as never)).toThrowError('VIEWER_TREE_DEPTH_EXCEEDED')

    expect(() => assertViewerRenderTree({
      kind: 'element',
      tag: 'div',
      namespace: 'html',
      attributes: Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`data-${index}`, 'x'])),
      style: {},
      children: [],
    } as never)).toThrowError('VIEWER_TREE_ATTRIBUTES_EXCEEDED')

    expect(() => assertViewerRenderTree(viewerText('x'.repeat(1024 * 1024 + 1)))).toThrowError('VIEWER_TREE_TEXT_EXCEEDED')
  })
})
