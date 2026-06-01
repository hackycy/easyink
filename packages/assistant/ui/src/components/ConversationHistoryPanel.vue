<script setup lang="ts">
import type { AssistantConversationRecord } from '@easyink/assistant-store'
import type { AssistantTranslate } from '../i18n'
import { IconCheck, IconDelete } from '@easyink/icons'
import { computed, ref } from 'vue'
import { translateAssistant } from '../i18n'
import { conversationStatusLabel, formatConversationTime } from '../utils/conversation'

const props = defineProps<{
  conversations: AssistantConversationRecord[]
  activeConversationId?: string
  t?: AssistantTranslate
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
}>()

const hasHistory = computed(() => props.conversations.length > 0)
const pendingDeleteId = ref<string>()

function handleDeleteClick(id: string, emitDelete: (id: string) => void) {
  if (pendingDeleteId.value === id) {
    pendingDeleteId.value = undefined
    emitDelete(id)
    return
  }
  pendingDeleteId.value = id
}

function handleSelect(id: string, emitSelect: (id: string) => void) {
  pendingDeleteId.value = undefined
  emitSelect(id)
}

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
      <div
        v-for="conversation in conversations"
        :key="conversation.id"
        class="assistant-history__item"
        :class="{
          'assistant-history__item--active': conversation.id === activeConversationId,
          'assistant-history__item--confirming': conversation.id === pendingDeleteId,
        }"
      >
        <button
          type="button"
          class="assistant-history__select"
          @click="handleSelect(conversation.id, id => emit('select', id))"
        >
          <span class="assistant-history__marker" aria-hidden="true" />
          <span class="assistant-history__body">
            <span class="assistant-history__title">{{ conversation.title ?? tr('designer.assistant.history.untitled') }}</span>
            <span class="assistant-history__meta">
              {{ conversationStatusLabel(conversation.status, tr) }} · {{ formatConversationTime(conversation.updatedAt) }}
            </span>
          </span>
        </button>
        <button
          type="button"
          class="assistant-history__delete"
          :title="conversation.id === pendingDeleteId ? tr('designer.assistant.action.confirmDeleteConversation') : tr('designer.assistant.action.deleteConversation')"
          :aria-label="conversation.id === pendingDeleteId ? tr('designer.assistant.action.confirmDeleteConversation') : tr('designer.assistant.action.deleteConversation')"
          @click="handleDeleteClick(conversation.id, id => emit('delete', id))"
        >
          <IconCheck v-if="conversation.id === pendingDeleteId" :size="15" stroke-width="1.9" />
          <IconDelete v-else :size="15" stroke-width="1.9" />
        </button>
      </div>
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
  grid-template-columns: minmax(0, 1fr) 32px;
  width: 100%;
  min-height: 56px;
  align-items: center;
  gap: 4px;
  border-radius: 7px;
  background: transparent;
  color: var(--assistant-text);
  padding: 2px 4px 2px 0;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--assistant-surface) 72%, transparent);
  }
}

.assistant-history__item--active {
  background: color-mix(in srgb, var(--assistant-surface) 86%, var(--assistant-bg));
  color: var(--assistant-text);
}

.assistant-history__item--confirming {
  background: color-mix(in srgb, var(--assistant-danger) 9%, var(--assistant-bg));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--assistant-danger) 16%, transparent);
}

.assistant-history__select {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  min-width: 0;
  min-height: 52px;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 7px 4px 7px 6px;
  text-align: left;
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

.assistant-history__delete {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--assistant-muted) 78%, transparent);
  cursor: pointer;
  opacity: 0;
  padding: 0;
  transition: background 0.15s, color 0.15s, opacity 0.15s, transform 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--assistant-danger) 8%, transparent);
    color: var(--assistant-danger);
    transform: translateY(-1px);
  }
}

.assistant-history__item:hover .assistant-history__delete,
.assistant-history__delete--confirming {
  opacity: 1;
}

.assistant-history__delete--confirming {
  background: var(--assistant-danger);
  color: #fff;
  opacity: 1;
  box-shadow: 0 8px 18px rgb(180 35 24 / 18%);

  &:hover {
    background: #971c13;
    color: #fff;
  }
}
</style>
