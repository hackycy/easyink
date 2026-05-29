<script setup lang="ts">
import type { AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import { computed, ref } from 'vue'

const props = defineProps<{ result: AssistantResult }>()
defineEmits<{
  applyPatch: [operations: AssistantPatchOperation[]]
  applySelectedPatch: [operations: AssistantPatchOperation[]]
}>()

const expanded = ref(false)
const addOperations = computed(() => props.result.patch.filter(operation => operation.op === 'add'))
</script>

<template>
  <article class="assistant-card assistant-diff-card">
    <header class="assistant-card__head">
      <strong>变更预览</strong>
      <button type="button" class="assistant-link" @click="expanded = !expanded">
        {{ expanded ? '收起' : 'JSON Patch' }}
      </button>
    </header>
    <ul class="assistant-diff-card__summary">
      <li v-for="item in result.diff.summary" :key="item">
        {{ item }}
      </li>
    </ul>
    <div class="assistant-diff-card__actions">
      <button type="button" class="assistant-btn" :disabled="!addOperations.length" @click="$emit('applyPatch', addOperations)">
        只应用新增元素
      </button>
      <button type="button" class="assistant-btn" :disabled="!result.patch.length" @click="$emit('applySelectedPatch', result.patch)">
        只应用选中元素
      </button>
    </div>
    <pre v-if="expanded">{{ JSON.stringify(result.patch, null, 2) }}</pre>
  </article>
</template>
