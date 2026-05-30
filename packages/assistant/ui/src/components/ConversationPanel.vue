<script setup lang="ts">
import type { AssistantMaterialManifest, AssistantPatchOperation, AssistantResult, AssistantSourceInput } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord } from '@easyink/assistant-store'
import type { AssistantApiClient, AssistantStreamHandle } from '../api'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AssistantApiError, createAssistantApiClient } from '../api'
import { projectChecklist, projectNarration } from '../projection'
import AssistantMessage from './AssistantMessage.vue'
import ChecklistCard from './ChecklistCard.vue'
import ClarificationCard from './ClarificationCard.vue'
import ComposerBar from './ComposerBar.vue'
import ConversationHeader from './ConversationHeader.vue'
import ErrorCard from './ErrorCard.vue'
import UserMessage from './UserMessage.vue'

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
const prompt = ref<string>()
const events = ref<AssistantEventRecord[]>([])
const result = ref<AssistantResult>()
const error = ref<string>()
const applying = ref(false)
const showDebug = ref(false)

let stream: AssistantStreamHandle | undefined

const narration = computed(() => projectNarration(events.value))

// The stream carries events + result; the task status is derived from them so
// the UI never needs to poll a second endpoint.
const derivedStatus = computed<'idle' | 'running' | 'waiting' | 'review' | 'done' | 'failed'>(() => {
  if (error.value)
    return 'failed'
  const types = new Set(events.value.map(record => record.event.type))
  if (types.has('task.applied'))
    return 'done'
  if (types.has('task.failed') || types.has('task.cancelled'))
    return 'failed'
  if (narration.value.clarification)
    return 'waiting'
  if (result.value)
    return 'review'
  if (types.has('task.created'))
    return 'running'
  return 'idle'
})

const derivedTask = computed(() => taskId.value ? { status: derivedStatus.value } as { status: string } : undefined)
const checklist = computed(() => projectChecklist({
  events: events.value,
  result: result.value,
  error: error.value,
  task: derivedTask.value,
}))
const running = computed(() => derivedStatus.value === 'running')
const statusLabel = computed(() => {
  switch (derivedStatus.value) {
    case 'running': return '生成中'
    case 'waiting': return '等待确认'
    case 'review': return '待应用'
    case 'done': return '已应用'
    case 'failed': return '已失败'
    default: return undefined
  }
})

const errorText = computed(() => {
  if (error.value)
    return error.value
  const failed = [...events.value].reverse().find(record => record.event.type === 'task.failed')
  return failed && failed.event.type === 'task.failed' ? failed.event.error : undefined
})

const showChecklist = computed(() => derivedStatus.value !== 'idle' && checklist.value.some(item => item.status !== 'pending'))
const showSummary = computed(() => narration.value.summary.length > 0 && (derivedStatus.value === 'review' || derivedStatus.value === 'done'))
const applied = computed(() => derivedStatus.value === 'done')

function openStream(id: string) {
  closeStream()
  error.value = undefined
  stream = api.value.streamTask(id, {
    onSnapshot: (snapshot) => {
      events.value = snapshot.events
      result.value = snapshot.result ?? result.value
      prompt.value = snapshot.task.input.prompt
    },
    onEvent: (record) => {
      events.value = [...events.value, record]
    },
    onResult: (next) => {
      result.value = next
    },
    onError: (err) => {
      error.value = formatAssistantError(err)
    },
  })
}

function closeStream() {
  stream?.close()
  stream = undefined
}

async function submitMessage(payload: { prompt: string, source?: AssistantSourceInput }) {
  error.value = undefined
  try {
    if (derivedStatus.value === 'waiting' && taskId.value) {
      await api.value.submitClarification(taskId.value, { answer: payload.prompt })
      return
    }
    result.value = undefined
    events.value = []
    const created = await api.value.createTask({
      prompt: payload.prompt,
      source: payload.source ?? { kind: 'none' },
      currentSchema: props.currentSchema,
      materialManifest: props.materialManifest,
    })
    taskId.value = created.id
    prompt.value = created.input.prompt
    openStream(created.id)
  }
  catch (err) {
    error.value = formatAssistantError(err)
  }
}

async function applyResult(resultToApply: AssistantResult) {
  if (!taskId.value)
    return
  applying.value = true
  try {
    await api.value.applyTask(taskId.value)
    emit('apply', resultToApply)
  }
  catch (err) {
    error.value = formatAssistantError(err)
  }
  finally {
    applying.value = false
  }
}

async function retryTask() {
  if (!taskId.value)
    return
  error.value = undefined
  result.value = undefined
  try {
    await api.value.retryTask(taskId.value)
    openStream(taskId.value)
  }
  catch (err) {
    error.value = formatAssistantError(err)
  }
}

function toggleDebug() {
  showDebug.value = !showDebug.value
}

const debugPayload = computed(() => ({
  taskId: taskId.value,
  status: derivedStatus.value,
  result: result.value,
  events: events.value,
}))

function formatAssistantError(err: unknown): string {
  if (err instanceof AssistantApiError && err.status === 401)
    return '请求未授权（HTTP 401），请检查登录状态或 Assistant 服务凭据后重试。'
  if (err instanceof Error)
    return err.message
  return String(err)
}

watch(() => api.value, () => {
  if (taskId.value)
    openStream(taskId.value)
})

onBeforeUnmount(closeStream)
</script>

<template>
  <section class="easyink-assistant-conversation">
    <ConversationHeader :status="statusLabel" />
    <main class="assistant-stream">
      <AssistantMessage
        v-if="derivedStatus === 'idle'"
        text="你好，我可以帮你生成 EasyInk 模板。试试输入“帮我生成一张 80mm 小票”。"
      />
      <UserMessage v-if="prompt" :text="prompt" />

      <p v-if="narration.answer" class="assistant-answer">
        {{ narration.answer }}
      </p>

      <ChecklistCard v-if="showChecklist" :items="checklist" />

      <details v-if="showSummary" class="assistant-summary">
        <summary>分析摘要</summary>
        <ul>
          <li v-for="(line, index) in narration.summary" :key="index">
            {{ line }}
          </li>
        </ul>
      </details>

      <ClarificationCard
        v-if="narration.clarification"
        :questions="narration.clarification"
        @answer="submitMessage({ prompt: $event })"
      />

      <article v-if="derivedStatus === 'review' && result" class="assistant-card assistant-done-card">
        <div class="assistant-done-card__head">
          <span class="assistant-done-card__badge" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="15" height="15">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <div>
            <strong>生成完成，可以应用</strong>
            <p class="assistant-muted">
              已为你生成模板，确认后应用到设计器。
            </p>
          </div>
        </div>
        <div class="assistant-done-card__actions">
          <button type="button" class="assistant-btn assistant-btn--primary" :disabled="applying" @click="applyResult(result)">
            应用到设计器
          </button>
        </div>
      </article>

      <p v-if="applied" class="assistant-answer assistant-answer--muted">
        已应用到设计器。
      </p>

      <ErrorCard
        v-if="errorText && derivedStatus === 'failed'"
        :text="errorText"
        @retry="retryTask"
      />

      <div v-if="result || events.length" class="assistant-debug">
        <button type="button" class="assistant-link" @click="toggleDebug">
          {{ showDebug ? '隐藏技术细节' : '查看技术细节' }}
        </button>
        <pre v-if="showDebug" class="assistant-debug__body">{{ JSON.stringify(debugPayload, null, 2) }}</pre>
      </div>
    </main>
    <ComposerBar
      :running="running"
      :placeholder="derivedStatus === 'waiting' ? '输入你的选择或补充信息' : '帮我生成一张 80mm 小票'"
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
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--assistant-bg);
  color: var(--assistant-text);
  font-size: 13px;
}

/* Conversation stream */
.assistant-stream {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 18px;
  background: var(--assistant-surface);
  scroll-behavior: smooth;
}

.assistant-answer {
  align-self: flex-start;
  max-width: 92%;
  margin: 0;
  color: var(--assistant-text);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.assistant-answer--muted {
  color: var(--assistant-muted);
}

.assistant-summary {
  align-self: stretch;
  font-size: 12px;
  color: var(--assistant-muted);

  summary {
    cursor: pointer;
    color: var(--assistant-text);
    font-weight: 600;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  ul {
    margin: 8px 0 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
}

.assistant-done-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assistant-done-card__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.assistant-done-card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: rgb(22 163 74 / 12%);
  color: #15803d;
}

.assistant-done-card__head strong {
  font-size: 14px;
  font-weight: 600;
}

.assistant-done-card__actions {
  display: flex;
  gap: 8px;
}

.assistant-debug {
  align-self: stretch;
  margin-top: 4px;
}

.assistant-debug__body {
  margin: 8px 0 0;
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  border-radius: 8px;
  background: var(--assistant-bg);
  color: var(--assistant-muted);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
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
