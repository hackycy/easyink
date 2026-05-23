<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'icon'
    disabled?: boolean
  }>(),
  {
    variant: 'default',
    size: 'md',
    disabled: false
  }
)

const classes = computed(() =>
  cn('ui-button', `ui-button--${props.variant}`, `ui-button--${props.size}`)
)
</script>

<template>
  <button :class="classes" :disabled="disabled">
    <slot />
  </button>
</template>
