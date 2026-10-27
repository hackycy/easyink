import type { NodeSignal } from '@easyink/core'
import type { DesignerRendererContext } from '@easyink/plugin-api/designer'
import type { MaterialNode } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createRatingExtension } from './designer'
import { createRatingNode } from './schema'

function createNodeSignal(node: MaterialNode): NodeSignal {
  return {
    get: () => node,
    subscribe: () => () => {},
  }
}

function createContext(overrides: Partial<DesignerRendererContext> = {}): DesignerRendererContext {
  const schema = createDefaultSchema()
  return {
    signal: new AbortController().signal,
    onDispose: () => {},
    getDataSources: () => [],
    getMaterials: () => [],
    isEditing: () => false,
    replaceDocument: () => {},
    readDocumentExtension: () => undefined,
    writeDocumentExtension: () => {},
    registerDataSource: () => {},
    confirm: async () => false,
    pickAsset: async () => null,
    pickFileText: async () => null,
    executeCommand: async () => { throw new Error('No commands installed') },
    reportDiagnostic: () => {},
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
})
