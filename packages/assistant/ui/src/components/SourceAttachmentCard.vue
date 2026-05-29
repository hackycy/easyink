<script setup lang="ts">
import type { AssistantSourceInput } from '@easyink/assistant-capabilities'

defineProps<{
  source: AssistantSourceInput
  title: string
  detail: string
  fields?: string[]
  warnings?: string[]
}>()

defineEmits<{ remove: [] }>()
</script>

<template>
  <article class="assistant-card assistant-source-card">
    <div class="assistant-source-card__body">
      <strong>{{ title }}</strong>
      <p class="assistant-muted">
        {{ detail }}
      </p>
      <ul v-if="fields?.length" class="assistant-source-card__fields">
        <li v-for="field in fields.slice(0, 8)" :key="field">
          {{ field }}
        </li>
      </ul>
      <p v-if="warnings?.length" class="assistant-source-card__warning">
        {{ warnings[0] }}
      </p>
    </div>
    <button type="button" class="assistant-link" @click="$emit('remove')">
      删除
    </button>
  </article>
</template>
