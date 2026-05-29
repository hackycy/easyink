import type { LLMClient, LLMCompleteRequest, LLMCompleteResult } from './types'
import Anthropic from '@anthropic-ai/sdk'

export interface AnthropicLLMClientOptions {
  apiKey?: string
  model?: string
}

export class AnthropicLLMClient implements LLMClient {
  private readonly client: Anthropic
  private readonly model: string

  constructor(options: AnthropicLLMClientOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      dangerouslyAllowBrowser: true,
    })
    this.model = options.model ?? 'claude-sonnet-4-5'
  }

  async complete(request: LLMCompleteRequest): Promise<LLMCompleteResult> {
    const system = request.messages.find(message => message.role === 'system')?.content
    const messages = request.messages
      .filter(message => message.role !== 'system')
      .map(message => ({
        role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: message.content,
      }))

    const response = await this.client.messages.create({
      model: this.model,
      system,
      messages,
      max_tokens: request.options?.maxTokens ?? 2048,
      temperature: request.options?.temperature,
    })
    return {
      content: response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join(''),
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    }
  }
}
