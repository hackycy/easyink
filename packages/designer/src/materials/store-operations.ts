import type { DesignerStore } from '../store/designer-store'
import type { DesignerRendererOperations } from './renderer-context'
import { deepClone } from '@easyink/shared'
import { createTransactionService } from '../editing/transaction-service'

/** Framework wiring; only these fixed operations reach the material context. */
export function createStoreRendererOperations(
  store: DesignerStore,
  assembly: Pick<DesignerRendererOperations, 'getMaterials' | 't' | 'executeCommand'>,
): DesignerRendererOperations {
  return {
    getSchema: () => store.schema,
    getNode: id => store.getElementById(id),
    getSelection: () => ({ ids: store.selection.ids, count: store.selection.count, isEmpty: store.selection.isEmpty }),
    isEditing: id => store.editingSession.activeNodeId === id,
    getDataSources: () => store.dataSourceRegistry.getSources(),
    getMaterials: () => assembly.getMaterials(),
    getBindingLabel: binding => binding.fieldLabel || binding.fieldPath || '',
    t: key => assembly.t(key),
    executeCommand: (command, args) => assembly.executeCommand(command, args),
    commitCommand: (command) => {
      store.commands.execute(command)
      store.markDraftModified()
    },
    tx: createTransactionService(id => store.getElementById(id), store.commands, store.diagnostics),
    replaceDocument: (schema) => {
      store.setSchema(deepClone(schema))
      store.markDraftModified()
    },
    readDocumentExtension: namespace => store.getExtension(namespace),
    writeDocumentExtension: (namespace, value) => {
      store.setExtension(namespace, deepClone(value))
      store.markDraftModified()
    },
    registerDataSource: (source) => {
      store.dataSourceRegistry.registerSource(deepClone(source))
      store.markDraftModified()
    },
    confirm: request => store.interactions.confirm({ ...request }),
    pickAsset: request => store.interactions.pickAsset({ ...request, accept: request.accept ? [...request.accept] : undefined }),
    pickFileText: request => store.interactions.pickFileText({ ...request, accept: request.accept ? [...request.accept] : undefined }),
    reportDiagnostic: (diagnostic) => {
      store.diagnostics.push({ source: 'material-extension', severity: 'error', message: diagnostic.message, detail: { code: diagnostic.code, cause: diagnostic.cause } })
    },
    requestPropertyPanel: overlay => store.setPropertyOverlay(overlay),
    getZoom: () => store.workbench.viewport.zoom,
    getPageEl: () => store.getPageEl(),
  }
}
