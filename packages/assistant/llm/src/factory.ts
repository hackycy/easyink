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
  const provider = readEnvValue(env.EASYINK_ASSISTANT_LLM_PROVIDER)?.toLowerCase()
  if (!provider)
    return undefined
  if (provider === 'openai' || provider === 'openai-compatible') {
    return new OpenAILLMClient({
      apiKey: readEnvValue(env.OPENAI_API_KEY),
      baseURL: readEnvValue(env.EASYINK_ASSISTANT_LLM_BASE_URL) ?? readEnvValue(env.OPENAI_BASE_URL),
      model: readEnvValue(env.EASYINK_ASSISTANT_LLM_MODEL),
    })
  }
  if (provider === 'anthropic') {
    return new AnthropicLLMClient({
      apiKey: readEnvValue(env.ANTHROPIC_API_KEY),
      model: readEnvValue(env.EASYINK_ASSISTANT_LLM_MODEL),
    })
  }
  throw new Error(`Unsupported EasyInk Assistant LLM provider: ${provider}`)
}

function readEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}
