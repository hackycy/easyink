import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema, ExpectedDataSource } from '@easyink/schema'
import type { TemplateGenerationIntent } from '@easyink/schema-tools'
import type { AIGenerationPlan } from '@easyink/shared'

export interface LLMConfig {
  provider: 'claude' | 'openai'
  apiKey: string
  model?: string
  baseUrl?: string
}

/**
 * Progress event emitted while the LLM is producing output. Tool handlers
 * relay these to the MCP client via `notifications/progress` so that the
 * SDK request timeout can be reset (`resetTimeoutOnProgress`).
 */
export interface LLMProgressEvent {
  phase: 'llm-start' | 'llm-delta' | 'llm-done'
  /** Best-effort token count so far (may be approximated by output chars). */
  tokens: number
  message?: string
}

export interface SchemaGenerationInput {
  prompt: string
  currentSchema?: DocumentSchema
  systemPrompt: string
  generationPlan?: AIGenerationPlan
  /** Cancellation signal propagated to the underlying HTTP request. */
  signal?: AbortSignal
  /** Throttling is the provider's responsibility (~once per second). */
  onProgress?: (event: LLMProgressEvent) => void
}

export interface TemplateIntentGenerationInput {
  prompt: string
  currentSchema?: DocumentSchema
  systemPrompt: string
  generationPlan?: AIGenerationPlan
  signal?: AbortSignal
  onProgress?: (event: LLMProgressEvent) => void
}

export interface SchemaGenerationOutput {
  schema: DocumentSchema
  expectedDataSource: ExpectedDataSource
}

export interface DataSourceGenerationInput {
  systemPrompt: string
  expectedDataSource: ExpectedDataSource
  signal?: AbortSignal
  onProgress?: (event: LLMProgressEvent) => void
}

export type DataSourceGenerationOutput = DataSourceDescriptor

export interface LLMProvider {
  readonly name: string
  /**
   * Whether this provider streams partial output. When false the provider
   * only emits `llm-start` / `llm-done`, and tool handlers fall back to a
   * time-based heartbeat.
   */
  readonly supportsStreaming: boolean
  generateTemplateIntent: (input: TemplateIntentGenerationInput) => Promise<TemplateGenerationIntent>
  generateSchema: (input: SchemaGenerationInput) => Promise<SchemaGenerationOutput>
  generateDataSource: (
    input: DataSourceGenerationInput,
  ) => Promise<DataSourceGenerationOutput>
}
