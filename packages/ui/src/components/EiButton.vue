<script setup lang="ts">
defineProps<{
  disabled?: boolean
  variant?: 'default' | 'primary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}>()

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="ei-button"
    :class="[
      `ei-button--${variant ?? 'default'}`,
      `ei-button--${size ?? 'md'}`,
    ]"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped lang="scss">
.ei-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  background: var(--ei-bg, #fff);
  color: var(--ei-text, #333);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  transition: background 0.15s, border-color 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--ei-primary, #1890ff);
    color: var(--ei-primary, #1890ff);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--primary {
    background: var(--ei-primary, #1890ff);
    border-color: var(--ei-primary, #1890ff);
    color: #fff;

    &:hover:not(:disabled) {
      background: var(--ei-primary-hover, #40a9ff);
      border-color: var(--ei-primary-hover, #40a9ff);
      color: #fff;
    }
  }

  &--ghost {
    background: transparent;
    border-color: transparent;

    &:hover:not(:disabled) {
      background: var(--ei-hover-bg, #f0f0f0);
      border-color: transparent;
    }
  }

  &--sm {
    padding: 2px 8px;
    font-size: 12px;
  }

  &--md {
    padding: 4px 12px;
  }

  &--lg {
    padding: 8px 16px;
    font-size: 16px;
  }
}
</style>
