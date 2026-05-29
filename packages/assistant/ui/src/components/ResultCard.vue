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
    <div class="assistant-card__head">
      <div>
        <strong>{{ result.preview.title }}</strong>
        <p>{{ result.preview.page.width }} x {{ result.preview.page.height }} {{ result.preview.page.unit }}</p>
      </div>
      <span :class="result.validation.valid ? 'ok' : 'warn'">
        {{ result.validation.valid ? '校验通过' : '需修复' }}
      </span>
    </div>
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
      <button type="button" :disabled="applying" @click="$emit('apply', result)">
        应用到设计器
      </button>
      <button v-if="result.dataSource" type="button" :disabled="applying" @click="$emit('applyDataSource', result.dataSource)">
        只应用数据源
      </button>
    </div>
  </article>
</template>
