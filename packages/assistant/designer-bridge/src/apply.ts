import type { AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { DeepReadonly } from '@easyink/plugin-api'
import type { DesignerContext } from '@easyink/plugin-api/designer'
import type { DocumentSchema, DocumentSchemaInput } from '@easyink/schema'
import { applyAssistantPatch, selectAssistantPatchOperationsForElements } from '@easyink/assistant-capabilities'

interface AssistantDesignerExtension {
  lastResultId?: string
  appliedAt?: number
  beforeApplySchema?: unknown
  afterApplySchema?: unknown
}

export function applyAssistantResultToDesigner(
  store: DesignerContext,
  result: AssistantResult,
): void {
  const beforeApplySchema = cloneJson(store.getSchema())
  store.replaceDocument(result.schema)
  if (result.dataSource) {
    store.registerDataSource(result.dataSource)
  }
  store.writeDocumentExtension('assistant', {
    lastResultId: result.id,
    appliedAt: Date.now(),
    beforeApplySchema,
    afterApplySchema: cloneJson(result.schema),
  })
}

export function applyAssistantPatchToDesigner(
  store: DesignerContext,
  operations: AssistantPatchOperation[],
): boolean {
  if (!operations.length)
    return false
  const beforeApplySchema = cloneJson(store.getSchema())
  const nextSchema = applyAssistantPatch(beforeApplySchema as unknown as Record<string, unknown>, operations)
  store.replaceDocument(nextSchema)
  store.writeDocumentExtension('assistant', {
    ...(store.readDocumentExtension('assistant') as AssistantDesignerExtension | undefined),
    appliedAt: Date.now(),
    beforeApplySchema,
    afterApplySchema: cloneJson(nextSchema),
  })
  return true
}

export function applySelectedAssistantElementsToDesigner(
  store: DesignerContext,
  operations: AssistantPatchOperation[],
): boolean {
  const selectedOperations = selectAssistantPatchOperationsForElements(operations, cloneJson<DocumentSchema>(store.getSchema()), [...store.getSelection().ids])
  return applyAssistantPatchToDesigner(store, selectedOperations)
}

export function applyAssistantDataSourceToDesigner(
  store: DesignerContext,
  dataSource: NonNullable<AssistantResult['dataSource']>,
): void {
  const beforeApplySchema = cloneJson(store.getSchema())
  store.registerDataSource(dataSource)
  store.writeDocumentExtension('assistant', {
    ...(store.readDocumentExtension('assistant') as AssistantDesignerExtension | undefined),
    appliedAt: Date.now(),
    beforeApplySchema,
    afterApplySchema: cloneJson(store.getSchema()),
  })
}

export function rollbackAssistantDesigner(store: DesignerContext): boolean {
  const assistant = store.readDocumentExtension('assistant') as AssistantDesignerExtension | undefined
  if (!assistant?.beforeApplySchema)
    return false
  store.replaceDocument(assistant.beforeApplySchema as DocumentSchemaInput)
  store.writeDocumentExtension('assistant', {
    ...assistant,
    afterApplySchema: undefined,
    appliedAt: Date.now(),
  })
  return true
}

function cloneJson<T>(value: DeepReadonly<T>): T {
  return JSON.parse(JSON.stringify(value)) as T
}
