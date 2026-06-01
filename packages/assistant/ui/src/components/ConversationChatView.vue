<script setup lang="ts">
import type { AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantDerivedStatus } from '../composables/useConversationPresentation'
import type { AssistantTranslate } from '../i18n'
import type { ChecklistItem, ClarificationQuestion } from '../projection'
import { translateAssistant } from '../i18n'
import AssistantMessage from './AssistantMessage.vue'
import ClarificationCard from './ClarificationCard.vue'
import ErrorCard from './ErrorCard.vue'
import ReviewResultCard from './ReviewResultCard.vue'
import RunningProgressCard from './RunningProgressCard.vue'
import UserMessage from './UserMessage.vue'

const props = defineProps<{
  activeChecklistItem?: ChecklistItem
  applied?: boolean
  applying?: boolean
  checklist: ChecklistItem[]
  clarification?: ClarificationQuestion[]
  derivedStatus: AssistantDerivedStatus
  errorText?: string
  latestThinkingLine?: string
  loadingSession?: boolean
  prompt?: string
  result?: AssistantResult
  running?: boolean
  runningMood: string
  runningPercent: number
  runningSignals: string[]
  showChecklist: boolean
  showSummary?: boolean
  summary: string[]
  supportingNarration?: string
  t?: AssistantTranslate
}>()

const emit = defineEmits<{
  apply: [result: AssistantResult]
  clarify: [answer: string]
  retry: []
}>()

function tr(key: string): string {
  return translateAssistant(key, props.t)
}
</script>

<template>
  <main class="assistant-stream">
    <AssistantMessage
      v-if="loadingSession"
      :text="tr('designer.assistant.message.restoring')"
    />
    <AssistantMessage
      v-else-if="derivedStatus === 'idle'"
      :text="tr('designer.assistant.message.welcome')"
    />
    <UserMessage v-if="prompt" :text="prompt" />

    <p v-if="supportingNarration" class="assistant-answer">
      {{ supportingNarration }}
    </p>

    <RunningProgressCard
      v-if="running"
      :active-item="activeChecklistItem"
      :checklist="checklist"
      :latest-thinking-line="latestThinkingLine"
      :mood="runningMood"
      :percent="runningPercent"
      :signals="runningSignals"
      :show-checklist="showChecklist"
      :t="t"
    />

    <details v-if="showSummary" class="assistant-summary">
      <summary>{{ tr('designer.assistant.card.summary') }}</summary>
      <ul>
        <li v-for="(line, index) in summary" :key="index">
          {{ line }}
        </li>
      </ul>
    </details>

    <ClarificationCard
      v-if="clarification"
      :questions="clarification"
      :t="t"
      @answer="emit('clarify', $event)"
    />

    <ReviewResultCard
      v-if="derivedStatus === 'review' && result"
      :applying="applying"
      :t="t"
      @apply="emit('apply', result)"
    />

    <p v-if="applied" class="assistant-answer assistant-answer--muted">
      {{ tr('designer.assistant.message.applied') }}
    </p>

    <p v-if="derivedStatus === 'cancelled'" class="assistant-answer assistant-answer--muted">
      {{ tr('designer.assistant.message.cancelled') }}
    </p>

    <ErrorCard
      v-if="errorText && derivedStatus === 'failed'"
      :text="errorText"
      :t="t"
      @retry="emit('retry')"
    />
  </main>
</template>

<style scoped lang="scss">
.assistant-stream {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 18px;
  overflow: auto;
  padding: 28px 24px;
  background: linear-gradient(180deg, var(--assistant-bg), var(--assistant-surface));
  scroll-behavior: smooth;
}

.assistant-answer {
  align-self: flex-start;
  max-width: 92%;
  margin: 0;
  color: var(--assistant-text);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.assistant-answer--muted {
  color: var(--assistant-muted);
}

.assistant-summary {
  align-self: stretch;
  color: var(--assistant-muted);
  font-size: 12px;

  summary {
    color: var(--assistant-text);
    cursor: pointer;
    font-weight: 600;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 8px 0 0;
    padding-left: 18px;
  }
}
</style>
