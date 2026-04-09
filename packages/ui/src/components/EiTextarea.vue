<script setup lang="ts">
defineProps<{
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  label?: string
  rows?: number
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="ei-textarea-wrapper">
    <label v-if="label" class="ei-textarea__label">{{ label }}</label>
    <textarea
      class="ei-textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="rows ?? 3"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>

<style scoped>
.ei-textarea-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ei-textarea__label {
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
}

.ei-textarea {
  padding: 4px 8px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  background: var(--ei-input-bg, #fff);
  color: var(--ei-text, #333);
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  line-height: 1.4;
}

.ei-textarea:focus {
  border-color: var(--ei-primary, #1890ff);
}

.ei-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
