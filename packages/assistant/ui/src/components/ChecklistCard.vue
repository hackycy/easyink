<script setup lang="ts">
import type { AssistantTranslate } from '../i18n'
import type { ChecklistItem } from '../projection'
import { translateAssistant } from '../i18n'

const props = defineProps<{
  items: ChecklistItem[]
  t?: AssistantTranslate
}>()

const STATUS_LABEL_KEY: Record<ChecklistItem['status'], string> = {
  pending: 'designer.assistant.status.pending',
  running: 'designer.assistant.status.running',
  done: 'designer.assistant.status.done',
  failed: 'designer.assistant.status.failed',
}

function tr(key: string): string {
  return translateAssistant(key, props.t)
}
</script>

<template>
  <div class="assistant-checklist">
    <ul class="assistant-checklist__list">
      <li
        v-for="item in items"
        :key="item.id"
        class="assistant-checklist__item"
        :class="`assistant-checklist__item--${item.status}`"
      >
        <span class="assistant-checklist__signal" aria-hidden="true">
          <span class="assistant-checklist__lamp" />
        </span>
        <span class="assistant-checklist__title">{{ item.title }}</span>
        <span class="assistant-checklist__status">{{ tr(STATUS_LABEL_KEY[item.status]) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.assistant-checklist {
  align-self: stretch;
  padding: 10px 0 0;
}

.assistant-checklist__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.assistant-checklist__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 2px;
  border-radius: 8px;
  color: var(--assistant-muted, #667085);
  transition: color 0.15s;
}

.assistant-checklist__item--running {
  color: var(--assistant-text, #1f2937);
}

.assistant-checklist__item--done {
  color: var(--assistant-text, #1f2937);
}

.assistant-checklist__signal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 18px;
  flex: 0 0 auto;
}

.assistant-checklist__lamp {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
  box-shadow: inset 0 0 0 1px rgb(15 23 42 / 7%);
}

.assistant-checklist__lamp::after {
  position: absolute;
  inset: -5px;
  border-radius: inherit;
  content: '';
  opacity: 0;
}

.assistant-checklist__item--done .assistant-checklist__lamp {
  background: #16a34a;
  box-shadow: 0 0 0 4px rgb(22 163 74 / 10%), 0 0 16px rgb(22 163 74 / 28%);
}

.assistant-checklist__item--failed .assistant-checklist__lamp {
  background: #b42318;
  box-shadow: 0 0 0 4px rgb(180 35 24 / 10%), 0 0 16px rgb(180 35 24 / 24%);
}

.assistant-checklist__item--running .assistant-checklist__lamp {
  background: var(--assistant-accent, #1677ff);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--assistant-accent, #1677ff) 12%, transparent);
}

.assistant-checklist__item--running .assistant-checklist__lamp::after {
  background: var(--assistant-accent, #1677ff);
  animation: assistant-signal-pulse 1.45s ease-out infinite;
}

.assistant-checklist__title {
  flex: 1 1 auto;
  font-size: 12px;
  letter-spacing: 0.01em;
}

.assistant-checklist__status {
  flex: 0 0 auto;
  font-size: 11px;
  letter-spacing: 0.02em;
  opacity: 0.75;
}

.assistant-checklist__item--running .assistant-checklist__status {
  color: var(--assistant-accent, #1677ff);
  opacity: 1;
}

.assistant-checklist__item--failed .assistant-checklist__status {
  color: #b42318;
  opacity: 1;
}

@keyframes assistant-signal-pulse {
  0% { opacity: 0.3; transform: scale(0.55); }
  70% { opacity: 0; transform: scale(1.8); }
  100% { opacity: 0; transform: scale(1.8); }
}
</style>
