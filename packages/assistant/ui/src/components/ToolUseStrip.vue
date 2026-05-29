<script setup lang="ts">
import type { ToolUseItem } from '../projection'

defineProps<{ tools: ToolUseItem[] }>()
</script>

<template>
  <section class="assistant-tools">
    <div
      v-for="tool in tools"
      :key="tool.id"
      class="assistant-tools__item"
      :class="`assistant-tools__item--${tool.status}`"
    >
      <span class="assistant-tools__dot" />
      <span class="assistant-tools__title">{{ tool.title }}</span>
      <span v-if="tool.summary" class="assistant-tools__summary">{{ tool.summary }}</span>
    </div>
  </section>
</template>

<style scoped lang="scss">
.assistant-tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assistant-tools__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--ei-border-color, #e3e7ee);
  border-radius: 8px;
  background: var(--ei-panel-bg, #fff);
  font-size: 12px;
  color: var(--ei-text-secondary, #667085);
}

.assistant-tools__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ei-text-secondary, #98a2b3);
  flex: 0 0 auto;
}

.assistant-tools__item--running .assistant-tools__dot {
  background: var(--ei-primary, #1677ff);
  animation: assistant-tools-blink 1s ease-in-out infinite;
}

.assistant-tools__item--done .assistant-tools__dot {
  background: #16a34a;
}

.assistant-tools__item--failed {
  border-color: rgb(180 35 24 / 35%);

  .assistant-tools__dot {
    background: #b42318;
  }
}

.assistant-tools__title {
  font-weight: 600;
  color: var(--ei-text, #1f2937);
  flex: 0 0 auto;
}

.assistant-tools__summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes assistant-tools-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
</style>
