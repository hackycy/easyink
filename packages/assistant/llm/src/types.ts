import { z } from 'zod'

export const RuntimeLLMProviderSchema = z.enum(['openai', 'openai-compatible', 'anthropic'])

export type RuntimeLLMProvider = z.infer<typeof RuntimeLLMProviderSchema>

export const RuntimeLLMConfigSchema = z.object({
  provider: RuntimeLLMProviderSchema,
  apiKey: z.string().trim().min(1),
  model: z.string().trim().optional(),
  baseURL: z.string().trim().optional(),
})

export type RuntimeLLMConfig = z.infer<typeof RuntimeLLMConfigSchema>

export interface RuntimeLLMProviderOption {
  provider: RuntimeLLMProvider
  label: string
  baseURL?: string
  model?: string
}

export const LLMMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

export type LLMMessage = z.infer<typeof LLMMessageSchema>

export interface LLMCompleteOptions {
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json'
}

export interface LLMCompleteRequest {
  messages: LLMMessage[]
  options?: LLMCompleteOptions
}

export interface LLMCompleteResult {
  content: string
  model: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

export interface LLMClient {
  complete: (request: LLMCompleteRequest) => Promise<LLMCompleteResult>
}
