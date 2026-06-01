<script setup lang="ts">
import type { AssistantTranslate } from '../i18n'
import { translateAssistant } from '../i18n'

const props = defineProps<{
  applying?: boolean
  t?: AssistantTranslate
}>()

defineEmits<{
  apply: []
}>()

function tr(key: string): string {
  return translateAssistant(key, props.t)
}
</script>

<template>
  <article class="assistant-card assistant-done-card">
    <div class="assistant-done-card__head">
      <span class="assistant-done-card__badge" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="15" height="15">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <div>
        <strong>{{ tr('designer.assistant.card.doneTitle') }}</strong>
        <p class="assistant-muted">
          {{ tr('designer.assistant.card.doneDescription') }}
        </p>
      </div>
    </div>
    <div class="assistant-done-card__actions">
      <button type="button" class="assistant-btn assistant-btn--primary" :disabled="applying" @click="$emit('apply')">
        {{ tr('designer.assistant.action.apply') }}
      </button>
    </div>
  </article>
</template>

<style scoped lang="scss">
.assistant-done-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assistant-done-card__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.assistant-done-card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: rgb(22 163 74 / 12%);
  color: #15803d;
}

.assistant-done-card__head strong {
  font-size: 14px;
  font-weight: 600;
}

.assistant-done-card__actions {
  display: flex;
  gap: 8px;
}
</style>
