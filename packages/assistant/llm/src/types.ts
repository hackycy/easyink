import { z } from 'zod'

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
