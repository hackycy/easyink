<script setup lang="ts">
import type { AssistantMaterialManifest, AssistantPatchOperation, AssistantResult, AssistantSourceInput } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord, AssistantSourceSampleRecord, AssistantTaskRecord, AssistantVersionRecord } from '@easyink/assistant-store'
import type { AssistantApiClient } from '../api'
import { useIntervalFn } from '@vueuse/core'
import { useMachine } from '@xstate/vue'
import { computed, ref, watch } from 'vue'
import { AssistantApiError, createAssistantApiClient } from '../api'
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
const refreshing = ref(false)
const { snapshot, send } = useMachine(assistantWorkbenchMachine)

const POLLING_STATUSES = new Set(['queued', 'running'])
const shouldPoll = computed(() => !!taskId.value && !error.value && (!task.value || POLLING_STATUSES.has(task.value.status)))
const running = computed(() => !error.value && (snapshot.value.matches('running') || task.value?.status === 'running' || task.value?.status === 'queued'))
const statusLabel = computed(() => task.value?.status === 'waiting' ? '等待确认' : running.value ? '生成中' : task.value?.status === 'review' ? '待应用' : undefined)
const messages = computed(() => projectTaskToMessages({
  task: task.value,
  events: events.value,
  result: result.value,
  versions: versions.value,
  sourceSample: sourceSample.value,
  error: error.value,
}))

const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(() => {
  if (!shouldPoll.value || refreshing.value)
    return
  void refreshTask().catch(stopRefreshWithError)
}, 1000, { immediate: false })

watch(shouldPoll, (poll) => {
  if (poll)
    resumeRefresh()
  else
    pauseRefresh()
}, { immediate: true })

watch(result, (next) => {
  if (next)
    send({ type: 'RESULT_READY' })
})

watch(() => task.value?.status, (status) => {
  if (status === 'failed') {
    pauseRefresh()
    send({ type: 'FAIL' })
  }
  if (status === 'done' || status === 'review' || status === 'waiting') {
    pauseRefresh()
    send({ type: 'DONE' })
  }
})

async function submitMessage(payload: { prompt: string, source?: AssistantSourceInput }) {
  error.value = undefined
  send({ type: 'SUBMIT' })
  try {
    if (task.value?.status === 'waiting' && taskId.value) {
      const updated = await api.value.submitClarification(taskId.value, { answer: payload.prompt })
      taskId.value = updated.id
      task.value = updated
    }
    else {
      const created = await api.value.createTask({
        prompt: payload.prompt,
        source: payload.source ?? { kind: 'none' },
        currentSchema: props.currentSchema,
        materialManifest: props.materialManifest,
      })
      taskId.value = created.id
      task.value = created
    }
    await refreshTask()
  }
  catch (err) {
    stopRefreshWithError(err)
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
  catch (err) {
    stopRefreshWithError(err)
  }
  finally {
    applying.value = false
  }
}

async function repairTask() {
  if (!taskId.value)
    return
  await runTaskCommand(() => api.value.repairTask(taskId.value!))
}

async function retryTask() {
  if (!taskId.value)
    return
  await runTaskCommand(() => api.value.retryTask(taskId.value!))
}

async function rollbackTask() {
  if (!taskId.value)
    return
  try {
    await api.value.rollbackTask(taskId.value)
    emit('rollback')
    await refreshTask()
  }
  catch (err) {
    stopRefreshWithError(err)
  }
}

async function exportVersions() {
  const snapshot = await api.value.exportSnapshot()
  downloadJson('easyink-assistant-debug-snapshot.json', snapshot)
}

async function refreshTask() {
  if (!taskId.value)
    return
  refreshing.value = true
  try {
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
  finally {
    refreshing.value = false
  }
}

async function runTaskCommand(command: () => Promise<AssistantTaskRecord>) {
  error.value = undefined
  try {
    task.value = await command()
    await refreshTask()
  }
  catch (err) {
    stopRefreshWithError(err)
  }
}

function stopRefreshWithError(err: unknown) {
  pauseRefresh()
  error.value = formatAssistantError(err)
  send({ type: 'FAIL' })
}

function formatAssistantError(err: unknown): string {
  if (err instanceof AssistantApiError && err.status === 401)
    return '请求未授权（HTTP 401），请检查登录状态或 Assistant 服务凭据后重试。'
  if (err instanceof Error)
    return err.message
  return String(err)
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
  --assistant-border: var(--ei-border-color, #e3e7ee);
  --assistant-bg: var(--ei-panel-bg, #ffffff);
  --assistant-surface: var(--ei-hover-bg, #f6f8fb);
  --assistant-muted: var(--ei-text-secondary, #667085);
  --assistant-text: var(--ei-text, #1f2937);
  --assistant-accent: var(--ei-primary, #1677ff);
  --assistant-accent-hover: var(--ei-primary-hover, #4096ff);
  display: grid;
  grid-template-rows: auto minmax(280px, 1fr) auto;
  width: min(720px, calc(100vw - 48px));
  height: min(760px, calc(100vh - 72px));
  border: 1px solid var(--assistant-border);
  border-radius: 14px;
  overflow: hidden;
  background: var(--assistant-bg);
  color: var(--assistant-text);
  box-shadow: 0 20px 56px rgb(15 23 42 / 16%);
  font-size: 13px;
}

/* Header */
:deep(.assistant-conversation-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--assistant-border);
  background: linear-gradient(180deg, var(--assistant-surface), var(--assistant-bg));
}

:deep(.assistant-conversation-header__brand) {
  display: flex;
  align-items: center;
  gap: 12px;
}

:deep(.assistant-conversation-header__avatar) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--assistant-accent);
  color: #fff;
  flex: 0 0 auto;
  box-shadow: 0 4px 12px rgb(22 119 255 / 28%);
}

:deep(.assistant-conversation-header h2) {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

:deep(.assistant-conversation-header p) {
  margin: 2px 0 0;
  color: var(--assistant-muted);
  font-size: 12px;
}

:deep(.assistant-conversation-header__status) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgb(22 119 255 / 10%);
  color: var(--assistant-accent);
  font-size: 12px;
  font-weight: 600;
}

:deep(.assistant-conversation-header__pulse) {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: assistant-status-pulse 1.4s ease-in-out infinite;
}

/* Message list */
:deep(.assistant-message-list) {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 18px;
  background: var(--assistant-surface);
  scroll-behavior: smooth;
}

/* Chat bubbles */
:deep(.assistant-message) {
  max-width: 84%;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;

  p {
    margin: 0;
    white-space: pre-wrap;
  }
}

:deep(.assistant-message--user) {
  align-self: flex-end;
  border-bottom-right-radius: 4px;
  background: var(--assistant-accent);
  color: #fff;
}

:deep(.assistant-message--assistant) {
  align-self: flex-start;
  border: 1px solid var(--assistant-border);
  border-bottom-left-radius: 4px;
  background: var(--assistant-bg);
}

/* Cards */
:deep(.assistant-card) {
  align-self: flex-start;
  width: min(100%, 560px);
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid var(--assistant-border);
  border-radius: 12px;
  background: var(--assistant-bg);
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
  font-size: 13px;

  > strong {
    font-size: 13px;
    font-weight: 600;
  }
}

:deep(.assistant-card__head) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;

  strong {
    font-size: 13px;
    font-weight: 600;
  }
}

:deep(.assistant-muted) {
  margin: 4px 0 0;
  color: var(--assistant-muted);
  font-size: 12px;
}

/* Buttons */
:deep(.assistant-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--assistant-border);
  border-radius: 8px;
  background: var(--assistant-bg);
  color: var(--assistant-text);
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.15s, background 0.15s, color 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--assistant-accent);
    color: var(--assistant-accent);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

:deep(.assistant-btn--primary) {
  border-color: var(--assistant-accent);
  background: var(--assistant-accent);
  color: #fff;

  &:hover:not(:disabled) {
    border-color: var(--assistant-accent-hover);
    background: var(--assistant-accent-hover);
    color: #fff;
  }
}

:deep(.assistant-link) {
  border: none;
  background: transparent;
  color: var(--assistant-accent);
  cursor: pointer;
  font-size: 12px;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
}

:deep(.assistant-chip) {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--assistant-border);
  border-radius: 999px;
  background: var(--assistant-bg);
  color: var(--assistant-text);
  cursor: pointer;
  font-size: 12px;
  transition: border-color 0.15s, background 0.15s, color 0.15s;

  &:hover {
    border-color: var(--assistant-accent);
    background: rgb(22 119 255 / 8%);
    color: var(--assistant-accent);
  }
}

/* Badges */
:deep(.assistant-badge) {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

:deep(.assistant-badge--ok) {
  background: rgb(22 163 74 / 12%);
  color: #15803d;
}

:deep(.assistant-badge--warn) {
  background: rgb(180 35 24 / 12%);
  color: #b42318;
}

/* Source card */
:deep(.assistant-source-card) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

:deep(.assistant-source-card__fields) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;

  li {
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--assistant-surface);
    font-size: 12px;
    color: var(--assistant-muted);
  }
}

:deep(.assistant-source-card__warning) {
  margin: 8px 0 0;
  color: #b42318;
  font-size: 12px;
}

/* Diff card */
:deep(.assistant-diff-card__summary) {
  margin: 4px 0 0;
  padding-left: 18px;
  color: var(--assistant-muted);

  li {
    line-height: 1.6;
  }
}

:deep(.assistant-diff-card pre) {
  max-height: 180px;
  overflow: auto;
  margin: 10px 0 0;
  padding: 12px;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
}

:deep(.assistant-diff-card__actions),
:deep(.assistant-clarification-card__answers) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

/* Clarification */
:deep(.assistant-clarification-card__question) {
  margin-top: 8px;

  p {
    margin: 0;
    color: var(--assistant-text);
  }
}

/* Repair */
:deep(.assistant-repair-card .assistant-btn),
:deep(.assistant-card--danger .assistant-btn) {
  margin-top: 10px;
}

:deep(.assistant-card--danger) {
  border-color: rgb(180 35 24 / 35%);

  > strong {
    color: #b42318;
  }
}

/* Version */
:deep(.assistant-version-card__list) {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 10px 0;
  padding: 0;
  list-style: none;
  color: var(--assistant-muted);
  font-size: 12px;
}

/* Composer */
:deep(.assistant-composer) {
  padding: 14px;
  border-top: 1px solid var(--assistant-border);
  background: var(--assistant-bg);
}

:deep(.assistant-composer__attachment) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid var(--assistant-border);
  border-radius: 8px;
  background: var(--assistant-surface);
  color: var(--assistant-muted);
  font-size: 12px;

  div {
    display: flex;
    gap: 6px;
  }

  button {
    border: none;
    background: transparent;
    color: var(--assistant-accent);
    cursor: pointer;
    font-size: 12px;
    padding: 0;
  }
}

:deep(.assistant-composer__bar) {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: end;

  textarea {
    min-height: 48px;
    max-height: 120px;
    padding: 10px 12px;
    border: 1px solid var(--assistant-border);
    border-radius: 10px;
    resize: vertical;
    font: inherit;
    color: var(--assistant-text);
    transition: border-color 0.15s, box-shadow 0.15s;

    &:focus {
      outline: none;
      border-color: var(--assistant-accent);
      box-shadow: 0 0 0 3px rgb(22 119 255 / 12%);
    }
  }

  button {
    min-width: 76px;
    height: 48px;
    border: 1px solid var(--assistant-accent);
    border-radius: 10px;
    background: var(--assistant-accent);
    color: #fff;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.15s;

    &:hover:not(:disabled) {
      background: var(--assistant-accent-hover);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

@keyframes assistant-status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@media (max-width: 680px) {
  .easyink-assistant-conversation {
    width: calc(100vw - 24px);
    height: calc(100vh - 48px);
  }
}
</style>
