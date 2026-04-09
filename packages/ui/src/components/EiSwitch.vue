<script setup lang="ts">
defineProps<{
  modelValue?: boolean
  label?: string
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <label class="ei-switch" :class="{ 'ei-switch--disabled': disabled }">
    <span v-if="label" class="ei-switch__label">{{ label }}</span>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue ?? false"
      class="ei-switch__track"
      :class="{ 'ei-switch__track--on': modelValue }"
      :disabled="disabled"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span class="ei-switch__thumb" />
    </button>
  </label>
</template>

<style scoped>
.ei-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  cursor: pointer;
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
}

.ei-switch--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ei-switch__track {
  position: relative;
  width: 32px;
  height: 18px;
  border-radius: 9px;
  border: none;
  padding: 0;
  background: var(--ei-border-color, #d0d0d0);
  cursor: inherit;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.ei-switch__track--on {
  background: var(--ei-primary, #1890ff);
}

.ei-switch__track:disabled {
  cursor: not-allowed;
}

.ei-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}

.ei-switch__track--on .ei-switch__thumb {
  transform: translateX(14px);
}

.ei-switch__label {
  user-select: none;
}
</style>
