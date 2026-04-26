<script setup lang="ts">
import type { SessionMessage } from '../types'
import {
  IconCheck,
  IconClose,
  IconCopy,
  IconFileText,
  IconHistory,
  IconRedo,
} from '@easyink/icons'
import { ref } from 'vue'

const props = defineProps<{
  message: SessionMessage
  /** Whether this message currently streams progress. */
  streaming?: boolean
  /** True when there is an associated schemaSnapshot that can be restored. */
  canRestore?: boolean
  /** True when the user prompt that produced this assistant reply is known. */
  canRegenerate?: boolean
}>()

const emit = defineEmits<{
  copy: [text: string]
  viewSchema: [message: SessionMessage]
  regenerate: [message: SessionMessage]
  restore: [message: SessionMessage]
}>()

const copied = ref(false)

function handleCopy() {
  const text = props.message.content || props.message.error || ''
  emit('copy', text)
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {})
  }
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1200)
}
</script>

<template>
  <div
    class="ai-msg"
    :class="[
      `ai-msg--${message.role}`,
      streaming && 'ai-msg--streaming',
      message.error && 'ai-msg--error',
    ]"
  >
    <div class="ai-msg__bubble">
      <div
        v-if="message.content"
        class="ai-msg__content"
      >
        {{ message.content }}<span
          v-if="streaming"
          class="ai-msg__caret"
        />
      </div>
      <div
        v-else-if="streaming"
        class="ai-msg__thinking"
      >
        <span class="ai-msg__dot" />
        <span class="ai-msg__dot" />
        <span class="ai-msg__dot" />
      </div>

      <div
        v-if="message.error"
        class="ai-msg__error"
      >
        <IconClose :size="14" />
        <span>{{ message.error }}</span>
      </div>

      <div
        v-if="message.toolsUsed?.length"
        class="ai-msg__tools"
      >
        <span
          v-for="tool in message.toolsUsed"
          :key="tool"
          class="ai-msg__tool"
        >{{ tool }}</span>
      </div>
    </div>

    <div
      v-if="!streaming && (message.content || message.role === 'assistant')"
      class="ai-msg__actions"
    >
      <button
        class="ai-msg__action"
        :title="copied ? '已复制' : '复制'"
        @click="handleCopy"
      >
        <IconCheck v-if="copied" :size="14" />
        <IconCopy v-else :size="14" />
      </button>
      <button
        v-if="message.schemaSnapshot"
        class="ai-msg__action"
        title="查看 Schema"
        @click="emit('viewSchema', message)"
      >
        <IconFileText :size="14" />
      </button>
      <button
        v-if="canRestore"
        class="ai-msg__action"
        title="回到此版本"
        @click="emit('restore', message)"
      >
        <IconHistory :size="14" />
      </button>
      <button
        v-if="canRegenerate"
        class="ai-msg__action"
        title="用相同 prompt 重新生成"
        @click="emit('regenerate', message)"
      >
        <IconRedo :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ai-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
}

.ai-msg--user {
  align-items: flex-end;
}

.ai-msg--assistant {
  align-items: flex-start;
}

.ai-msg__bubble {
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.55;
  max-width: 92%;
  word-break: break-word;
}

.ai-msg--user .ai-msg__bubble {
  background: var(--ei-primary, #4f46e5);
  color: #fff;
  border-bottom-right-radius: 2px;
}

.ai-msg--assistant .ai-msg__bubble {
  background: var(--ei-bg-secondary, #f3f4f6);
  color: var(--ei-text, #111827);
  border-bottom-left-radius: 2px;
}

.ai-msg--error .ai-msg__bubble {
  background: #fef2f2;
  color: #991b1b;
}

.ai-msg__content {
  white-space: pre-wrap;
}

.ai-msg__caret {
  display: inline-block;
  width: 6px;
  height: 14px;
  margin-left: 2px;
  background: currentColor;
  vertical-align: text-bottom;
  animation: ai-caret 1s steps(2) infinite;
}

@keyframes ai-caret {
  50% { opacity: 0; }
}

.ai-msg__thinking {
  display: inline-flex;
  gap: 4px;
  padding: 2px 0;
}

.ai-msg__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ei-text-secondary, #6b7280);
  opacity: 0.4;
  animation: ai-dot 1.2s ease-in-out infinite;
}

.ai-msg__dot:nth-child(2) { animation-delay: 0.15s; }
.ai-msg__dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes ai-dot {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.ai-msg__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  color: #dc2626;
  font-size: 12px;
}

.ai-msg__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.ai-msg__tool {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  color: var(--ei-text-secondary, #6b7280);
}

.ai-msg--user .ai-msg__tool {
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
}

.ai-msg__actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.ai-msg:hover .ai-msg__actions {
  opacity: 1;
}

.ai-msg__action {
  background: none;
  border: none;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--ei-text-secondary, #6b7280);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-msg__action:hover {
  background: var(--ei-bg-hover, #f3f4f6);
  color: var(--ei-primary, #4f46e5);
}
</style>
