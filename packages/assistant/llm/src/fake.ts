import type { LLMClient, LLMCompleteRequest, LLMCompleteResult } from './types'

export class StaticLLMClient implements LLMClient {
  constructor(private readonly content = '{}') {}

  async complete(_request: LLMCompleteRequest): Promise<LLMCompleteResult> {
    return {
      content: this.content,
      model: 'static',
    }
  }
}
