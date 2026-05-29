<script setup lang="ts">
import type { AssistantThinking } from '../projection'
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{ thinking: AssistantThinking }>()

const expanded = ref(false)
const stream = ref<HTMLDivElement>()

const running = computed(() => props.thinking.status === 'running')
const latest = computed(() => props.thinking.lines.at(-1) ?? '正在分析你的需求……')
const detail = computed(() => props.thinking.summary.length ? props.thinking.summary : props.thinking.lines)
const hasDetail = computed(() => detail.value.length > 0)

watch(
  () => props.thinking.lines.length,
  async () => {
    if (!running.value)
      return
    await nextTick()
    if (stream.value)
      stream.value.scrollTop = stream.value.scrollHeight
  },
)
</script>

<template>
  <section class="assistant-thinking" :class="{ 'assistant-thinking--done': !running }">
    <header class="assistant-thinking__head" @click="!running && (expanded = !expanded)">
      <span class="assistant-thinking__indicator" :class="{ 'is-running': running }" />
      <strong>{{ running ? 'AI 正在思考' : '已完成思考' }}</strong>
      <button
        v-if="!running && hasDetail"
        type="button"
        class="assistant-thinking__toggle"
        @click.stop="expanded = !expanded"
      >
        {{ expanded ? '收起' : '展开' }}
      </button>
    </header>

    <div v-if="running" ref="stream" class="assistant-thinking__stream">
      <p v-for="(line, index) in thinking.lines" :key="index" class="assistant-thinking__line">
        {{ line }}
      </p>
      <p v-if="!thinking.lines.length" class="assistant-thinking__line">
        {{ latest }}
      </p>
    </div>

    <transition name="assistant-thinking-fade">
      <ul v-if="!running && expanded && hasDetail" class="assistant-thinking__summary">
        <li v-for="(item, index) in detail" :key="index">
          {{ item }}
        </li>
      </ul>
    </transition>
  </section>
</template>

<style scoped lang="scss">
.assistant-thinking {
  border: 1px solid var(--ei-border-color, #e3e7ee);
  border-radius: 10px;
  background: var(--ei-hover-bg, #f6f8fb);
  padding: 10px 12px;
  font-size: 12px;
  color: var(--ei-text, #1f2937);
}

.assistant-thinking--done {
  background: transparent;
  padding: 6px 12px;
}

.assistant-thinking__head {
  display: flex;
  align-items: center;
  gap: 8px;

  strong {
    font-size: 12px;
    font-weight: 600;
  }
}

.assistant-thinking--done .assistant-thinking__head {
  cursor: pointer;
}

.assistant-thinking__indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ei-text-secondary, #98a2b3);
  flex: 0 0 auto;

  &.is-running {
    background: var(--ei-primary, #1677ff);
    box-shadow: 0 0 0 0 rgb(22 119 255 / 45%);
    animation: assistant-thinking-pulse 1.4s ease-out infinite;
  }
}

.assistant-thinking__toggle {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--ei-primary, #1677ff);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.assistant-thinking__stream {
  margin-top: 8px;
  max-height: 96px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;
  mask-image: linear-gradient(to bottom, transparent, #000 18px);
}

.assistant-thinking__line {
  margin: 0;
  color: var(--ei-text-secondary, #667085);
  line-height: 1.5;
  animation: assistant-thinking-enter 0.24s ease;
}

.assistant-thinking__summary {
  margin: 8px 0 2px;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ei-text-secondary, #667085);

  li {
    line-height: 1.5;
  }
}

.assistant-thinking-fade-enter-active,
.assistant-thinking-fade-leave-active {
  transition: opacity 0.18s ease;
}

.assistant-thinking-fade-enter-from,
.assistant-thinking-fade-leave-to {
  opacity: 0;
}

@keyframes assistant-thinking-pulse {
  0% { box-shadow: 0 0 0 0 rgb(22 119 255 / 45%); }
  70% { box-shadow: 0 0 0 6px rgb(22 119 255 / 0%); }
  100% { box-shadow: 0 0 0 0 rgb(22 119 255 / 0%); }
}

@keyframes assistant-thinking-enter {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
