<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  size?: number
  strokeWidth?: number
}>()
</script>

<template>
  <component
    :is="icon"
    :size="size ?? 16"
    :stroke-width="strokeWidth ?? 1.5"
  />
</template>
