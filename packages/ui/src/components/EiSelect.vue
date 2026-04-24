<script setup lang="ts">
defineProps<{
  modelValue?: string | number
  options: Array<{ label: string, value: string | number }>
  placeholder?: string
  disabled?: boolean
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'commit': [value: string | number]
}>()

function onChange(event: Event) {
  const val = (event.target as HTMLSelectElement).value
  emit('update:modelValue', val)
  emit('commit', val)
}
</script>

<template>
  <div class="ei-select-wrapper">
    <label v-if="label" class="ei-select__label">{{ label }}</label>
    <select
      class="ei-select"
      :value="modelValue"
      :disabled="disabled"
      @change="onChange"
    >
      <option v-if="placeholder" value="" disabled>
        {{ placeholder }}
      </option>
      <option
        v-for="opt in options"
        :key="String(opt.value)"
        :value="opt.value"
      >
        {{ opt.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.ei-select-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ei-select__label {
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
}

.ei-select {
  padding: 4px 4px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  background: var(--ei-input-bg, #fff);
  color: var(--ei-text, #333);
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.ei-select:focus {
  border-color: var(--ei-primary, #1890ff);
}

.ei-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
