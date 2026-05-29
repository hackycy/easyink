<script setup lang="ts">
import type { ClarificationQuestion } from '../projection'

defineProps<{ questions: ClarificationQuestion[] }>()
defineEmits<{ answer: [value: string] }>()
</script>

<template>
  <article class="assistant-card assistant-clarification-card">
    <strong>需要确认一下</strong>
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
