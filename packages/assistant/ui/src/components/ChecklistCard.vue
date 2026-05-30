<script setup lang="ts">
import type { ChecklistItem } from '../projection'

defineProps<{
  items: ChecklistItem[]
}>()

const STATUS_LABEL: Record<ChecklistItem['status'], string> = {
  pending: '等待中',
  running: '执行中',
  done: '已完成',
  failed: '失败',
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
        <span class="assistant-checklist__icon" aria-hidden="true">
          <svg v-if="item.status === 'done'" viewBox="0 0 16 16" width="14" height="14">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg v-else-if="item.status === 'failed'" viewBox="0 0 16 16" width="14" height="14">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          <span v-else-if="item.status === 'running'" class="assistant-checklist__spinner" />
          <span v-else class="assistant-checklist__dot" />
        </span>
        <span class="assistant-checklist__title">{{ item.title }}</span>
        <span class="assistant-checklist__status">{{ STATUS_LABEL[item.status] }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.assistant-checklist {
  align-self: stretch;
  padding: 6px 2px;
}

.assistant-checklist__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.assistant-checklist__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  color: var(--assistant-muted, #667085);
  transition: background 0.15s, color 0.15s;
}

.assistant-checklist__item--running {
  background: var(--assistant-surface, #f6f8fb);
  color: var(--assistant-text, #1f2937);
}

.assistant-checklist__item--done {
  color: var(--assistant-text, #1f2937);
}

.assistant-checklist__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.assistant-checklist__item--done .assistant-checklist__icon {
  color: #15803d;
}

.assistant-checklist__item--failed .assistant-checklist__icon {
  color: #b42318;
}

.assistant-checklist__item--running .assistant-checklist__icon {
  color: var(--assistant-accent, #1677ff);
}

.assistant-checklist__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.4;
}

.assistant-checklist__spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, currentColor 28%, transparent);
  border-top-color: currentColor;
  animation: assistant-checklist-spin 0.7s linear infinite;
}

.assistant-checklist__title {
  flex: 1 1 auto;
  font-size: 13px;
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

@keyframes assistant-checklist-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
