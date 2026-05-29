<script setup lang="ts">
import type { AssistantResult } from '@easyink/assistant-capabilities'

defineProps<{
  result: AssistantResult
  applying?: boolean
}>()

defineEmits<{
  apply: [result: AssistantResult]
  applyDataSource: [dataSource: NonNullable<AssistantResult['dataSource']>]
}>()
</script>

<template>
  <article class="assistant-card assistant-result-card">
    <header class="assistant-card__head">
      <div class="assistant-result-card__title">
        <strong>{{ result.preview.title }}</strong>
        <span class="assistant-muted">{{ result.preview.page.width }} × {{ result.preview.page.height }} {{ result.preview.page.unit }}</span>
      </div>
      <span class="assistant-badge" :class="result.validation.valid ? 'assistant-badge--ok' : 'assistant-badge--warn'">
        {{ result.validation.valid ? '校验通过' : '需修复' }}
      </span>
    </header>
    <dl>
      <div>
        <dt>元素</dt>
        <dd>{{ result.preview.elementCount }}</dd>
      </div>
      <div>
        <dt>字段</dt>
        <dd>{{ result.preview.dataFieldCount }}</dd>
      </div>
      <div>
        <dt>变更</dt>
        <dd>{{ result.diff.operations.length }}</dd>
      </div>
    </dl>
    <div class="assistant-result-card__actions">
      <button type="button" class="assistant-btn assistant-btn--primary" :disabled="applying" @click="$emit('apply', result)">
        应用到设计器
      </button>
      <button v-if="result.dataSource" type="button" class="assistant-btn" :disabled="applying" @click="$emit('applyDataSource', result.dataSource)">
        只应用数据源
      </button>
    </div>
  </article>
</template>
