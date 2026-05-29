<script setup lang="ts">
import type { AssistantResult } from '@easyink/assistant-capabilities'

defineProps<{ result: AssistantResult }>()
defineEmits<{ repair: [] }>()
</script>

<template>
  <article class="assistant-card assistant-repair-card">
    <strong>建议修复</strong>
    <p v-if="result.validation.errors.length" class="assistant-muted">
      {{ result.validation.errors[0]?.message }}
    </p>
    <p v-else class="assistant-muted">
      校验报告提示存在可修复问题。
    </p>
    <button type="button" class="assistant-btn assistant-btn--primary" @click="$emit('repair')">
      修复并重新校验
    </button>
  </article>
</template>
