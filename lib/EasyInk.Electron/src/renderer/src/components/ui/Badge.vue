<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'

const props = withDefaults(
  defineProps<{
    tone?: 'neutral' | 'good' | 'warn' | 'bad'
  }>(),
  {
    tone: 'neutral'
  }
)

const classes = computed(() => cn('ui-badge', `ui-badge--${props.tone}`))
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
