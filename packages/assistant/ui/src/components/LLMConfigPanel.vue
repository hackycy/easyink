<script setup lang="ts">
import type { RuntimeLLMProvider, RuntimeLLMProviderOption } from '@easyink/assistant-llm'
import type { AssistantTranslate } from '../i18n'
import { IconDelete, IconSave } from '@easyink/icons'
import { EiSelect } from '@easyink/ui'
import { computed } from 'vue'
import { translateAssistant } from '../i18n'

const props = defineProps<{
  provider: RuntimeLLMProvider
  providers: RuntimeLLMProviderOption[]
  apiKey: string
  model: string
  baseUrl: string
  showBaseUrl?: boolean
  configured?: boolean
  error?: string
  t?: AssistantTranslate
}>()

const emit = defineEmits<{
  'update:provider': [provider: RuntimeLLMProvider]
  'update:apiKey': [value: string]
  'update:model': [value: string]
  'update:baseUrl': [value: string]
  'save': []
  'clear': []
}>()

const providerSelectOptions = computed(() => props.providers.map(option => ({
  label: option.label,
  value: option.provider,
})))

function updateProvider(value: string | number): void {
  emit('update:provider', String(value) as RuntimeLLMProvider)
}

function tr(key: string): string {
  return translateAssistant(key, props.t)
}
</script>

<template>
  <main class="assistant-settings-panel" :aria-label="tr('designer.assistant.llm.title')">
    <header class="assistant-settings-panel__head">
      <div>
        <strong>{{ tr('designer.assistant.llm.title') }}</strong>
        <span :class="{ 'assistant-settings-panel__status--active': configured }">
          {{ configured ? tr('designer.assistant.llm.configured') : tr('designer.assistant.llm.unconfigured') }}
        </span>
      </div>
    </header>

    <form class="assistant-settings-form" @submit.prevent="emit('save')">
      <div class="assistant-settings-tip">
        <strong>{{ tr('designer.assistant.llm.securityTipTitle') }}</strong>
        <p>{{ tr('designer.assistant.llm.securityTip') }}</p>
      </div>

      <div class="assistant-settings-field">
        <EiSelect
          :label="tr('designer.assistant.llm.provider')"
          :model-value="provider"
          :options="providerSelectOptions"
          :show-selected-check="false"
          @update:model-value="updateProvider"
        />
      </div>
      <label>
        <span>{{ tr('designer.assistant.llm.apiKey') }}</span>
        <input :value="apiKey" type="password" autocomplete="off" @input="emit('update:apiKey', ($event.target as HTMLInputElement).value)">
      </label>
      <label>
        <span>{{ tr('designer.assistant.llm.model') }}</span>
        <input :value="model" type="text" autocomplete="off" @input="emit('update:model', ($event.target as HTMLInputElement).value)">
      </label>
      <label v-if="showBaseUrl">
        <span>{{ tr('designer.assistant.llm.baseURL') }}</span>
        <input :value="baseUrl" type="url" autocomplete="off" @input="emit('update:baseUrl', ($event.target as HTMLInputElement).value)">
      </label>
      <p v-if="error" class="assistant-settings-form__error">
        {{ error }}
      </p>
      <div class="assistant-settings-form__actions">
        <button
          type="button"
          class="assistant-settings-form__action"
          :title="tr('designer.assistant.action.clearLLMConfig')"
          :aria-label="tr('designer.assistant.action.clearLLMConfig')"
          @click="emit('clear')"
        >
          <IconDelete :size="15" stroke-width="1.9" />
        </button>
        <button
          type="submit"
          class="assistant-settings-form__action assistant-settings-form__action--primary"
          :title="tr('designer.assistant.action.saveLLMConfig')"
          :aria-label="tr('designer.assistant.action.saveLLMConfig')"
        >
          <IconSave :size="15" stroke-width="1.9" />
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped lang="scss">
.assistant-settings-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: auto;
  padding: 22px 24px 18px;
  background: var(--assistant-bg);
}

.assistant-settings-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--assistant-muted);
  font-size: 12px;

  > div {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  strong {
    color: var(--assistant-text);
    font-size: 14px;
    font-weight: 600;
  }

  span {
    display: inline-flex;
    height: 22px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--assistant-surface);
    color: var(--assistant-muted);
    font-size: 11px;
    font-weight: 600;
    padding: 0 9px;
  }
}

.assistant-settings-panel__status--active {
  background: rgb(22 163 74 / 12%) !important;
  color: #15803d !important;
}

.assistant-settings-form {
  display: flex;
  width: 100%;
  max-width: 420px;
  flex-direction: column;
  gap: 12px;
  padding: 2px 0;
  font-size: 12px;

  label {
    display: grid;
    gap: 6px;
    color: var(--assistant-muted);
  }

  input,
  :deep(.ei-select__trigger) {
    width: 100%;
    height: 34px;
    box-sizing: border-box;
    border: 1px solid var(--assistant-border);
    border-radius: 8px;
    background: var(--assistant-bg);
    color: var(--assistant-text);
    font: inherit;
    outline: none;
    padding: 0 10px;

    &:focus {
      border-color: var(--assistant-accent);
      box-shadow: 0 0 0 3px var(--assistant-primary-soft);
    }
  }

  :deep(.ei-select__label) {
    color: var(--assistant-muted);
    font-size: 12px;
  }
}

.assistant-settings-field {
  display: block;
  width: 100%;
}

.assistant-settings-tip {
  position: relative;
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--assistant-accent) 22%, var(--assistant-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--assistant-accent) 7%, var(--assistant-bg));
  color: var(--assistant-muted);
  line-height: 1.55;

  &::before {
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 0;
    width: 3px;
    border-radius: 0 999px 999px 0;
    background: var(--assistant-accent);
    content: '';
  }

  strong {
    color: var(--assistant-accent);
    font-size: 12px;
    font-weight: 700;
  }

  p {
    margin: 0;
  }
}

.assistant-settings-form__error {
  margin: 0;
  color: var(--assistant-danger);
  line-height: 1.5;
}

.assistant-settings-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 2px;
}

.assistant-settings-form__action {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: var(--assistant-surface);
  color: var(--assistant-muted);
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, color 0.15s, transform 0.15s;

  &:hover {
    color: var(--assistant-text);
    transform: translateY(-1px);
  }
}

.assistant-settings-form__action--primary {
  background: var(--assistant-accent);
  color: #fff;

  &:hover {
    background: var(--assistant-accent-hover);
    color: #fff;
  }
}
</style>
