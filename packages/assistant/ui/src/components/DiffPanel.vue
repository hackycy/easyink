<script setup lang="ts">
import type { AssistantResult } from '@easyink/assistant-capabilities'

defineProps<{
  result?: AssistantResult
}>()
</script>

<template>
  <section class="assistant-section assistant-diff">
    <div class="assistant-section__head">
      <h3>差异</h3>
    </div>
    <ul v-if="result">
      <li v-for="item in result.diff.summary" :key="item">
        {{ item }}
      </li>
    </ul>
    <p v-else class="assistant-muted">
      暂无差异
    </p>
  </section>
</template>
