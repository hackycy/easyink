import type { MaterialExtensionContext, NodeSignal } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createRatingExtension } from './designer'
import { ratingDesignerPropSchemas } from './prop-schemas'
import { createRatingNode } from './schema'

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

describe('createRatingExtension', () => {
  it('shows the binding label in designer preview when bound', () => {
    const container = document.createElement('div')
    const extension = createRatingExtension(createContext())
    const node = createRatingNode({
      binding: {
        sourceId: 'survey',
        fieldPath: 'score',
        fieldLabel: '满意度',
      },
    })

    extension.renderContent(createNodeSignal(node), container)

    expect(container.innerHTML).toContain('{#满意度}/100')
  })

  it('commits only one rating character token from the property schema', () => {
    const node = createRatingNode({ props: { character: '★' } })
    const schema = ratingDesignerPropSchemas.find(item => item.key === 'character')
    const command = schema?.commit?.(node, '满意度', {
      flushPendingEdits: () => {},
      activeEditingSession: null,
      exitEditingSession: () => {},
    })

    command?.execute()

    expect(node.props.character).toBe('满')
  })
})
