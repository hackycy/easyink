import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema, ExpectedDataSource } from '@easyink/schema'

export interface LLMConfig {
  provider: 'claude' | 'openai'
  apiKey: string
  model?: string
  baseUrl?: string
}

export interface SchemaGenerationInput {
  prompt: string
  currentSchema?: DocumentSchema
  systemPrompt: string
}

export interface SchemaGenerationOutput {
  schema: DocumentSchema
  expectedDataSource: ExpectedDataSource
}

export interface DataSourceGenerationInput {
  systemPrompt: string
  expectedDataSource: ExpectedDataSource
}

export type DataSourceGenerationOutput = DataSourceDescriptor

export interface LLMProvider {
  readonly name: string
  generateSchema: (input: SchemaGenerationInput) => Promise<SchemaGenerationOutput>
  generateDataSource: (
    input: DataSourceGenerationInput,
  ) => Promise<DataSourceGenerationOutput>
}
