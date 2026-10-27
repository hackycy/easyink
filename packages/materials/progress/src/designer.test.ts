import type { NodeSignal } from '@easyink/core'
import type { DesignerRendererContext } from '@easyink/plugin-api/designer'
import type { MaterialNode } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createProgressExtension } from './designer'
import { createProgressNode } from './schema'

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

describe('createProgressExtension', () => {
  it('shows the binding label in designer preview when bound', () => {
    const container = document.createElement('div')
    const extension = createProgressExtension(createContext())
    const node = createProgressNode({
      binding: {
        sourceId: 'report',
        fieldPath: 'completionRate',
        fieldLabel: '完成率',
      },
    })

    extension.renderContent(createNodeSignal(node), container)

    expect(container.innerHTML).toContain('{#完成率}%')
  })
})
