<script setup lang="ts">
import type { DesignerImagePickRequest, DesignerImagePickResult } from '../types'
import { IconCircleAlert, IconClose, IconImage, IconLoader } from '@easyink/icons'
import { EiIcon } from '@easyink/ui'
import { computed, nextTick, ref, watch } from 'vue'
import { useDesignerStore } from '../composables'
import { readImageFileAsDataUrl } from '../interactions/image-picker-fallback'

const props = defineProps<{
  label: string
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  pickRequest: DesignerImagePickRequest
  t: (key: string) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'commit': [value: string]
  'pick': [result: DesignerImagePickResult]
}>()

let nativeInputIdSeed = 0

const store = useDesignerStore()
const snapshotValue = ref<string | undefined>()
const pending = ref(false)
const pickButtonRef = ref<HTMLElement | null>(null)
const previewState = ref<'idle' | 'loading' | 'loaded' | 'error'>('idle')
const nativeInputId = `ei-image-source-picker-${++nativeInputIdSeed}`

const value = computed(() => props.modelValue ?? '')
const hasValue = computed(() => value.value.trim().length > 0)
const pickTitle = computed(() => props.t('designer.action.pickImage'))
const clearTitle = computed(() => props.t('designer.action.clearImage'))
const previewTitle = computed(() => props.t('designer.action.imagePreview'))
const useNativeFallback = computed(() => !store.interactions.hasHostImagePicker())
const acceptAttr = computed(() => (props.pickRequest.accept?.length ? props.pickRequest.accept : ['image/*']).join(','))

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

function commitPickedResult(result: DesignerImagePickResult) {
  updateValue(result.src)
  emit('pick', result)
  snapshotValue.value = result.src
}

async function pickImage() {
  if (pending.value || props.disabled)
    return

  pending.value = true
  try {
    const result = await store.interactions.pickImage({
      ...props.pickRequest,
      currentSrc: value.value,
    })
    if (!result)
      return
    if (typeof result.src !== 'string' || !result.src.trim()) {
      store.diagnostics.push({
        source: 'designer-interaction',
        severity: 'warn',
        message: 'Image picker returned an empty image source.',
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
      message: 'Image picker failed.',
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

async function onNativeFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file)
    return

  if (file.type && !file.type.toLowerCase().startsWith('image/')) {
    store.diagnostics.push({
      source: 'designer-interaction',
      severity: 'warn',
      message: 'Selected file type is not supported by this image field.',
      detail: { requestId: props.pickRequest.id, fileName: file.name, fileType: file.type },
    })
    return
  }

  pending.value = true
  try {
    commitPickedResult(await readImageFileAsDataUrl(file))
  }
  catch (error) {
    store.diagnostics.push({
      source: 'designer-interaction',
      severity: 'error',
      message: 'Failed to read selected image file.',
      detail: {
        requestId: props.pickRequest.id,
        fileName: file.name,
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

function preventNativeOpenWhenDisabled(event: MouseEvent | KeyboardEvent) {
  if (!props.disabled && !pending.value)
    return
  event.preventDefault()
}

function openNativeInputFromKeyboard(event: KeyboardEvent) {
  if (props.disabled || pending.value) {
    event.preventDefault()
    return
  }
  event.preventDefault()
  document.getElementById(nativeInputId)?.click()
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
        v-if="!useNativeFallback"
        ref="pickButtonRef"
        class="ei-image-source-editor__button"
        type="button"
        :title="pickTitle"
        :aria-label="pickTitle"
        :disabled="disabled || pending"
        @pointerdown.stop
        @click.stop="pickImage"
      >
        <EiIcon :icon="pending ? IconLoader : IconImage" :size="15" />
      </button>
      <input
        v-else
        :id="nativeInputId"
        class="ei-image-source-editor__file"
        type="file"
        :accept="acceptAttr"
        :disabled="disabled || pending"
        @change="onNativeFileChange"
      >
      <label
        v-if="useNativeFallback"
        ref="pickButtonRef"
        class="ei-image-source-editor__button"
        :class="{ 'ei-image-source-editor__button--disabled': disabled || pending }"
        :for="nativeInputId"
        role="button"
        tabindex="0"
        :title="pickTitle"
        :aria-label="pickTitle"
        :aria-disabled="disabled || pending"
        @pointerdown.stop
        @click.stop="preventNativeOpenWhenDisabled"
        @keydown.enter.stop="openNativeInputFromKeyboard"
        @keydown.space.stop="openNativeInputFromKeyboard"
      >
        <EiIcon :icon="pending ? IconLoader : IconImage" :size="15" />
      </label>
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
      <div v-if="previewState === 'loading'" class="ei-image-source-editor__placeholder">
        <EiIcon :icon="IconLoader" :size="16" />
      </div>
      <div v-else-if="previewState === 'error'" class="ei-image-source-editor__placeholder ei-image-source-editor__placeholder--error">
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
    color: var(--ei-text, #333);
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
      pointer-events: none;
    }
  }

  &__file {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
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
