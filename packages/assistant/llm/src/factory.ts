import type { LLMClient, RuntimeLLMProvider } from './types'
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

export interface LLMClientConfig {
  provider: RuntimeLLMProvider | string
  apiKey?: string
  baseURL?: string
  model?: string
}

export function createLLMClientFromEnv(env: LLMEnvironment): LLMClient | undefined {
  const provider = readEnvValue(env.EASYINK_ASSISTANT_LLM_PROVIDER)?.toLowerCase()
  if (!provider)
    return undefined
  return createLLMClientFromConfig({
    provider,
    apiKey: readEnvValue(provider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY),
    baseURL: readEnvValue(env.EASYINK_ASSISTANT_LLM_BASE_URL) ?? readEnvValue(env.OPENAI_BASE_URL),
    model: readEnvValue(env.EASYINK_ASSISTANT_LLM_MODEL),
  })
}

export function createLLMClientFromConfig(config: LLMClientConfig): LLMClient {
  if (config.provider === 'openai' || config.provider === 'openai-compatible') {
    return new OpenAILLMClient({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
    })
  }
  if (config.provider === 'anthropic') {
    return new AnthropicLLMClient({
      apiKey: config.apiKey,
      model: config.model,
    })
  }
  throw new Error(`Unsupported EasyInk Assistant LLM provider: ${String(config.provider)}`)
}

function readEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}
