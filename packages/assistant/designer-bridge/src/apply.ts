import type { AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { ContributionContext } from '@easyink/designer'
import type { DocumentSchemaInput } from '@easyink/schema'
import { applyAssistantPatch, selectAssistantPatchOperationsForElements } from '@easyink/assistant-capabilities'
import { loadDocumentWithProfile, validateDocumentWithProfile } from '@easyink/core'

interface AssistantDesignerExtension {
  lastResultId?: string
  appliedAt?: number
  beforeApplySchema?: unknown
  afterApplySchema?: unknown
  applyToken?: string
}

const lastAssistantApplyChangeIds = new WeakMap<object, string>()

export function applyAssistantResultToDesigner(
  store: ContributionContext['store'],
  result: AssistantResult,
): void {
  const beforeApplySchema = cloneJson(store.schema)
  const schema = admitAssistantSchema(store, result.schema)
  const applyToken = `${result.id}:${Date.now()}`
  store.documentTransactions.markHistoryBarrier()
  const change = store.documentTransactions.transact((draft) => {
    replaceDraftDocument(draft, schema)
    draft.extensions = {
      ...(draft.extensions ?? {}),
      assistant: {
        lastResultId: result.id,
        appliedAt: Date.now(),
        beforeApplySchema,
        afterApplySchema: cloneJson(schema),
        applyToken,
      },
    }
  }, {
    label: 'Assistant apply',
    operation: { kind: 'assistant.apply', sessionPath: [], targetIds: ['document'], fieldPaths: [''], selectionLineage: null, structural: true },
  })
  if (change)
    lastAssistantApplyChangeIds.set(store, change.id)
  if (result.dataSource) {
    store.dataSourceRegistry.registerSource(result.dataSource)
  }
  store.markDraftModified()
}

export function applyAssistantPatchToDesigner(
  store: ContributionContext['store'],
  operations: AssistantPatchOperation[],
): boolean {
  if (!operations.length)
    return false
  const beforeApplySchema = cloneJson(store.schema)
  const nextSchema = applyAssistantPatch(beforeApplySchema as unknown as Record<string, unknown>, operations)
  const schema = admitAssistantSchema(store, nextSchema)
  const applyToken = `patch:${Date.now()}`
  store.documentTransactions.markHistoryBarrier()
  const change = store.documentTransactions.transact((draft) => {
    replaceDraftDocument(draft, schema)
    draft.extensions = {
      ...(draft.extensions ?? {}),
      assistant: {
        ...store.getExtension<AssistantDesignerExtension>('assistant'),
        appliedAt: Date.now(),
        beforeApplySchema,
        afterApplySchema: cloneJson(schema),
        applyToken,
      },
    }
  }, {
    label: 'Assistant apply',
    operation: { kind: 'assistant.apply', sessionPath: [], targetIds: ['document'], fieldPaths: [''], selectionLineage: null, structural: true },
  })
  if (change)
    lastAssistantApplyChangeIds.set(store, change.id)
  store.markDraftModified()
  return true
}

export function applySelectedAssistantElementsToDesigner(
  store: ContributionContext['store'],
  operations: AssistantPatchOperation[],
): boolean {
  const selectedOperations = selectAssistantPatchOperationsForElements(operations, store.schema, [...store.selection.ids])
  return applyAssistantPatchToDesigner(store, selectedOperations)
}

export function applyAssistantDataSourceToDesigner(
  store: ContributionContext['store'],
  dataSource: NonNullable<AssistantResult['dataSource']>,
): void {
  const beforeApplySchema = cloneJson(store.schema)
  store.dataSourceRegistry.registerSource(dataSource)
  store.documentTransactions.transact((draft) => {
    draft.extensions = {
      ...(draft.extensions ?? {}),
      assistant: {
        ...store.getExtension<AssistantDesignerExtension>('assistant'),
        appliedAt: Date.now(),
        beforeApplySchema,
        afterApplySchema: cloneJson(store.schema),
      },
    }
  }, {
    label: 'Assistant data source',
    operation: { kind: 'assistant.data-source', sessionPath: [], targetIds: ['document'], fieldPaths: ['/extensions/assistant'], selectionLineage: null, structural: false },
  })
  store.markDraftModified()
}

export function rollbackAssistantDesigner(store: ContributionContext['store']): boolean {
  const assistant = store.getExtension<AssistantDesignerExtension>('assistant')
  if (!assistant?.beforeApplySchema)
    return false
  if (!store.documentTransactions.canUndo)
    return false
  const expectedChangeId = lastAssistantApplyChangeIds.get(store)
  const top = store.documentTransactions.historyEntries[store.documentTransactions.cursor - 1]
  if (!top || !expectedChangeId || top.id !== expectedChangeId)
    return false
  store.documentTransactions.undo()
  lastAssistantApplyChangeIds.delete(store)
  store.markDraftModified()
  return true
}

function replaceDraftDocument(draft: DocumentSchemaInput, schema: DocumentSchemaInput): void {
  const target = draft as unknown as Record<string, unknown>
  for (const key of Object.keys(target))
    delete target[key]
  Object.assign(target, cloneJson(schema))
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function admitAssistantSchema(store: ContributionContext['store'], schema: unknown) {
  const loaded = loadDocumentWithProfile(schema as DocumentSchemaInput, store.materialProfile)
  const report = validateDocumentWithProfile(loaded.schema, store.materialProfile)
  if (loaded.diagnostics.some(item => item.severity === 'error') || !report.valid) {
    const diagnostics = [...new Set([...loaded.diagnostics, ...report.diagnostics]
      .map(item => `${item.code}:${item.path}`))]
      .join('\n')
    throw new Error(`ASSISTANT_SCHEMA_PROFILE_INVALID\n${diagnostics}`)
  }
  return cloneJson(loaded.schema)
}
