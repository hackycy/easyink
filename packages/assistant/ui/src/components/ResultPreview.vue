<script setup lang="ts">
import type { AssistantResult } from '@easyink/assistant-capabilities'
import { IconCheck, IconFileText } from '@easyink/icons'

defineProps<{
  result?: AssistantResult
}>()
</script>

<template>
  <section class="assistant-section assistant-preview">
    <div class="assistant-section__head">
      <h3>预览</h3>
      <IconCheck v-if="result?.validation.valid" :size="16" />
    </div>
    <div v-if="result" class="assistant-preview__grid">
      <IconFileText :size="18" />
      <span>{{ result.preview.page.width }} x {{ result.preview.page.height }} {{ result.preview.page.unit }}</span>
      <span>{{ result.preview.elementCount }} elements</span>
      <span>{{ result.preview.dataFieldCount }} fields</span>
    </div>
    <p v-else class="assistant-muted">
      等待结果
    </p>
  </section>
</template>
