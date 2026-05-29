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
    <div>
      <strong>{{ title }}</strong>
      <p>{{ detail }}</p>
      <ul v-if="fields?.length">
        <li v-for="field in fields.slice(0, 8)" :key="field">
          {{ field }}
        </li>
      </ul>
      <p v-if="warnings?.length">
        {{ warnings[0] }}
      </p>
    </div>
    <button type="button" @click="$emit('remove')">
      删除
    </button>
  </article>
</template>
