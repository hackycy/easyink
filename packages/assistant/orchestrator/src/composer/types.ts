import type { LLMClient } from '@easyink/assistant-llm'
import type { MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import type { ToolCallResult } from '@easyink/assistant-tool-registry'
import type { DocumentSchema } from '@easyink/schema'

export interface ComposerAgentOptions {
  llm: LLMClient
  registry?: MaterialKnowledgeRegistry
  maxIterations?: number
}

export interface ComposerInput {
  prompt: string
  sourceData?: unknown
  sourceName?: string
  currentSchema?: DocumentSchema
  pageMode?: 'fixed' | 'continuous'
  pageWidth?: number
  pageHeight?: number
  materialManifest?: { materials: Array<{ type: string, name?: string, ai?: Record<string, unknown> }> }
}

export interface ComposerResult {
  schema: DocumentSchema
  expectedDataSource: Record<string, unknown>
  warnings: string[]
  iterations: number
  toolCalls: ToolCallRecord[]
}

export interface ToolCallRecord {
  tool: string
  input: unknown
  output: unknown
  timestamp: number
}

export interface ComposerStep {
  type: 'think' | 'tool_call' | 'tool_result' | 'complete' | 'error'
  content?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: ToolCallResult
  timestamp: number
}

export type ComposerEventHandler = (step: ComposerStep) => void
