<script setup lang="ts">
import type { AssistantResult, AssistantSourceInput } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord } from '@easyink/assistant-store'
import { useQuery } from '@tanstack/vue-query'
import { useIntervalFn } from '@vueuse/core'
import { useMachine } from '@xstate/vue'
import { computed, ref, watch } from 'vue'
import { createAssistantApiClient } from '../api'
import { assistantWorkbenchMachine } from '../machine'
import { createAssistantTaskQueryOptions } from '../queries'
import DiffPanel from './DiffPanel.vue'
import ResultPreview from './ResultPreview.vue'
import SourceInspector from './SourceInspector.vue'
import TaskComposer from './TaskComposer.vue'
import WorkflowTimeline from './WorkflowTimeline.vue'

const props = withDefaults(defineProps<{
  endpoint?: string
}>(), {
  endpoint: '',
})

const emit = defineEmits<{
  apply: [result: AssistantResult]
}>()

const api = computed(() => createAssistantApiClient(props.endpoint))
const prompt = ref('')
const sourceKind = ref<AssistantSourceInput['kind']>('none')
const sourceContent = ref('')
const taskId = ref<string>()
const events = ref<AssistantEventRecord[]>([])
const error = ref<string>()
const { snapshot, send } = useMachine(assistantWorkbenchMachine)

const taskQuery = useQuery(createAssistantTaskQueryOptions(api.value, taskId))
const task = computed(() => taskQuery.data.value?.task)
const result = computed(() => taskQuery.data.value?.result)
const running = computed(() => snapshot.value.matches('running') || task.value?.status === 'running' || task.value?.status === 'queued')

useIntervalFn(async () => {
  if (!taskId.value)
    return
  events.value = await api.value.listEvents(taskId.value)
}, 1000)

watch(result, (next) => {
  if (next)
    send({ type: 'RESULT_READY' })
})

watch(() => task.value?.status, (status) => {
  if (status === 'failed')
    send({ type: 'FAIL' })
  if (status === 'done')
    send({ type: 'DONE' })
})

async function submitTask() {
  error.value = undefined
  send({ type: 'SUBMIT' })
  try {
    const source = buildSource()
    const created = await api.value.createTask({ prompt: prompt.value, source })
    taskId.value = created.id
    await taskQuery.refetch()
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    send({ type: 'FAIL' })
  }
}

async function applyResult() {
  if (!taskId.value || !result.value)
    return
  send({ type: 'APPLY' })
  await api.value.applyTask(taskId.value)
  emit('apply', result.value)
  send({ type: 'DONE' })
}

function buildSource(): AssistantSourceInput {
  if (sourceKind.value === 'none')
    return { kind: 'none' }
  if (sourceKind.value === 'http')
    return { kind: 'http', url: sourceContent.value }
  return { kind: sourceKind.value, content: sourceContent.value }
}
</script>

<template>
  <div class="easyink-assistant-workbench">
    <div class="assistant-main">
      <TaskComposer
        v-model:prompt="prompt"
        :running="running"
        @submit="submitTask"
      />
      <SourceInspector
        v-model:kind="sourceKind"
        v-model:content="sourceContent"
        :running="running"
      />
      <WorkflowTimeline
        :events="events"
        :active-step="task?.step"
      />
    </div>
    <div class="assistant-side">
      <ResultPreview :result="result" />
      <DiffPanel :result="result" />
      <div class="assistant-actions">
        <button
          type="button"
          :disabled="!result || running"
          @click="applyResult"
        >
          应用
        </button>
      </div>
      <p v-if="error" class="assistant-error">
        {{ error }}
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.easyink-assistant-workbench {
  --assistant-border: var(--ei-border-color, #d6dbe3);
  --assistant-bg: var(--ei-panel-bg, #ffffff);
  --assistant-muted: var(--ei-text-secondary, #667085);
  --assistant-accent: var(--ei-primary, #1677ff);
  display: grid;
  grid-template-columns: minmax(360px, 1fr) 280px;
  gap: 12px;
  width: min(980px, calc(100vw - 48px));
  max-height: calc(100vh - 72px);
  padding: 12px;
  border: 1px solid var(--assistant-border);
  border-radius: 8px;
  background: var(--assistant-bg);
  color: var(--ei-text, #1f2937);
  box-shadow: 0 16px 48px rgb(15 23 42 / 18%);
  box-sizing: border-box;
}

.assistant-main,
.assistant-side {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.assistant-section {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--assistant-border);
  border-radius: 6px;
  background: #fff;
}

.assistant-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
}

.assistant-segmented {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--assistant-border);
  border-radius: 6px;

  button {
    height: 26px;
    min-width: 44px;
    border: 0;
    border-right: 1px solid var(--assistant-border);
    background: #fff;
    color: var(--assistant-muted);
    cursor: pointer;
    font-size: 12px;

    &:last-child {
      border-right: 0;
    }

    &.active {
      background: var(--assistant-accent);
      color: #fff;
    }
  }
}

.assistant-code-input {
  width: 100%;
  min-height: 120px;
  padding: 8px;
  border: 1px solid var(--assistant-border);
  border-radius: 6px;
  resize: vertical;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  box-sizing: border-box;
}

.assistant-timeline ol,
.assistant-diff ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--assistant-muted);
  font-size: 12px;
}

.assistant-timeline li.active {
  color: var(--assistant-accent);
  font-weight: 600;
}

.assistant-preview__grid {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 8px;
  align-items: center;
  color: var(--assistant-muted);
  font-size: 12px;
}

.assistant-muted {
  margin: 0;
  color: var(--assistant-muted);
  font-size: 12px;
}

.assistant-actions {
  display: flex;
  justify-content: flex-end;

  button {
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--assistant-accent);
    border-radius: 6px;
    background: var(--assistant-accent);
    color: #fff;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.assistant-error {
  margin: 0;
  color: #b42318;
  font-size: 12px;
}

@media (max-width: 720px) {
  .easyink-assistant-workbench {
    grid-template-columns: 1fr;
    width: calc(100vw - 24px);
  }
}
</style>
