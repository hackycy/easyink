<script setup lang="ts">
import type { AssistantTranslate } from '../i18n'
import { translateAssistant } from '../i18n'

const props = defineProps<{ text: string, t?: AssistantTranslate }>()
defineEmits<{ retry: [] }>()

function tr(key: string): string {
  return translateAssistant(key, props.t)
}
</script>

<template>
  <article class="assistant-card assistant-card--danger">
    <strong>{{ tr('designer.assistant.card.errorTitle') }}</strong>
    <p class="assistant-muted">
      {{ text }}
    </p>
    <button type="button" class="assistant-btn" @click="$emit('retry')">
      {{ tr('designer.assistant.action.retry') }}
    </button>
  </article>
</template>
