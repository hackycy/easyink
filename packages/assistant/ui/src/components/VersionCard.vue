<script setup lang="ts">
import type { AssistantVersionRecord } from '@easyink/assistant-store'

defineProps<{ versions: AssistantVersionRecord[] }>()
defineEmits<{
  rollback: []
  export: []
}>()
</script>

<template>
  <article class="assistant-card assistant-version-card">
    <header class="assistant-card__head">
      <div>
        <strong>版本记录</strong>
        <p class="assistant-muted">
          {{ versions.length }} 条记录，可用于回滚或导出复现。
        </p>
      </div>
      <button type="button" class="assistant-link" @click="$emit('export')">
        导出
      </button>
    </header>
    <ul class="assistant-version-card__list">
      <li v-for="version in versions.slice(0, 4)" :key="version.id">
        {{ version.label ?? version.action }}
      </li>
    </ul>
    <button type="button" class="assistant-btn" :disabled="!versions.length" @click="$emit('rollback')">
      回到应用前
    </button>
  </article>
</template>
