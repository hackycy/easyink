import type { MaterialDesignerRenderContext, MaterialDesignerRenderContextSignal, MaterialExtensionContext, NodeSignal } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createPageNumberExtension } from './designer'
import { createPageNumberNode } from './schema'

function createNodeSignal(node: MaterialNode): NodeSignal {
  return {
    get: () => node,
    subscribe: (callback) => {
      callback(node)
      return () => {}
    },
  }
}

function createRenderContextSignal(initial: MaterialDesignerRenderContext): MaterialDesignerRenderContextSignal & { set: (context: MaterialDesignerRenderContext) => void } {
  let context = initial
  const subscribers = new Set<(context: MaterialDesignerRenderContext) => void>()
  return {
    get: () => context,
    subscribe(callback) {
      subscribers.add(callback)
      return () => {
        subscribers.delete(callback)
      }
    },
    set(next) {
      context = next
      for (const callback of subscribers)
        callback(context)
    },
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

describe('createPageNumberExtension', () => {
  it('renders the current page number and total pages in designer', () => {
    const container = document.createElement('div')
    const extension = createPageNumberExtension(createContext())
    const node = createPageNumberNode({
      props: {
        format: 'Page {current} of {total}',
      },
    })
    const renderContext = createRenderContextSignal({
      page: {
        pageIndex: 1,
        pageNumber: 2,
        totalPages: 5,
      },
    })

    extension.renderContent(createNodeSignal(node), container, renderContext)

    expect(container.textContent).toContain('Page 2 of 5')
  })

  it('updates the rendered page reference when the design context changes', () => {
    const container = document.createElement('div')
    const extension = createPageNumberExtension(createContext())
    const node = createPageNumberNode()
    const renderContext = createRenderContextSignal({
      page: {
        pageIndex: 0,
        pageNumber: 1,
        totalPages: 2,
      },
    })

    extension.renderContent(createNodeSignal(node), container, renderContext)
    expect(container.textContent).toContain('1/2')

    renderContext.set({
      page: {
        pageIndex: 1,
        pageNumber: 2,
        totalPages: 2,
      },
    })

    expect(container.textContent).toContain('2/2')
  })
})
