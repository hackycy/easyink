import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema, ExpectedDataSource } from '@easyink/schema'
import type { AIGenerationPlan } from '@easyink/shared'

export interface LLMConfig {
  provider: 'claude' | 'openai'
  apiKey: string
  model?: string
  baseUrl?: string
  strictOutput?: boolean
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
  /**
   * Issues from the previous attempt that the model should fix. Rendered as
   * an additional user message before the original prompt so the LLM can
   * react without losing the original instruction.
   */
  feedbackMessages?: string[]
  /**
   * Optional override of the model temperature. Used by retry loops to bump
   * diversity on the second attempt.
   */
  temperature?: number
  /** Cancellation signal propagated to the underlying HTTP request. */
  signal?: AbortSignal
  /** Throttling is the provider's responsibility (~once per second). */
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
  generateSchema: (input: SchemaGenerationInput) => Promise<SchemaGenerationOutput>
  generateDataSource: (
    input: DataSourceGenerationInput,
  ) => Promise<DataSourceGenerationOutput>
}
