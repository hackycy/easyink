<script setup lang="ts">
import type { AssistantThinking, ExecutionStep, ToolUseItem } from '../projection'
import ExecutionStepsCard from './ExecutionStepsCard.vue'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolUseStrip from './ToolUseStrip.vue'

defineProps<{
  thinking: AssistantThinking
  steps: ExecutionStep[]
  tools: ToolUseItem[]
}>()
</script>

<template>
  <article class="assistant-turn">
    <ThinkingBlock
      v-if="thinking.lines.length || thinking.summary.length || thinking.status === 'running'"
      :thinking="thinking"
    />
    <ToolUseStrip v-if="tools.length" :tools="tools" />
    <ExecutionStepsCard v-if="steps.length" :steps="steps" />
  </article>
</template>

<style scoped lang="scss">
.assistant-turn {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--ei-border-color, #e3e7ee);
  border-radius: 12px;
  background: var(--ei-panel-bg, #fff);
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}
</style>
