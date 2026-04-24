<script setup lang="ts">
import type { BorderSides } from './border-types'

const props = defineProps<{
  modelValue?: BorderSides
  label?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BorderSides]
  'commit': [value: BorderSides]
}>()

const SIDES = ['top', 'right', 'bottom', 'left'] as const

function isActive(side: typeof SIDES[number]): boolean {
  return props.modelValue?.[side] !== false
}

function toggle(side: typeof SIDES[number]) {
  if (props.disabled)
    return
  const current = isActive(side)
  const val = {
    ...props.modelValue,
    [side]: !current,
  }
  emit('update:modelValue', val)
  emit('commit', val)
}
</script>

<template>
  <div class="ei-border-toggle" :class="{ 'ei-border-toggle--disabled': disabled }">
    <span v-if="label" class="ei-border-toggle__label">{{ label }}</span>
    <div class="ei-border-toggle__sides">
      <button
        v-for="side in SIDES"
        :key="side"
        type="button"
        class="ei-border-toggle__btn"
        :class="{ 'ei-border-toggle__btn--active': isActive(side) }"
        :disabled="disabled"
        :title="side"
        @click="toggle(side)"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- Faint rect outline for context -->
          <rect
            x="2" y="2" width="14" height="14"
            stroke="var(--ei-border-color, #d0d0d0)"
            stroke-width="1"
            fill="none"
          />
          <!-- Highlighted side -->
          <line
            v-if="side === 'top'"
            x1="2" y1="2" x2="16" y2="2"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          />
          <line
            v-if="side === 'right'"
            x1="16" y1="2" x2="16" y2="16"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          />
          <line
            v-if="side === 'bottom'"
            x1="2" y1="16" x2="16" y2="16"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          />
          <line
            v-if="side === 'left'"
            x1="2" y1="2" x2="2" y2="16"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ei-border-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
}

.ei-border-toggle--disabled {
  opacity: 0.5;
  pointer-events: none;
}

.ei-border-toggle__label {
  user-select: none;
  flex-shrink: 0;
}

.ei-border-toggle__sides {
  display: flex;
  gap: 2px;
}

.ei-border-toggle__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 3px;
  background: var(--ei-input-bg, #fff);
  color: var(--ei-border-color, #d0d0d0);
  cursor: pointer;
  padding: 0;
  transition: color 0.15s, border-color 0.15s;
}

.ei-border-toggle__btn:hover {
  border-color: var(--ei-primary, #1890ff);
}

.ei-border-toggle__btn--active {
  color: var(--ei-primary, #1890ff);
  border-color: var(--ei-primary, #1890ff);
  background: color-mix(in srgb, var(--ei-primary, #1890ff) 8%, transparent);
}

.ei-border-toggle__btn:disabled {
  cursor: not-allowed;
}
</style>
