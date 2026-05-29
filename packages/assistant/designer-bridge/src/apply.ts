import type { AssistantResult } from '@easyink/assistant-capabilities'
import type { ContributionContext } from '@easyink/designer'

export function applyAssistantResultToDesigner(
  store: ContributionContext['store'],
  result: AssistantResult,
): void {
  store.setSchema(result.schema)
  if (result.dataSource) {
    store.dataSourceRegistry.registerSource(result.dataSource)
  }
  store.setExtension('assistant', {
    lastResultId: result.id,
    appliedAt: Date.now(),
  })
  store.markDraftModified()
}
