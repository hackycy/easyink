import type { AssistantMaterialManifest, AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantConversationStatus, AssistantStore } from '@easyink/assistant-store'
import type { AssistantApiClient } from './api'
import type { AssistantTranslate } from './i18n'
import type { AssistantLLMConfigService } from './runtime-llm'

export interface AssistantConversationPanelProps {
  endpoint?: string
  apiClient?: AssistantApiClient
  currentSchema?: unknown
  materialManifest?: AssistantMaterialManifest
  store?: AssistantStore
  conversationId?: string
  llmConfig?: AssistantLLMConfigService
  t?: AssistantTranslate
}

export interface AssistantConversationPanelEmits {
  apply: [result: AssistantResult]
  applyPatch: [operations: AssistantPatchOperation[]]
  applySelectedPatch: [operations: AssistantPatchOperation[]]
  applyDataSource: [dataSource: NonNullable<AssistantResult['dataSource']>]
  rollback: []
  statusChange: [status: AssistantConversationStatus]
}

export type AssistantConversationView = 'chat' | 'history' | 'settings'
