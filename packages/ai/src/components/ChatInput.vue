<script setup lang="ts">
import { IconClose, IconSend } from '@easyink/icons'
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
  isGenerating?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'submit': []
  'cancel': []
}>()

const textareaRef = ref<HTMLTextAreaElement>()

const value = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})

function autoresize() {
  const el = textareaRef.value
  if (!el)
    return
  el.style.height = 'auto'
  // Cap at ~6 lines (line-height ~20px + padding 16px = ~136px).
  const next = Math.min(el.scrollHeight, 136)
  el.style.height = `${next}px`
}

watch(() => props.modelValue, () => {
  void nextTick(autoresize)
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    // IME composition still uses isComposing; explicit guard above.
    e.preventDefault()
    if (!props.disabled && !props.isGenerating)
      emit('submit')
  }
}

function handleClick() {
  if (props.isGenerating) {
    emit('cancel')
    return
  }
  if (!props.disabled)
    emit('submit')
}

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<template>
  <div class="ai-input">
    <textarea
      ref="textareaRef"
      v-model="value"
      class="ai-input__textarea"
      :placeholder="placeholder ?? '描述你想要的模板，Enter 发送 / Shift+Enter 换行'"
      rows="1"
      :disabled="disabled && !isGenerating"
      @input="autoresize"
      @keydown="handleKeydown"
    />
    <button
      class="ai-input__btn"
      :class="isGenerating ? 'ai-input__btn--cancel' : 'ai-input__btn--send'"
      :disabled="!isGenerating && (disabled || !value.trim())"
      :title="isGenerating ? '停止生成' : 'Enter 发送'"
      @click="handleClick"
    >
      <IconClose v-if="isGenerating" :size="16" />
      <IconSend v-else :size="16" />
    </button>
  </div>
</template>

<style scoped>
.ai-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--ei-border, #d1d5db);
  border-radius: 12px;
  background: var(--ei-bg, #fff);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.ai-input:focus-within {
  border-color: var(--ei-primary, #4f46e5);
  box-shadow: 0 0 0 3px var(--ei-primary-light, rgba(79, 70, 229, 0.1));
}

.ai-input__textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  background: transparent;
  color: var(--ei-text, #111827);
  max-height: 136px;
  min-height: 20px;
  padding: 0;
}

.ai-input__textarea::placeholder {
  color: var(--ei-text-quaternary, #9ca3af);
}

.ai-input__textarea:disabled {
  cursor: not-allowed;
  color: var(--ei-text-secondary, #6b7280);
}

.ai-input__btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  transition: background 0.15s;
}

.ai-input__btn--send {
  background: var(--ei-primary, #4f46e5);
}

.ai-input__btn--send:hover:not(:disabled) {
  background: var(--ei-primary-hover, #4338ca);
}

.ai-input__btn--send:disabled {
  background: var(--ei-bg-tertiary, #e5e7eb);
  color: var(--ei-text-quaternary, #9ca3af);
  cursor: not-allowed;
}

.ai-input__btn--cancel {
  background: var(--ei-danger, #dc2626);
}

.ai-input__btn--cancel:hover {
  background: #b91c1c;
}
</style>
