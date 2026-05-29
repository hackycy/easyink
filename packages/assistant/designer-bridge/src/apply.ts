import type { AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { ContributionContext } from '@easyink/designer'
import { applyAssistantPatch, selectAssistantPatchOperationsForElements } from '@easyink/assistant-capabilities'

interface AssistantDesignerExtension {
  lastResultId?: string
  appliedAt?: number
  beforeApplySchema?: unknown
  afterApplySchema?: unknown
}

export function applyAssistantResultToDesigner(
  store: ContributionContext['store'],
  result: AssistantResult,
): void {
  const beforeApplySchema = cloneJson(store.schema)
  store.setSchema(result.schema)
  if (result.dataSource) {
    store.dataSourceRegistry.registerSource(result.dataSource)
  }
  store.setExtension('assistant', {
    lastResultId: result.id,
    appliedAt: Date.now(),
    beforeApplySchema,
    afterApplySchema: cloneJson(result.schema),
  })
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
  store.setSchema(nextSchema)
  store.setExtension('assistant', {
    ...store.getExtension<AssistantDesignerExtension>('assistant'),
    appliedAt: Date.now(),
    beforeApplySchema,
    afterApplySchema: cloneJson(nextSchema),
  })
  store.markDraftModified()
  return true
}

export function applySelectedAssistantElementsToDesigner(
  store: ContributionContext['store'],
  operations: AssistantPatchOperation[],
): boolean {
  const selectedOperations = selectAssistantPatchOperationsForElements(operations, store.schema, store.selection.ids)
  return applyAssistantPatchToDesigner(store, selectedOperations)
}

export function applyAssistantDataSourceToDesigner(
  store: ContributionContext['store'],
  dataSource: NonNullable<AssistantResult['dataSource']>,
): void {
  const beforeApplySchema = cloneJson(store.schema)
  store.dataSourceRegistry.registerSource(dataSource)
  store.setExtension('assistant', {
    ...store.getExtension<AssistantDesignerExtension>('assistant'),
    appliedAt: Date.now(),
    beforeApplySchema,
    afterApplySchema: cloneJson(store.schema),
  })
  store.markDraftModified()
}

export function rollbackAssistantDesigner(store: ContributionContext['store']): boolean {
  const assistant = store.getExtension<AssistantDesignerExtension>('assistant')
  if (!assistant?.beforeApplySchema)
    return false
  store.setSchema(assistant.beforeApplySchema)
  store.setExtension('assistant', {
    ...assistant,
    afterApplySchema: undefined,
    appliedAt: Date.now(),
  })
  store.markDraftModified()
  return true
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
