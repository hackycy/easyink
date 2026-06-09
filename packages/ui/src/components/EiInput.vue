<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue?: string | number
  type?: 'text' | 'number'
  placeholder?: string
  disabled?: boolean
  label?: string
  minLength?: number
  maxLength?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'commit': [value: string | number]
}>()

const snapshotValue = ref<string | number | undefined>()
const isComposing = ref(false)

function onFocus() {
  snapshotValue.value = props.modelValue
}

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (isComposing.value)
    return
  updateValue(input)
}

function onCompositionStart() {
  isComposing.value = true
}

function onCompositionEnd(event: Event) {
  isComposing.value = false
  const input = event.target as HTMLInputElement
  updateValue(input)
}

function updateValue(input: HTMLInputElement) {
  const next = constrainText(input.value)
  if (next !== input.value)
    input.value = next
  emit('update:modelValue', next)
}

function onCommit(event: Event) {
  const input = event.target as HTMLInputElement
  const current = constrainText(input.value)
  if (current !== input.value)
    input.value = current
  if (current !== snapshotValue.value) {
    emit('commit', current)
  }
  snapshotValue.value = current
}

function constrainText(value: string): string {
  if (props.type === 'number')
    return value
  const max = props.maxLength
  const chars = splitCharacters(value)
  if (typeof max === 'number' && Number.isFinite(max) && max >= 0 && chars.length > max)
    return chars.slice(0, max).join('')
  return value
}

function splitCharacters(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
      part => part.segment,
    )
  }
  return Array.from(value)
}
</script>

<template>
  <div class="ei-input-wrapper">
    <label v-if="label" class="ei-input__label">{{ label }}</label>
    <input
      class="ei-input"
      :type="type ?? 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :minlength="minLength"
      @focus="onFocus"
      @input="onInput"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @blur="onCommit"
      @keydown.enter="onCommit"
    >
  </div>
</template>

<style scoped lang="scss">
.ei-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ei-input {
  padding: 4px 8px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  background: var(--ei-input-bg, #fff);
  color: var(--ei-text, #333);
  min-width: 0;
  width: 100%;
  box-sizing: border-box;

  &__label {
    font-size: 12px;
    color: var(--ei-text-secondary, #666);
  }

  &:focus {
    border-color: var(--ei-primary, #1890ff);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
