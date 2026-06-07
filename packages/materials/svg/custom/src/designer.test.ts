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
  it('renders static svg content when the node is unbound', () => {
    const container = document.createElement('div')
    const extension = createSvgCustomExtension(createContext())
    const node = createSvgCustomNode({
      props: {
        content: '<svg viewBox="0 0 10 10"><circle r="5" /></svg>',
      },
    })

    extension.renderContent(createNodeSignal(node), container)

    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('circle')).not.toBeNull()
  })

  it('shows the binding label instead of stale static svg content when bound', () => {
    const container = document.createElement('div')
    const extension = createSvgCustomExtension(createContext())
    const node = createSvgCustomNode({
      props: {
        content: '<svg viewBox="0 0 10 10"><circle r="5" /></svg>',
      },
      binding: {
        sourceId: 'brand',
        fieldPath: 'logoSvg',
        fieldLabel: 'Logo SVG',
      },
    })

    extension.renderContent(createNodeSignal(node), container)

    expect(container.innerHTML).toContain('{#Logo SVG}')
    expect(container.querySelector('circle')).toBeNull()
  })
})
