import type { RuntimeLLMConfig, RuntimeLLMProvider, RuntimeLLMProviderOption } from '@easyink/assistant-llm'
import type { Ref } from 'vue'
import type { AssistantApiClient } from '../api'
import type { AssistantTranslate } from '../i18n'
import type { AssistantLLMConfigService } from '../runtime-llm'
import { computed, ref } from 'vue'
import { translateAssistant } from '../i18n'

export interface RuntimeLLMConfigDraft {
  provider: RuntimeLLMProvider
  apiKey: string
  model: string
  baseURL: string
}

export interface RuntimeLLMConfigInput {
  service: Ref<AssistantLLMConfigService | undefined>
  t: Ref<AssistantTranslate | undefined>
}

const FALLBACK_PROVIDER: RuntimeLLMProviderOption = {
  provider: 'openai',
  label: 'OpenAI',
  model: 'gpt-5-mini',
}

export function useRuntimeLLMConfig(input: RuntimeLLMConfigInput) {
  const runtimeConfig = ref<RuntimeLLMConfig>()
  const error = ref<string>()
  const serviceProviders = ref<RuntimeLLMProviderOption[]>([])
  const serverProviders = ref<RuntimeLLMProviderOption[]>([])
  const serverConfigured = ref(true)
  const requestEnabled = ref(false)
  const draft = ref<RuntimeLLMConfigDraft>(createDraft())

  const enabled = computed(() => Boolean(input.service.value))
  const providerOptions = computed(() => {
    if (serverProviders.value.length)
      return serverProviders.value
    if (serviceProviders.value.length)
      return serviceProviders.value
    return [FALLBACK_PROVIDER]
  })
  const activeProvider = computed(() => providerOptions.value.find(option => option.provider === draft.value.provider))
  const showBaseURL = computed(() => draft.value.provider === 'openai-compatible' || draft.value.provider === 'openai')
  const hasConfig = computed(() => Boolean(runtimeConfig.value?.apiKey))
  const configRequired = computed(() => enabled.value && requestEnabled.value && !serverConfigured.value && !runtimeConfig.value)

  async function load(api: AssistantApiClient): Promise<void> {
    const service = input.service.value
    if (!service)
      return
    serviceProviders.value = service.providers ?? []
    const saved = await service.load()
    runtimeConfig.value = saved
    try {
      const capabilities = await api.getCapabilities()
      serverConfigured.value = capabilities.llm.serverConfigured
      requestEnabled.value = capabilities.llm.requestConfigEnabled
      serverProviders.value = capabilities.llm.providers
    }
    catch {
      requestEnabled.value = false
    }
    setDraft(saved)
  }

  function setDraft(config?: RuntimeLLMConfig): void {
    draft.value = createDraft(config, providerOptions.value)
  }

  function setProvider(provider: RuntimeLLMProvider): void {
    const option = providerOptions.value.find(item => item.provider === provider)
    draft.value = {
      ...draft.value,
      provider,
      model: option?.model ?? '',
      baseURL: option?.baseURL ?? '',
    }
  }

  function updateDraft(patch: Partial<RuntimeLLMConfigDraft>): void {
    draft.value = { ...draft.value, ...patch }
  }

  async function save(): Promise<boolean> {
    const service = input.service.value
    if (!service)
      return false
    const config = normalizeDraft()
    if (!config) {
      error.value = tr('designer.assistant.error.llmConfigInvalid')
      return false
    }
    await service.save?.(config)
    runtimeConfig.value = config
    error.value = undefined
    return true
  }

  async function clear(): Promise<void> {
    await input.service.value?.clear?.()
    runtimeConfig.value = undefined
    error.value = undefined
    setDraft()
  }

  function markRequired(): void {
    error.value = tr('designer.assistant.error.llmConfigRequired')
  }

  function normalizeDraft(): RuntimeLLMConfig | undefined {
    const apiKey = draft.value.apiKey.trim()
    if (!apiKey)
      return undefined
    const model = draft.value.model.trim()
    const baseURL = draft.value.baseURL.trim()
    return {
      provider: draft.value.provider,
      apiKey,
      model: model || undefined,
      baseURL: showBaseURL.value && baseURL ? baseURL : undefined,
    }
  }

  function tr(key: string): string {
    return translateAssistant(key, input.t.value)
  }

  return {
    activeProvider,
    clear,
    configRequired,
    draft,
    enabled,
    error,
    hasConfig,
    load,
    markRequired,
    providerOptions,
    requestEnabled,
    runtimeConfig,
    save,
    serverConfigured,
    setProvider,
    showBaseURL,
    updateDraft,
  }
}

function createDraft(config?: RuntimeLLMConfig, providers: RuntimeLLMProviderOption[] = [FALLBACK_PROVIDER]): RuntimeLLMConfigDraft {
  const provider = config?.provider ?? providers[0]?.provider ?? 'openai'
  const option = providers.find(item => item.provider === provider)
  return {
    provider,
    apiKey: config?.apiKey ?? '',
    model: config?.model ?? option?.model ?? '',
    baseURL: config?.baseURL ?? option?.baseURL ?? '',
  }
}
