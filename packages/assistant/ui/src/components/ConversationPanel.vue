<script setup lang="ts">
import type { AssistantMaterialManifest, AssistantPatchOperation, AssistantResult, AssistantSourceInput } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord } from '@easyink/assistant-store'
import type { AssistantApiClient, AssistantStreamHandle } from '../api'
import { IconLoader, IconSparkles } from '@easyink/icons'
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

let stream: AssistantStreamHandle | undefined

const narration = computed(() => projectNarration(events.value))

// The stream carries events + result; the task status is derived from them so
// the UI never needs to poll a second endpoint.
const derivedStatus = computed<'idle' | 'running' | 'waiting' | 'review' | 'done' | 'failed' | 'cancelled'>(() => {
  if (error.value)
    return 'failed'
  const types = new Set(events.value.map(record => record.event.type))
  if (types.has('task.applied'))
    return 'done'
  if (types.has('task.cancelled'))
    return 'cancelled'
  if (types.has('task.failed'))
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

const errorText = computed(() => {
  if (error.value)
    return error.value
  const failed = [...events.value].reverse().find(record => record.event.type === 'task.failed')
  return failed && failed.event.type === 'task.failed' ? failed.event.error : undefined
})

const showChecklist = computed(() => derivedStatus.value !== 'idle' && checklist.value.some(item => item.status !== 'pending'))
const showSummary = computed(() => narration.value.summary.length > 0 && (derivedStatus.value === 'review' || derivedStatus.value === 'done'))
const applied = computed(() => derivedStatus.value === 'done')
const activeChecklistItem = computed(() => {
  return checklist.value.find(item => item.status === 'running')
    ?? [...checklist.value].reverse().find(item => item.status === 'done')
    ?? checklist.value[0]
})
const completedCount = computed(() => checklist.value.filter(item => item.status === 'done').length)
const runningPercent = computed(() => Math.max(8, Math.round((completedCount.value / Math.max(checklist.value.length, 1)) * 100)))
const latestThinkingLine = computed(() => {
  const lines = narration.value.answer.split('\n').map(line => line.trim()).filter(Boolean)
  return friendlyThinkingText(lines.at(-1))
})
const supportingNarration = computed(() => {
  if (running.value || derivedStatus.value !== 'waiting')
    return undefined
  const lines = narration.value.answer
    .split('\n')
    .map(line => friendlyThinkingText(line.trim()))
    .filter((line): line is string => Boolean(line))
  return lines.at(-1)
})
const runningMood = computed(() => {
  const id = activeChecklistItem.value?.id
  if (id === 'understand')
    return '我在梳理票据目标和关键内容。'
  if (id === 'data')
    return '正在识别数据字段，准备放到合适位置。'
  if (id === 'layout')
    return '正在安排信息层级和版面节奏。'
  if (id === 'compose')
    return '正在生成可以直接应用的设计结果。'
  if (id === 'validate')
    return '正在做最后检查，尽量减少手动调整。'
  return '生成流程已开始，我会持续同步进度。'
})
const runningSignals = computed(() => {
  const signals: string[] = []
  for (const record of [...events.value].reverse()) {
    const event = record.event
    if (event.type === 'tool.completed' && event.summary)
      signals.push(event.summary)
    if (event.type === 'tool.failed' && event.error)
      signals.push(`已发现问题：${event.error}`)
    if (signals.length >= 2)
      break
  }
  return signals
})

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

async function cancelTask() {
  if (!taskId.value)
    return
  try {
    await api.value.cancelTask(taskId.value)
  }
  catch (err) {
    error.value = formatAssistantError(err)
  }
}

function friendlyThinkingText(text: string | undefined): string | undefined {
  if (!text)
    return undefined
  const normalized = text.replace(/[.。…]+$/g, '')
  if (normalized.includes('正在理解你的模板需求'))
    return '我在梳理票据目标和关键内容。'
  if (normalized.includes('需求信息还不够明确'))
    return '我需要再确认几个细节，避免生成方向跑偏。'
  if (normalized.startsWith('识别为') && normalized.endsWith('场景'))
    return `${normalized}，继续细化模板结构。`
  if (normalized.includes('已理解模板类型与目标'))
    return '已确认主要目标，开始安排版面。'
  if (normalized.includes('正在规划页面结构与版式'))
    return '正在安排信息层级和版面节奏。'
  if (normalized.includes('正在构建数据契约'))
    return '正在整理字段关系，确保内容能正确填入。'
  if (normalized.includes('正在规划版式骨架'))
    return '正在搭出版面的主要区域。'
  if (normalized.includes('正在生成 EasyInk 模板结构'))
    return '正在生成可以直接应用的设计结果。'
  if (normalized.includes('校验发现问题'))
    return '发现细节问题，正在自动修正。'
  return text
}

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
    <ConversationHeader />
    <main class="assistant-stream">
      <AssistantMessage
        v-if="derivedStatus === 'idle'"
        text="你好，我可以帮你生成 EasyInk 模板。试试输入“帮我生成一张 80mm 小票”。"
      />
      <UserMessage v-if="prompt" :text="prompt" />

      <p v-if="supportingNarration" class="assistant-answer">
        {{ supportingNarration }}
      </p>

      <article v-if="running" class="assistant-live-card">
        <div class="assistant-live-card__aura" aria-hidden="true" />
        <header class="assistant-live-card__head">
          <span class="assistant-live-card__orb" aria-hidden="true">
            <IconSparkles :size="17" stroke-width="1.8" />
          </span>
          <div>
            <strong>{{ activeChecklistItem?.title ?? '正在生成' }}</strong>
            <p>{{ latestThinkingLine ?? runningMood }}</p>
          </div>
          <IconLoader class="assistant-live-card__loader" :size="17" stroke-width="2" aria-hidden="true" />
        </header>
        <div class="assistant-live-card__meter" aria-hidden="true">
          <span :style="{ width: `${runningPercent}%` }" />
        </div>
        <ChecklistCard v-if="showChecklist" :items="checklist" />
        <ul v-if="runningSignals.length" class="assistant-live-card__signals">
          <li v-for="signal in runningSignals" :key="signal">
            {{ signal }}
          </li>
        </ul>
      </article>

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

      <p v-if="derivedStatus === 'cancelled'" class="assistant-answer assistant-answer--muted">
        已停止生成，你可以调整描述后重新发送。
      </p>

      <ErrorCard
        v-if="errorText && derivedStatus === 'failed'"
        :text="errorText"
        @retry="retryTask"
      />
    </main>
    <ComposerBar
      :running="running"
      :placeholder="derivedStatus === 'waiting' ? '输入你的选择或补充信息' : '帮我生成一张 80mm 小票'"
      @submit="submitMessage"
      @cancel="cancelTask"
    />
  </section>
</template>

<style scoped lang="scss">
.easyink-assistant-conversation {
  --assistant-border: var(--ei-border-color, #e3e7ee);
  --assistant-bg: var(--ei-panel-bg, #ffffff);
  --assistant-surface: var(--ei-bg-secondary, #f7f8fa);
  --assistant-muted: var(--ei-text-secondary, #667085);
  --assistant-text: var(--ei-text, #1f2937);
  --assistant-accent: var(--ei-primary, #1677ff);
  --assistant-accent-hover: var(--ei-primary-hover, #4096ff);
  --assistant-primary-soft: color-mix(in srgb, var(--assistant-accent) 10%, transparent);
  --assistant-success: #16a34a;
  --assistant-danger: #b42318;
  --assistant-shadow: 0 18px 48px rgb(15 23 42 / 8%);
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
  gap: 18px;
  overflow: auto;
  padding: 28px 24px;
  background: linear-gradient(180deg, var(--assistant-bg), var(--assistant-surface));
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

.assistant-live-card {
  position: relative;
  align-self: stretch;
  overflow: hidden;
  padding: 20px;
  border-radius: 18px;
  background:
    radial-gradient(circle at 0% 0%, var(--assistant-primary-soft), transparent 34%),
    var(--assistant-bg);
  box-shadow: var(--assistant-shadow);
}

.assistant-live-card__aura {
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent, rgb(255 255 255 / 72%), transparent);
  opacity: 0.42;
  transform: translateX(-100%);
  animation: assistant-aura-drift 2.8s ease-in-out infinite;
}

.assistant-live-card__head,
.assistant-live-card__meter,
.assistant-live-card :deep(.assistant-checklist),
.assistant-live-card__signals {
  position: relative;
  z-index: 1;
}

.assistant-live-card__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
}

.assistant-live-card__orb {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--assistant-accent);
  color: #fff;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--assistant-accent) 22%, transparent);
}

.assistant-live-card__head strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.assistant-live-card__head p {
  margin: 3px 0 0;
  color: var(--assistant-muted);
  line-height: 1.55;
}

.assistant-live-card__loader {
  color: var(--assistant-accent);
  animation: assistant-spin 1.1s linear infinite;
}

.assistant-live-card__meter {
  height: 6px;
  overflow: hidden;
  margin: 18px 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--assistant-border) 60%, transparent);
}

.assistant-live-card__meter span {
  display: block;
  height: 100%;
  min-width: 26px;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--assistant-accent), var(--assistant-accent-hover));
  transition: width 0.38s ease;
}

.assistant-live-card__signals {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 14px 0 0;
  padding: 0;
  color: var(--assistant-muted);
  font-size: 12px;
  list-style: none;
}

.assistant-live-card__signals li {
  display: flex;
  gap: 7px;
  align-items: center;
}

.assistant-live-card__signals li::before {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--assistant-accent);
  content: '';
}

/* Header */
:deep(.assistant-conversation-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 24px 16px;
  background: var(--assistant-bg);
  backdrop-filter: blur(18px);
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
  box-shadow: 0 10px 24px color-mix(in srgb, var(--assistant-accent) 18%, transparent);
}

:deep(.assistant-conversation-header h2) {
  margin: 0;
  color: var(--assistant-text);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.015em;
}

:deep(.assistant-conversation-header p) {
  margin: 2px 0 0;
  color: var(--assistant-muted);
  font-size: 12px;
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
  max-width: 86%;
  padding: 11px 13px;
  border-radius: 18px;
  font-size: 13px;
  line-height: 1.6;

  p {
    margin: 0;
    white-space: pre-wrap;
  }
}

:deep(.assistant-message--user) {
  align-self: flex-end;
  border-bottom-right-radius: 6px;
  background: var(--assistant-accent);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--assistant-accent) 16%, transparent);
}

:deep(.assistant-message--assistant) {
  align-self: flex-start;
  border-bottom-left-radius: 6px;
  background: var(--assistant-bg);
  box-shadow: 0 10px 28px rgb(15 23 42 / 6%);
}

/* Cards */
:deep(.assistant-card) {
  align-self: flex-start;
  width: min(100%, 560px);
  box-sizing: border-box;
  padding: 14px;
  border-radius: 22px;
  background: var(--assistant-bg);
  box-shadow: var(--assistant-shadow);
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
  border: none;
  border-radius: 999px;
  background: var(--assistant-surface);
  color: var(--assistant-text);
  cursor: pointer;
  font-size: 13px;
  transition: transform 0.15s, background 0.15s, color 0.15s;

  &:hover:not(:disabled) {
    background: var(--ei-hover-bg, #eef2f7);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

:deep(.assistant-btn--primary) {
  background: var(--assistant-accent);
  color: #fff;

  &:hover:not(:disabled) {
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
  border: none;
  border-radius: 999px;
  background: var(--assistant-surface);
  color: var(--assistant-text);
  cursor: pointer;
  font-size: 12px;
  transition: border-color 0.15s, background 0.15s, color 0.15s;

  &:hover {
    background: var(--assistant-primary-soft);
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
  background: color-mix(in srgb, var(--assistant-danger) 6%, var(--assistant-bg));

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
  padding: 12px 14px 16px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0%), color-mix(in srgb, var(--assistant-bg) 92%, transparent) 32%),
    var(--assistant-bg);
  backdrop-filter: blur(18px);
}

:deep(.assistant-composer__attachment) {
  display: inline-flex;
  width: fit-content;
  max-width: calc(100% - 4px);
  align-items: center;
  gap: 7px;
  margin: 2px 0 6px 2px;
  padding: 6px 7px 6px 9px;
  border-radius: 999px;
  background: var(--assistant-surface);
  color: var(--assistant-muted);
  font-size: 12px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    display: inline-flex;
    width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0;

    &:hover:not(:disabled) {
      background: var(--ei-hover-bg, #eef2f7);
      color: var(--assistant-text);
    }
  }
}

:deep(.assistant-composer__bar) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 82px;
  padding: 10px;
  border-radius: 28px;
  background:
    linear-gradient(180deg, var(--assistant-bg), color-mix(in srgb, var(--assistant-surface) 58%, var(--assistant-bg))),
    var(--assistant-bg);
  box-shadow:
    0 18px 42px rgb(15 23 42 / 8%),
    inset 0 0 0 1px color-mix(in srgb, var(--assistant-border) 70%, transparent);
  transition: box-shadow 0.18s, transform 0.18s;

  &:focus-within {
    box-shadow:
      0 22px 54px rgb(15 23 42 / 10%),
      0 0 0 4px var(--assistant-primary-soft),
      inset 0 0 0 1px color-mix(in srgb, var(--assistant-accent) 24%, transparent);
  }

  textarea {
    min-height: 44px;
    max-height: 120px;
    padding: 4px 7px;
    border: none;
    background: transparent;
    resize: vertical;
    font: inherit;
    color: var(--assistant-text);
    line-height: 1.55;

    &:focus {
      outline: none;
    }

    &::placeholder {
      color: rgb(32 36 42 / 40%);
    }
  }

  button {
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

:deep(.assistant-composer__tools) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
}

:deep(.assistant-composer__icon-btn),
:deep(.assistant-composer__send) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  flex: 0 0 auto;
}

:deep(.assistant-composer__icon-btn) {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: transparent;
  color: rgb(32 36 42 / 48%);
  transition: background 0.15s, color 0.15s;

  &:hover:not(:disabled) {
    background: var(--assistant-surface);
    color: var(--assistant-text);
  }
}

:deep(.assistant-composer__send) {
  width: 34px;
  height: 34px;
  margin-left: auto;
  border-radius: 999px;
  background: var(--assistant-accent);
  color: #fff;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--assistant-accent) 18%, transparent);
  transition: transform 0.15s, background 0.15s, box-shadow 0.15s;

  &:hover:not(:disabled) {
    background: var(--assistant-accent-hover);
    box-shadow: 0 12px 26px color-mix(in srgb, var(--assistant-accent) 24%, transparent);
    transform: translateY(-1px);
  }
}

:deep(.assistant-composer__send--stop) {
  background: var(--assistant-danger);
}

:deep(.assistant-composer__send--stop span) {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: currentColor;
}

@keyframes assistant-spin {
  to { transform: rotate(360deg); }
}

@keyframes assistant-aura-drift {
  0% { transform: translateX(-100%); }
  45%, 100% { transform: translateX(100%); }
}

@media (max-width: 680px) {
  .easyink-assistant-conversation {
    width: calc(100vw - 24px);
    height: calc(100vh - 48px);
  }
}
</style>
