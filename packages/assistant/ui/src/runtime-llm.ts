import type { RuntimeLLMConfig, RuntimeLLMProvider, RuntimeLLMProviderOption } from '@easyink/assistant-llm'

export type AssistantLLMConfigPersistence = 'memory' | 'session' | 'local'

export interface AssistantLLMConfigService {
  load: () => RuntimeLLMConfig | undefined | Promise<RuntimeLLMConfig | undefined>
  save?: (config: RuntimeLLMConfig) => void | Promise<void>
  clear?: () => void | Promise<void>
  providers?: RuntimeLLMProviderOption[]
  persistence?: AssistantLLMConfigPersistence
}

export interface BrowserAssistantLLMConfigServiceOptions {
  storageKey?: string
  persistence?: AssistantLLMConfigPersistence
  providers?: RuntimeLLMProviderOption[] | RuntimeLLMProvider[]
}

const DEFAULT_STORAGE_KEY = 'easyink.assistant.runtime-llm'
const DEFAULT_PROVIDER_OPTIONS: RuntimeLLMProviderOption[] = [
  { provider: 'openai', label: 'OpenAI', model: 'gpt-5-mini' },
  { provider: 'openai-compatible', label: 'OpenAI Compatible' },
  { provider: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-5' },
]

export function createBrowserAssistantLLMConfigService(options: BrowserAssistantLLMConfigServiceOptions = {}): AssistantLLMConfigService {
  const persistence = options.persistence ?? 'session'
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
  const providers = normalizeProviderOptions(options.providers)
  let memoryConfig: RuntimeLLMConfig | undefined

  return {
    providers,
    persistence,
    load() {
      if (persistence === 'memory')
        return memoryConfig
      const raw = resolveStorage(persistence)?.getItem(storageKey)
      if (!raw)
        return undefined
      try {
        return JSON.parse(raw) as RuntimeLLMConfig
      }
      catch {
        return undefined
      }
    },
    save(config) {
      if (persistence === 'memory') {
        memoryConfig = { ...config }
        return
      }
      resolveStorage(persistence)?.setItem(storageKey, JSON.stringify(config))
    },
    clear() {
      memoryConfig = undefined
      if (persistence !== 'memory')
        resolveStorage(persistence)?.removeItem(storageKey)
    },
  }
}

function normalizeProviderOptions(providers?: RuntimeLLMProviderOption[] | RuntimeLLMProvider[]): RuntimeLLMProviderOption[] {
  if (!providers?.length)
    return DEFAULT_PROVIDER_OPTIONS
  return providers.map((provider) => {
    if (typeof provider !== 'string')
      return provider
    const option = DEFAULT_PROVIDER_OPTIONS.find(item => item.provider === provider)
    return option ?? { provider, label: provider }
  })
}

function resolveStorage(persistence: AssistantLLMConfigPersistence): Storage | undefined {
  if (typeof window === 'undefined')
    return undefined
  return persistence === 'local' ? window.localStorage : window.sessionStorage
}
