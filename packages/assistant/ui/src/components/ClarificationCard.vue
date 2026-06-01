<script setup lang="ts">
import type { AssistantTranslate } from '../i18n'
import type { ClarificationQuestion } from '../projection'
import { translateAssistant } from '../i18n'

const props = defineProps<{ questions: ClarificationQuestion[], t?: AssistantTranslate }>()
defineEmits<{ answer: [value: string] }>()

function tr(key: string): string {
  return translateAssistant(key, props.t)
}
</script>

<template>
  <article class="assistant-card assistant-clarification-card">
    <strong>{{ tr('designer.assistant.card.clarificationTitle') }}</strong>
    <div v-for="question in questions" :key="question.text" class="assistant-clarification-card__question">
      <p>{{ question.text }}</p>
      <div class="assistant-clarification-card__answers">
        <button
          v-for="answer in question.suggestions"
          :key="answer"
          type="button"
          class="assistant-chip"
          @click="$emit('answer', answer)"
        >
          {{ answer }}
        </button>
      </div>
    </div>
  </article>
</template>
