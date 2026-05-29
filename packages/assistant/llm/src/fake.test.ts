import { describe, expect, it } from 'vitest'
import { createLLMClientFromEnv, OpenAILLMClient, StaticLLMClient } from './index'

describe('staticLLMClient', () => {
  it('implements the provider contract without network access', async () => {
    const result = await new StaticLLMClient('ok').complete({ messages: [{ role: 'user', content: 'ping' }] })
    expect(result).toMatchObject({ content: 'ok', model: 'static' })
  })

  it('creates provider clients from explicit assistant env config', () => {
    const client = createLLMClientFromEnv({
      EASYINK_ASSISTANT_LLM_PROVIDER: 'openai-compatible',
      EASYINK_ASSISTANT_LLM_MODEL: 'local-model',
      EASYINK_ASSISTANT_LLM_BASE_URL: 'http://127.0.0.1:11434/v1',
      OPENAI_API_KEY: 'test-key',
    })

    expect(client).toBeInstanceOf(OpenAILLMClient)
  })
})
