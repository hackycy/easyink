import type { MaterialExtensionContext, NodeSignal } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createSvgCustomExtension } from './designer'
import { createSvgCustomNode } from './schema'

function createNodeSignal(node: MaterialNode): NodeSignal {
  return {
    get: () => node,
    subscribe: () => () => {},
  }
}

function createContext(overrides: Partial<MaterialExtensionContext> = {}): MaterialExtensionContext {
  const schema = createDefaultSchema()
  return {
    getSchema: () => schema,
    getNode: () => undefined,
    getSelection: () => ({ ids: [], count: 0, isEmpty: true }),
    getBindingLabel: binding => binding.fieldLabel || binding.fieldPath,
    commitCommand: () => {},
    tx: {
      run: () => {},
      batch: fn => fn(),
    },
    requestPropertyPanel: () => {},
    emit: () => {},
    on: () => () => {},
    getZoom: () => 1,
    getPageEl: () => null,
    t: key => key,
    ...overrides,
  }
}

describe('createSvgCustomExtension', () => {
  it('renders the svg logo placeholder when the node has no content', () => {
    const container = document.createElement('div')
    const extension = createSvgCustomExtension(createContext())
    const node = createSvgCustomNode()

    extension.renderContent(createNodeSignal(node), container)

    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.textContent).toContain('SVG')
    expect(container.innerHTML).not.toContain('{#')
    expect(container.innerHTML).not.toContain('border:1px dashed')
  })

  it('renders static svg content when the node is unbound', () => {
    const container = document.createElement('div')
    const extension = createSvgCustomExtension(createContext())
    const node = createSvgCustomNode({
      model: {
        content: '<svg viewBox="0 0 10 10"><circle r="5" /></svg>',
      },
    })

    extension.renderContent(createNodeSignal(node), container)

    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('circle')).not.toBeNull()
  })

  it('shows an svg binding preview instead of stale static svg content when bound', () => {
    const container = document.createElement('div')
    const extension = createSvgCustomExtension(createContext())
    const node = createSvgCustomNode({
      model: {
        content: '<svg viewBox="0 0 10 10"><circle r="5" /></svg>',
      },
      bindings: {
        value: {
          sourceId: 'brand',
          fieldPath: 'logoSvg',
          fieldLabel: 'Logo SVG',
        },
      },
    })

    extension.renderContent(createNodeSignal(node), container)

    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.innerHTML).toContain('{#Logo SVG}')
    expect(container.querySelector('circle')).toBeNull()
    expect(container.innerHTML).not.toContain('background:#f5f5f5')
  })
})
