<script setup lang="ts">
import type { DesignerAssetPickRequest, DesignerResolvedAsset } from '../types'
import { IconCircleAlert, IconClose, IconImage, IconLoader } from '@easyink/icons'
import { EiIcon } from '@easyink/ui'
import { computed, nextTick, ref, watch } from 'vue'
import { useDesignerStore } from '../composables'

const props = defineProps<{
  label: string
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  pickRequest: DesignerAssetPickRequest
  t: (key: string) => string
  pickTitleKey?: string
  clearTitleKey?: string
  previewTitleKey?: string
  previewLoadingTitleKey?: string
  previewFailedTitleKey?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'commit': [value: string]
  'pick': [result: DesignerResolvedAsset]
}>()

const store = useDesignerStore()
const snapshotValue = ref<string | undefined>()
const pending = ref(false)
const pickButtonRef = ref<HTMLElement | null>(null)
const previewState = ref<'idle' | 'loading' | 'loaded' | 'error'>('idle')

const value = computed(() => props.modelValue ?? '')
const hasValue = computed(() => value.value.trim().length > 0)
const canPickImage = computed(() => store.assetPickerAvailable)
const pickTitle = computed(() => props.t(props.pickTitleKey ?? 'designer.action.pickImage'))
const clearTitle = computed(() => props.t(props.clearTitleKey ?? 'designer.action.clearImage'))
const previewTitle = computed(() => props.t(props.previewTitleKey ?? 'designer.action.imagePreview'))
const previewLoadingTitle = computed(() => props.t(props.previewLoadingTitleKey ?? 'designer.action.imagePreviewLoading'))
const previewFailedTitle = computed(() => props.t(props.previewFailedTitleKey ?? 'designer.action.imagePreviewFailed'))

watch(value, (next) => {
  previewState.value = next.trim() ? 'loading' : 'idle'
}, { immediate: true })

function onFocus() {
  snapshotValue.value = value.value
}

function updateValue(next: string) {
  emit('update:modelValue', next)
}

function commitValue(next: string) {
  if (next !== snapshotValue.value)
    emit('commit', next)
  snapshotValue.value = next
}

function onInput(event: Event) {
  updateValue((event.target as HTMLInputElement).value)
}

function onCommit(event: Event) {
  commitValue((event.target as HTMLInputElement).value)
}

function clearValue() {
  updateValue('')
  emit('commit', '')
  snapshotValue.value = ''
}

function commitPickedResult(result: DesignerResolvedAsset) {
  updateValue(result.url)
  emit('pick', result)
  snapshotValue.value = result.url
}

function text(key: string, fallback: string): string {
  const value = props.t(key)
  return value === key ? fallback : value
}

async function pickImage() {
  if (pending.value || props.disabled || !canPickImage.value)
    return

  pending.value = true
  try {
    const result = await store.interactions.pickAsset({
      ...props.pickRequest,
      currentUrl: value.value,
    })
    if (!result)
      return
    if (typeof result.url !== 'string' || !result.url.trim()) {
      store.diagnostics.push({
        source: 'designer-interaction',
        severity: 'warn',
        message: text('designer.diagnostic.assetPickerEmptyUrl', 'Asset picker returned an empty asset URL.'),
        detail: { requestId: props.pickRequest.id },
      })
      return
    }

    commitPickedResult(result)
  }
  catch (error) {
    store.diagnostics.push({
      source: 'designer-interaction',
      severity: 'error',
      message: text('designer.diagnostic.assetPickerFailed', 'Asset picker failed.'),
      detail: {
        requestId: props.pickRequest.id,
        error: error instanceof Error ? error.message : String(error),
      },
    })
  }
  finally {
    pending.value = false
    await nextTick()
    pickButtonRef.value?.focus()
  }
}
</script>

<template>
  <div class="ei-image-source-editor">
    <label class="ei-image-source-editor__label">{{ label }}</label>
    <div class="ei-image-source-editor__row">
      <input
        class="ei-image-source-editor__input"
        type="text"
        :value="value"
        :placeholder="placeholder"
        :disabled="disabled"
        @focus="onFocus"
        @input="onInput"
        @blur="onCommit"
        @keydown.enter="onCommit"
      >
      <button
        ref="pickButtonRef"
        class="ei-image-source-editor__button"
        type="button"
        :title="pickTitle"
        :aria-label="pickTitle"
        :disabled="disabled || pending || !canPickImage"
        @pointerdown.stop
        @click.stop="pickImage"
      >
        <EiIcon :icon="pending ? IconLoader : IconImage" :size="15" />
      </button>
      <button
        v-if="hasValue"
        class="ei-image-source-editor__button"
        type="button"
        :title="clearTitle"
        :aria-label="clearTitle"
        :disabled="disabled || pending"
        @pointerdown.stop
        @click.stop="clearValue"
      >
        <EiIcon :icon="IconClose" :size="15" />
      </button>
    </div>
    <div
      v-if="hasValue"
      class="ei-image-source-editor__preview"
      :title="previewTitle"
    >
      <img
        v-show="previewState !== 'error'"
        class="ei-image-source-editor__image"
        :src="value"
        alt=""
        @load="previewState = 'loaded'"
        @error="previewState = 'error'"
      >
      <div
        v-if="previewState === 'loading'"
        class="ei-image-source-editor__placeholder"
        :title="previewLoadingTitle"
        :aria-label="previewLoadingTitle"
      >
        <EiIcon :icon="IconLoader" :size="16" />
      </div>
      <div
        v-else-if="previewState === 'error'"
        class="ei-image-source-editor__placeholder ei-image-source-editor__placeholder--error"
        :title="previewFailedTitle"
        :aria-label="previewFailedTitle"
      >
        <EiIcon :icon="IconCircleAlert" :size="16" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-image-source-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  &__label {
    font-size: 12px;
    color: var(--ei-text-secondary, #666);
  }

  &__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 28px auto;
    align-items: center;
    min-width: 0;
    border: 1px solid var(--ei-border-color, #d0d0d0);
    border-radius: 4px;
    background: var(--ei-input-bg, #fff);
    overflow: hidden;

    &:focus-within {
      border-color: var(--ei-primary, #1890ff);
    }
  }

  &__input {
    height: 28px;
    padding: 4px 8px;
    border: none;
    font-size: 13px;
    outline: none;
    background: transparent;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__button {
    position: relative;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-left: 1px solid var(--ei-border-color, #d0d0d0);
    background: transparent;
    color: var(--ei-text-secondary, #666);
    cursor: pointer;
    padding: 0;

    &:hover:not(:disabled) {
      background: var(--ei-hover-bg, #f3f4f6);
      color: var(--ei-primary, #1890ff);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__preview {
    position: relative;
    width: 72px;
    height: 44px;
    border: 1px solid var(--ei-border-color, #d0d0d0);
    border-radius: 4px;
    background: var(--ei-surface-muted, #fafafa);
    overflow: hidden;
    box-sizing: border-box;
  }

  &__image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  &__placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ei-text-tertiary, #999);
    background: var(--ei-surface-muted, #fafafa);

    &--error {
      color: var(--ei-danger, #d92d20);
    }
  }
}
</style>
