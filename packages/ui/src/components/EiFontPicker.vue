<script setup lang="ts">
import { IconCheck, IconExport, IconLoader } from '@easyink/icons'
import { computed } from 'vue'
import EiSelect from './EiSelect.vue'

type FontStatus = 'unloaded' | 'loading' | 'loaded' | 'error'

const props = defineProps<{
  modelValue?: string
  fonts?: Array<{ family: string, displayName: string, preview?: string }>
  fontStatuses?: Record<string, FontStatus>
  defaultLabel?: string
  loadLabel?: string
  searchPlaceholder?: string
  label?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'commit': [value: string]
  'load': [family: string]
}>()

const fontOptions = computed(() =>
  [
    {
      label: props.defaultLabel ?? 'Default',
      value: '',
      title: props.defaultLabel ?? 'Default',
      preview: 'AaBbCc 1234',
    },
    ...(props.fonts ?? []).map(font => ({
      label: font.displayName,
      value: font.family,
      title: font.family,
      preview: font.preview,
    })),
  ],
)

const displayValue = computed(() => {
  if (!props.modelValue)
    return ''
  const found = props.fonts?.find(f => f.family === props.modelValue)
  return found ? found.displayName : props.modelValue
})

const selectedFontFamily = computed(() => props.modelValue || undefined)

function previewText(option: unknown) {
  const preview = typeof option === 'object' && option !== null && 'preview' in option
    ? (option as { preview?: unknown }).preview
    : undefined
  return typeof preview === 'string' && preview ? preview : 'AaBbCc 1234'
}

function fontStatus(family: string): FontStatus {
  if (!family)
    return 'loaded'
  return props.fontStatuses?.[family] ?? 'unloaded'
}

function isLoadable(family: string) {
  const status = fontStatus(family)
  return !!family && status !== 'loaded' && status !== 'loading'
}

function updateFont(family: string) {
  emit('update:modelValue', family)
}

function commitFont(family: string) {
  emit('commit', family)
}

function handleInputChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  emit('update:modelValue', val)
  emit('commit', val)
}
</script>

<template>
  <div class="ei-font-picker-wrapper">
    <EiSelect
      v-if="fonts"
      :label="label"
      :model-value="modelValue"
      :options="fontOptions"
      :disabled="disabled"
      :dropdown-width="240"
      :max-height="260"
      :show-selected-check="false"
      searchable
      :search-placeholder="searchPlaceholder ?? '...'"
      @update:model-value="updateFont(String($event))"
      @commit="commitFont(String($event))"
    >
      <template #value>
        <span class="ei-font-picker__value" :style="{ fontFamily: selectedFontFamily }">
          {{ displayValue || '--' }}
        </span>
      </template>
      <template #option="{ option, selected }">
        <div class="ei-font-picker__option">
          <span class="ei-font-picker__item" :style="{ fontFamily: String(option.value) || undefined }">
            <span class="ei-font-picker__item-name">{{ option.label }}</span>
            <span class="ei-font-picker__item-preview">{{ previewText(option) }}</span>
          </span>
          <span class="ei-font-picker__state">
            <IconLoader
              v-if="fontStatus(String(option.value)) === 'loading'"
              class="ei-font-picker__status ei-font-picker__status--loading"
              :size="13"
              :stroke-width="1.8"
            />
            <button
              v-else-if="isLoadable(String(option.value))"
              type="button"
              class="ei-font-picker__load"
              :title="loadLabel ?? 'Load font'"
              :aria-label="loadLabel ?? 'Load font'"
              @click.stop="emit('load', String(option.value))"
            >
              <IconExport :size="13" :stroke-width="1.8" />
            </button>
            <IconCheck
              v-else-if="selected"
              class="ei-font-picker__status"
              :size="13"
              :stroke-width="1.8"
            />
          </span>
        </div>
      </template>
    </EiSelect>
    <input
      v-else
      class="ei-font-picker__fallback"
      :value="modelValue"
      :disabled="disabled"
      @change="handleInputChange"
    >
  </div>
</template>

<style scoped lang="scss">
.ei-font-picker-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ei-font-picker {
  &__fallback {
    width: 100%;
    padding: 4px 8px;
    border: 1px solid var(--ei-border-color, #d0d0d0);
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    background: var(--ei-input-bg, #fff);
    color: var(--ei-text, #333);
    box-sizing: border-box;

    &:focus {
      border-color: var(--ei-primary, #1890ff);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.ei-font-picker__value {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ei-font-picker__item {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 2px 0;
  line-height: 1.25;
}

.ei-font-picker__option {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
}

.ei-font-picker__item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ei-font-picker__item-preview {
  color: var(--ei-text-secondary, #666);
  font-size: 16px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ei-font-picker__load {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--ei-text-secondary, #666);
  cursor: pointer;

  &:hover {
    background: var(--ei-hover-bg, #f0f0f0);
    color: var(--ei-primary, #1890ff);
  }
}

.ei-font-picker__state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
}

.ei-font-picker__status {
  flex: 0 0 auto;
  color: var(--ei-primary, #1890ff);

  &--loading {
    animation: ei-font-picker-spin 1s linear infinite;
  }
}

@keyframes ei-font-picker-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
