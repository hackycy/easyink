<script setup lang="ts">
import type { ExecutionStep } from '../projection'

defineProps<{ steps: ExecutionStep[] }>()
</script>

<template>
  <section class="assistant-steps">
    <span class="assistant-steps__title">执行进度</span>
    <ol class="assistant-steps__list">
      <li
        v-for="step in steps"
        :key="step.id"
        class="assistant-steps__item"
        :class="`assistant-steps__item--${step.status}`"
      >
        <span class="assistant-steps__icon">
          <svg v-if="step.status === 'done'" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg v-else-if="step.status === 'failed'" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          <span v-else-if="step.status === 'running'" class="assistant-steps__spinner" />
          <span v-else class="assistant-steps__pending" />
        </span>
        <span class="assistant-steps__label">{{ step.title }}</span>
        <span class="assistant-steps__state">{{ step.status === 'done' ? '已完成' : step.status === 'failed' ? '失败' : step.status === 'running' ? '进行中' : '等待' }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped lang="scss">
.assistant-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.assistant-steps__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ei-text, #1f2937);
}

.assistant-steps__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assistant-steps__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ei-text-secondary, #667085);
}

.assistant-steps__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex: 0 0 auto;
}

.assistant-steps__item--done {
  color: var(--ei-text, #1f2937);

  .assistant-steps__icon {
    background: rgb(22 163 74 / 12%);
    color: #16a34a;
  }
}

.assistant-steps__item--failed {
  .assistant-steps__icon {
    background: rgb(180 35 24 / 12%);
    color: #b42318;
  }
}

.assistant-steps__item--running {
  color: var(--ei-text, #1f2937);
}

.assistant-steps__pending {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--ei-border-color, #cbd2dd);
}

.assistant-steps__spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid rgb(22 119 255 / 25%);
  border-top-color: var(--ei-primary, #1677ff);
  animation: assistant-steps-spin 0.7s linear infinite;
}

.assistant-steps__label {
  flex: 1 1 auto;
}

.assistant-steps__state {
  font-size: 11px;
  color: var(--ei-text-secondary, #98a2b3);
}

@keyframes assistant-steps-spin {
  to { transform: rotate(360deg); }
}
</style>
