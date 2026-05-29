import type { LLMClient, LLMCompleteRequest, LLMCompleteResult } from './types'
import OpenAI from 'openai'

export interface OpenAILLMClientOptions {
  apiKey?: string
  baseURL?: string
  model?: string
}

export class OpenAILLMClient implements LLMClient {
  private readonly client: OpenAI
  private readonly model: string

  constructor(options: OpenAILLMClientOptions = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      dangerouslyAllowBrowser: true,
    })
    this.model = options.model ?? 'gpt-5-mini'
  }

  async complete(request: LLMCompleteRequest): Promise<LLMCompleteResult> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: request.messages,
      temperature: request.options?.temperature,
      max_tokens: request.options?.maxTokens,
      response_format: request.options?.responseFormat === 'json'
        ? { type: 'json_object' }
        : undefined,
    })
    const choice = completion.choices[0]
    return {
      content: choice?.message.content ?? '',
      model: completion.model,
      usage: {
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
    }
  }
}
