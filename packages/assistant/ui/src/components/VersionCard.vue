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
    <div class="assistant-card__head">
      <div>
        <strong>版本记录</strong>
        <p>{{ versions.length }} 条记录，可用于回滚或导出复现。</p>
      </div>
      <button type="button" @click="$emit('export')">
        导出
      </button>
    </div>
    <ul>
      <li v-for="version in versions.slice(0, 4)" :key="version.id">
        {{ version.label ?? version.action }}
      </li>
    </ul>
    <button type="button" :disabled="!versions.length" @click="$emit('rollback')">
      回到应用前
    </button>
  </article>
</template>
