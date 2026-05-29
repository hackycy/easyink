import type { LLMClient } from './types'
import { AnthropicLLMClient } from './anthropic'
import { OpenAILLMClient } from './openai'

export interface LLMEnvironment {
  EASYINK_ASSISTANT_LLM_PROVIDER?: string
  EASYINK_ASSISTANT_LLM_MODEL?: string
  EASYINK_ASSISTANT_LLM_BASE_URL?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  ANTHROPIC_API_KEY?: string
}

export function createLLMClientFromEnv(env: LLMEnvironment): LLMClient | undefined {
  const provider = (env.EASYINK_ASSISTANT_LLM_PROVIDER ?? '').trim().toLowerCase()
  if (!provider)
    return undefined
  if (provider === 'openai' || provider === 'openai-compatible') {
    return new OpenAILLMClient({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.EASYINK_ASSISTANT_LLM_BASE_URL ?? env.OPENAI_BASE_URL,
      model: env.EASYINK_ASSISTANT_LLM_MODEL,
    })
  }
  if (provider === 'anthropic') {
    return new AnthropicLLMClient({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.EASYINK_ASSISTANT_LLM_MODEL,
    })
  }
  throw new Error(`Unsupported EasyInk Assistant LLM provider: ${provider}`)
}
