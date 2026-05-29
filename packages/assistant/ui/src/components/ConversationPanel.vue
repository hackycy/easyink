<script setup lang="ts">
import type { AssistantMaterialManifest, AssistantPatchOperation, AssistantResult, AssistantSourceInput } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord, AssistantSourceSampleRecord, AssistantVersionRecord } from '@easyink/assistant-store'
import type { AssistantApiClient } from '../api'
import { useIntervalFn } from '@vueuse/core'
import { useMachine } from '@xstate/vue'
import { computed, ref, watch } from 'vue'
import { createAssistantApiClient } from '../api'
import { assistantWorkbenchMachine } from '../machine'
import { projectTaskToMessages } from '../projection'
import ComposerBar from './ComposerBar.vue'
import ConversationHeader from './ConversationHeader.vue'
import MessageList from './MessageList.vue'

const props = withDefaults(defineProps<{
  endpoint?: string
  apiClient?: AssistantApiClient
  currentSchema?: unknown
  materialManifest?: AssistantMaterialManifest
}>(), {
  endpoint: '',
  apiClient: undefined,
  currentSchema: undefined,
  materialManifest: undefined,
})

const emit = defineEmits<{
  apply: [result: AssistantResult]
  applyPatch: [operations: AssistantPatchOperation[]]
  applySelectedPatch: [operations: AssistantPatchOperation[]]
  applyDataSource: [dataSource: NonNullable<AssistantResult['dataSource']>]
  rollback: []
}>()

const api = computed(() => props.apiClient ?? createAssistantApiClient(props.endpoint))
const taskId = ref<string>()
const events = ref<AssistantEventRecord[]>([])
const task = ref<Awaited<ReturnType<AssistantApiClient['getTask']>>['task']>()
const result = ref<Awaited<ReturnType<AssistantApiClient['getTask']>>['result']>()
const versions = ref<AssistantVersionRecord[]>([])
const sourceSample = ref<AssistantSourceSampleRecord>()
const error = ref<string>()
const applying = ref(false)
const { snapshot, send } = useMachine(assistantWorkbenchMachine)

const running = computed(() => snapshot.value.matches('running') || task.value?.status === 'running' || task.value?.status === 'queued')
const statusLabel = computed(() => task.value?.status === 'waiting' ? '等待确认' : running.value ? '生成中' : task.value?.status === 'review' ? '待应用' : undefined)
const messages = computed(() => projectTaskToMessages({
  task: task.value,
  events: events.value,
  result: result.value,
  versions: versions.value,
  sourceSample: sourceSample.value,
  error: error.value,
}))

useIntervalFn(async () => {
  if (!taskId.value)
    return
  await refreshTask()
}, 1000)

watch(result, (next) => {
  if (next)
    send({ type: 'RESULT_READY' })
})

watch(() => task.value?.status, (status) => {
  if (status === 'failed')
    send({ type: 'FAIL' })
  if (status === 'done' || status === 'review' || status === 'waiting')
    send({ type: 'DONE' })
})

async function submitMessage(payload: { prompt: string, source?: AssistantSourceInput }) {
  error.value = undefined
  send({ type: 'SUBMIT' })
  try {
    if (task.value?.status === 'waiting' && taskId.value) {
      const updated = await api.value.submitClarification(taskId.value, { answer: payload.prompt })
      taskId.value = updated.id
    }
    else {
      const created = await api.value.createTask({
        prompt: payload.prompt,
        source: payload.source ?? { kind: 'none' },
        currentSchema: props.currentSchema,
        materialManifest: props.materialManifest,
      })
      taskId.value = created.id
    }
    await refreshTask()
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    send({ type: 'FAIL' })
  }
}

async function applyResult(resultToApply: AssistantResult) {
  if (!taskId.value)
    return
  applying.value = true
  try {
    send({ type: 'APPLY' })
    await api.value.applyTask(taskId.value)
    emit('apply', resultToApply)
    await refreshTask()
    send({ type: 'DONE' })
  }
  finally {
    applying.value = false
  }
}

async function repairTask() {
  if (!taskId.value)
    return
  await api.value.repairTask(taskId.value)
  await refreshTask()
}

async function retryTask() {
  if (!taskId.value)
    return
  await api.value.retryTask(taskId.value)
  await refreshTask()
}

async function rollbackTask() {
  if (!taskId.value)
    return
  await api.value.rollbackTask(taskId.value)
  emit('rollback')
  await refreshTask()
}

async function exportVersions() {
  const snapshot = await api.value.exportSnapshot()
  downloadJson('easyink-assistant-debug-snapshot.json', snapshot)
}

async function refreshTask() {
  if (!taskId.value)
    return
  const [nextEvents, nextTask, nextVersions] = await Promise.all([
    api.value.listEvents(taskId.value),
    api.value.getTask(taskId.value),
    api.value.listVersions(taskId.value),
  ])
  events.value = nextEvents
  task.value = nextTask.task
  result.value = nextTask.result
  versions.value = nextVersions
  sourceSample.value = await api.value.getSourceSample(taskId.value).catch(() => undefined)
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="easyink-assistant-conversation">
    <ConversationHeader :status="statusLabel" />
    <MessageList
      :messages="messages"
      :applying="applying"
      @apply="applyResult"
      @apply-patch="$emit('applyPatch', $event)"
      @apply-selected-patch="$emit('applySelectedPatch', $event)"
      @apply-data-source="$emit('applyDataSource', $event)"
      @answer="submitMessage({ prompt: $event })"
      @repair="repairTask"
      @retry="retryTask"
      @rollback="rollbackTask"
      @export-versions="exportVersions"
    />
    <ComposerBar
      :running="running"
      :placeholder="task?.status === 'waiting' ? '输入你的选择或补充信息' : '帮我生成一张 80mm 小票'"
      @submit="submitMessage"
    />
  </section>
</template>

<style scoped lang="scss">
.easyink-assistant-conversation {
  --assistant-border: var(--ei-border-color, #d6dbe3);
  --assistant-bg: var(--ei-panel-bg, #ffffff);
  --assistant-muted: var(--ei-text-secondary, #667085);
  --assistant-accent: var(--ei-primary, #1677ff);
  display: grid;
  grid-template-rows: auto minmax(260px, 1fr) auto;
  width: min(720px, calc(100vw - 48px));
  height: min(760px, calc(100vh - 72px));
  border: 1px solid var(--assistant-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--assistant-bg);
  color: var(--ei-text, #1f2937);
  box-shadow: 0 16px 48px rgb(15 23 42 / 18%);
}

:deep(.assistant-conversation-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--assistant-border);

  h2 {
    margin: 0;
    font-size: 16px;
  }

  p {
    margin: 2px 0 0;
    color: var(--assistant-muted);
    font-size: 12px;
  }

  span {
    flex: 0 0 auto;
    color: var(--assistant-accent);
    font-size: 12px;
    font-weight: 600;
  }
}

:deep(.assistant-message-list) {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding: 14px 16px;
  background: #f8fafc;
}

:deep(.assistant-message) {
  max-width: 82%;
  padding: 9px 11px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.55;

  p {
    margin: 0;
    white-space: pre-wrap;
  }
}

:deep(.assistant-message--user) {
  align-self: flex-end;
  background: var(--assistant-accent);
  color: #fff;
}

:deep(.assistant-message--assistant),
:deep(.assistant-card) {
  align-self: flex-start;
  border: 1px solid var(--assistant-border);
  background: #fff;
}

:deep(.assistant-card) {
  width: min(100%, 560px);
  padding: 12px;
  border-radius: 8px;
  box-sizing: border-box;
  font-size: 12px;

  p {
    margin: 4px 0 0;
    color: var(--assistant-muted);
  }

  button {
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--assistant-border);
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    font-size: 12px;
  }
}

:deep(.assistant-card__head),
:deep(.assistant-source-card),
:deep(.assistant-progress) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

:deep(.assistant-progress) {
  justify-content: flex-start;
}

:deep(.assistant-progress__dot) {
  width: 8px;
  height: 8px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--assistant-muted);
}

:deep(.assistant-progress__dot--running) {
  background: var(--assistant-accent);
}

:deep(.assistant-progress__dot--done) {
  background: #16a34a;
}

:deep(.assistant-result-card dl) {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 12px 0;

  div {
    padding: 8px;
    border-radius: 6px;
    background: #f8fafc;
  }

  dt {
    color: var(--assistant-muted);
  }

  dd {
    margin: 2px 0 0;
    font-weight: 700;
  }
}

:deep(.assistant-result-card .ok) {
  color: #15803d;
}

:deep(.assistant-result-card .warn),
:deep(.assistant-card--danger strong) {
  color: #b42318;
}

:deep(.assistant-result-card__actions) {
  display: grid;
  gap: 8px;
}

:deep(.assistant-result-card__actions button:first-child) {
  width: 100%;
  border-color: var(--assistant-accent);
  background: var(--assistant-accent);
  color: #fff;
}

:deep(.assistant-source-card ul) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;

  li {
    padding: 2px 6px;
    border-radius: 5px;
    background: #eef2f7;
  }
}

:deep(.assistant-diff-card ul) {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--assistant-muted);
}

:deep(.assistant-diff-card pre) {
  max-height: 180px;
  overflow: auto;
  margin: 10px 0 0;
  padding: 10px;
  border-radius: 6px;
  background: #0f172a;
  color: #e2e8f0;
}

:deep(.assistant-diff-card__actions),
:deep(.assistant-clarification-card__answers),
:deep(.assistant-version-card ul) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

:deep(.assistant-version-card ul) {
  padding: 0;
  list-style: none;
  color: var(--assistant-muted);
}

:deep(.assistant-composer) {
  padding: 12px;
  border-top: 1px solid var(--assistant-border);
  background: #fff;
}

:deep(.assistant-composer__attachment) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 7px 9px;
  border: 1px solid var(--assistant-border);
  border-radius: 6px;
  background: #f8fafc;
  color: var(--assistant-muted);
  font-size: 12px;

  div {
    display: flex;
    gap: 6px;
  }
}

:deep(.assistant-composer__bar) {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;

  textarea {
    min-height: 48px;
    max-height: 120px;
    padding: 9px 10px;
    border: 1px solid var(--assistant-border);
    border-radius: 6px;
    resize: vertical;
    font: inherit;
  }

  button {
    min-width: 72px;
    border: 1px solid var(--assistant-accent);
    border-radius: 6px;
    background: var(--assistant-accent);
    color: #fff;
    cursor: pointer;
  }
}

@media (max-width: 680px) {
  .easyink-assistant-conversation {
    width: calc(100vw - 24px);
    height: calc(100vh - 48px);
  }
}
</style>
