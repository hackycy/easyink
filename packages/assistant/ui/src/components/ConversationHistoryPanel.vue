<script setup lang="ts">
import type { AssistantConversationRecord } from '@easyink/assistant-store'
import type { AssistantTranslate } from '../i18n'
import { computed } from 'vue'
import { translateAssistant } from '../i18n'
import { conversationStatusLabel, formatConversationTime } from '../utils/conversation'

const props = defineProps<{
  conversations: AssistantConversationRecord[]
  activeConversationId?: string
  t?: AssistantTranslate
}>()

defineEmits<{
  select: [id: string]
}>()

const hasHistory = computed(() => props.conversations.length > 0)

function tr(key: string): string {
  return translateAssistant(key, props.t)
}
</script>

<template>
  <main class="assistant-history-panel" :aria-label="tr('designer.assistant.history.title')">
    <header class="assistant-history-panel__head">
      <div>
        <strong>{{ tr('designer.assistant.history.title') }}</strong>
        <span>{{ conversations.length }}</span>
      </div>
    </header>
    <p v-if="!hasHistory" class="assistant-history__empty">
      {{ tr('designer.assistant.history.empty') }}
    </p>
    <div v-else class="assistant-history__list">
      <button
        v-for="conversation in conversations"
        :key="conversation.id"
        type="button"
        class="assistant-history__item"
        :class="{ 'assistant-history__item--active': conversation.id === activeConversationId }"
        @click="$emit('select', conversation.id)"
      >
        <span class="assistant-history__marker" aria-hidden="true" />
        <span class="assistant-history__body">
          <span class="assistant-history__title">{{ conversation.title ?? tr('designer.assistant.history.untitled') }}</span>
          <span class="assistant-history__meta">
            {{ conversationStatusLabel(conversation.status, tr) }} · {{ formatConversationTime(conversation.updatedAt) }}
          </span>
        </span>
      </button>
    </div>
  </main>
</template>

<style scoped lang="scss">
.assistant-history-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  padding: 22px 24px 18px;
  background: var(--assistant-bg);
}

.assistant-history-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--assistant-muted);
  font-size: 12px;

  > div {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  strong {
    color: var(--assistant-text);
    font-size: 14px;
    font-weight: 600;
  }

  span {
    display: inline-flex;
    min-width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--assistant-surface);
    color: var(--assistant-muted);
    font-size: 11px;
    font-weight: 600;
  }
}

.assistant-history__empty {
  margin: 0;
  padding: 16px 2px;
  color: var(--assistant-muted);
  font-size: 12px;
  line-height: 1.6;
}

.assistant-history__list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: auto;
  padding: 0;
}

.assistant-history__item {
  position: relative;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  width: 100%;
  min-height: 56px;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--assistant-text);
  cursor: pointer;
  padding: 9px 10px 9px 6px;
  text-align: left;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--assistant-surface) 72%, transparent);
  }
}

.assistant-history__item--active {
  background: color-mix(in srgb, var(--assistant-surface) 86%, var(--assistant-bg));
  color: var(--assistant-text);
}

.assistant-history__marker {
  width: 6px;
  height: 22px;
  justify-self: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--assistant-muted) 28%, transparent);
}

.assistant-history__item--active .assistant-history__marker {
  background: var(--assistant-text);
}

.assistant-history__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.assistant-history__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.assistant-history__meta {
  color: var(--assistant-muted);
  font-size: 12px;
}
</style>
