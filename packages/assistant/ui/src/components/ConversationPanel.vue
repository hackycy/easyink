<script setup lang="ts">
import type { AssistantResult, AssistantSourceInput } from '@easyink/assistant-capabilities'
import type { AssistantConversationRecord, AssistantEventRecord, AssistantTaskRecord } from '@easyink/assistant-store'
import type { AssistantStreamHandle } from '../api'
import type { AssistantConversationPanelEmits, AssistantConversationPanelProps, AssistantConversationView } from '../types'
import { DexieAssistantStore } from '@easyink/assistant-store'
import { IconHistory, IconManager, IconPlus } from '@easyink/icons'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createAssistantApiClient } from '../api'
import { useConversationPresentation } from '../composables/useConversationPresentation'
import { useRuntimeLLMConfig } from '../composables/useRuntimeLLMConfig'
import { translateAssistant } from '../i18n'
import { createLocalConversationId, formatAssistantError as formatConversationError, isOpenStreamStatus, statusFromTask } from '../utils/conversation'
import ComposerBar from './ComposerBar.vue'
import ConversationChatView from './ConversationChatView.vue'
import ConversationHeader from './ConversationHeader.vue'
import ConversationHistoryPanel from './ConversationHistoryPanel.vue'
import LLMConfigPanel from './LLMConfigPanel.vue'

const props = withDefaults(defineProps<AssistantConversationPanelProps>(), {
  endpoint: '',
  apiClient: undefined,
  currentSchema: undefined,
  materialManifest: undefined,
  store: undefined,
  conversationId: 'default',
  llmConfig: undefined,
  t: undefined,
})

const emit = defineEmits<AssistantConversationPanelEmits>()

const taskId = ref<string>()
const prompt = ref<string>()
const events = ref<AssistantEventRecord[]>([])
const result = ref<AssistantResult>()
const error = ref<string>()
const applying = ref(false)
const loadingSession = ref(true)
const activeView = ref<AssistantConversationView>('chat')
const conversations = ref<AssistantConversationRecord[]>([])
const activeConversationId = ref(props.conversationId)
const draftMode = ref(false)
const translate = computed(() => props.t)
const llmConfigService = computed(() => props.llmConfig)
const {
  clear: clearLLMConfig,
  configRequired,
  draft: llmConfigDraft,
  enabled: llmConfigEnabled,
  error: llmConfigError,
  hasConfig: hasRuntimeLLMConfig,
  load: loadLLMConfig,
  markRequired: markLLMConfigRequired,
  providerOptions: llmProviderOptions,
  runtimeConfig: runtimeLLMConfig,
  save: saveLLMConfig,
  setProvider: setLLMProvider,
  showBaseURL: showLLMBaseURL,
  updateDraft: updateLLMConfigDraft,
} = useRuntimeLLMConfig({
  service: llmConfigService,
  t: translate,
})
const api = computed(() => props.apiClient ?? createAssistantApiClient(props.endpoint, {
  runtimeProvider: () => runtimeLLMConfig.value ? { llm: runtimeLLMConfig.value } : undefined,
}))

const browserStore = typeof indexedDB === 'undefined'
  ? undefined
  : new DexieAssistantStore('easyink-assistant-ui')
const store = computed(() => props.store ?? browserStore)
const contentView = computed(() => activeView.value === 'settings' && !llmConfigEnabled.value ? 'chat' : activeView.value)

const {
  narration,
  derivedStatus,
  checklist,
  running,
  errorText,
  showChecklist,
  showSummary,
  applied,
  activeChecklistItem,
  runningPercent,
  latestThinkingLine,
  supportingNarration,
  runningMood,
  runningSignals,
} = useConversationPresentation({
  taskId,
  events,
  result,
  error,
  draftMode,
  t: translate,
})

let stream: AssistantStreamHandle | undefined
let saveToken = 0
let restoreToken = 0
let streamToken = 0

function openStream(id: string) {
  closeStream()
  const token = ++streamToken
  error.value = undefined
  stream = api.value.streamTask(id, {
    onSnapshot: (snapshot) => {
      if (token !== streamToken || id !== taskId.value)
        return
      void persistSnapshot(snapshot.task, snapshot.events, snapshot.result)
      events.value = snapshot.events
      result.value = snapshot.result ?? result.value
      prompt.value = snapshot.task.input.prompt
    },
    onEvent: (record) => {
      if (token !== streamToken || id !== taskId.value)
        return
      void store.value?.saveEventRecord(record)
      events.value = [...events.value, record]
    },
    onResult: (next) => {
      if (token !== streamToken || id !== taskId.value)
        return
      void persistResult(next)
      result.value = next
    },
    onError: (err) => {
      if (token !== streamToken || id !== taskId.value)
        return
      error.value = formatAssistantError(err)
    },
  })
}

function closeStream() {
  streamToken += 1
  stream?.close()
  stream = undefined
}

async function submitMessage(payload: { prompt: string, source?: AssistantSourceInput }) {
  error.value = undefined
  try {
    if (configRequired.value) {
      activeView.value = 'settings'
      draftMode.value = false
      markLLMConfigRequired()
      return
    }
    if (!draftMode.value && derivedStatus.value === 'waiting' && taskId.value) {
      await api.value.submitClarification(taskId.value, { answer: payload.prompt })
      return
    }
    if (!draftMode.value)
      activeConversationId.value = createLocalConversationId()
    draftMode.value = false
    activeView.value = 'chat'
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
    await persistSnapshot(created, [], undefined)
    await refreshConversations()
    openStream(created.id)
  }
  catch (err) {
    error.value = formatAssistantError(err)
  }
}

function startNewConversation() {
  restoreToken += 1
  closeStream()
  resetConversationState()
  activeConversationId.value = createLocalConversationId()
  draftMode.value = true
  activeView.value = 'chat'
  emit('statusChange', 'idle')
}

function toggleHistoryView() {
  activeView.value = activeView.value === 'history' ? 'chat' : 'history'
  if (activeView.value === 'history')
    void refreshConversations()
}

function toggleSettingsView() {
  activeView.value = activeView.value === 'settings' ? 'chat' : 'settings'
}

async function selectConversation(id: string) {
  restoreToken += 1
  closeStream()
  activeConversationId.value = id
  draftMode.value = false
  resetConversationState()
  activeView.value = 'chat'
  loadingSession.value = true
  try {
    await restoreConversation(id)
  }
  finally {
    loadingSession.value = false
    emit('statusChange', derivedStatus.value)
  }
}

async function deleteConversation(id: string) {
  const target = store.value
  if (!target)
    return
  if (id === activeConversationId.value) {
    restoreToken += 1
    closeStream()
    resetConversationState()
    activeConversationId.value = createLocalConversationId()
    draftMode.value = true
    emit('statusChange', 'idle')
  }
  await target.deleteConversation(id)
  await refreshConversations()
}

function resetConversationState() {
  loadingSession.value = false
  taskId.value = undefined
  prompt.value = undefined
  events.value = []
  result.value = undefined
  error.value = undefined
}

async function applyResult(resultToApply: AssistantResult) {
  if (!taskId.value)
    return
  applying.value = true
  try {
    await api.value.applyTask(taskId.value)
    emit('apply', resultToApply)
    await saveConversationState()
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
    await saveConversationState()
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
    await saveConversationState()
  }
  catch (err) {
    error.value = formatAssistantError(err)
  }
}

function formatAssistantError(err: unknown): string {
  return formatConversationError(err, tr)
}

function tr(key: string): string {
  return translateAssistant(key, props.t)
}

async function restoreConversation(conversationId?: string) {
  if (!store.value)
    return
  const token = ++restoreToken
  await refreshConversations()
  const restoreId = conversationId ?? conversations.value[0]?.id ?? props.conversationId
  if (token !== restoreToken)
    return
  activeConversationId.value = restoreId
  draftMode.value = false
  const conversation = await store.value.getConversation(restoreId)
  const id = conversation?.activeTaskId
  if (!id)
    return

  const cachedTask = await store.value.getTask(id)
  const cachedEvents = await store.value.listEvents(id)
  const cachedResult = cachedTask?.resultId ? await store.value.getResult(cachedTask.resultId) : undefined

  if (token !== restoreToken)
    return
  if (cachedTask) {
    taskId.value = cachedTask.id
    prompt.value = cachedTask.input.prompt
    events.value = cachedEvents
    result.value = cachedResult
  }

  try {
    const response = await api.value.getTask(id)
    const nextEvents = await api.value.listEvents(id)
    if (token !== restoreToken)
      return
    await persistSnapshot(response.task, nextEvents, response.result)
    taskId.value = response.task.id
    prompt.value = response.task.input.prompt
    result.value = response.result ?? cachedResult
    events.value = await store.value.listEvents(id)
    if (isOpenStreamStatus(statusFromTask(response.task)))
      openStream(id)
  }
  catch {
    if (token === restoreToken && cachedTask && isOpenStreamStatus(statusFromTask(cachedTask)))
      openStream(id)
  }
}

async function persistResult(nextResult: AssistantResult) {
  const target = store.value
  if (!target)
    return
  await target.saveResultRecord(nextResult)
  if (!taskId.value)
    return
  const task = await target.getTask(taskId.value)
  if (!task)
    return
  await target.updateTask({ ...task, resultId: nextResult.id })
  await persistConversation({ ...task, resultId: nextResult.id }, events.value, nextResult)
}

async function persistSnapshot(task: AssistantTaskRecord, nextEvents: AssistantEventRecord[], nextResult?: AssistantResult) {
  const target = store.value
  if (!target)
    return
  await target.updateTask(task)
  await Promise.all(nextEvents.map(record => target.saveEventRecord(record)))
  if (nextResult)
    await target.saveResultRecord(nextResult)
  await persistConversation(task, nextEvents, nextResult)
}

async function persistConversation(task: AssistantTaskRecord, nextEvents: AssistantEventRecord[], nextResult?: AssistantResult) {
  const target = store.value
  if (!target)
    return
  await target.upsertConversation({
    id: activeConversationId.value,
    activeTaskId: task.id,
    title: task.input.prompt,
    status: statusFromTask(task, nextEvents, nextResult),
  })
  await refreshConversations()
}

async function refreshConversations() {
  const target = store.value
  if (!target)
    return
  conversations.value = await target.listConversations()
}

async function saveConversationState() {
  if (!taskId.value || !store.value)
    return
  const token = ++saveToken
  const task = await store.value.getTask(taskId.value)
  if (!task || token !== saveToken)
    return
  await persistConversation(task, events.value, result.value)
}

watch(() => api.value, () => {
  if (taskId.value)
    openStream(taskId.value)
})

watch(derivedStatus, () => {
  emit('statusChange', derivedStatus.value)
  void saveConversationState()
})

onBeforeUnmount(closeStream)
onMounted(async () => {
  try {
    await loadLLMConfig(api.value)
    await restoreConversation()
  }
  finally {
    loadingSession.value = false
    emit('statusChange', derivedStatus.value)
  }
})
</script>

<template>
  <section class="easyink-assistant-conversation">
    <ConversationHeader :t="t" />
    <ConversationChatView
      v-if="contentView === 'chat'"
      :active-checklist-item="activeChecklistItem"
      :applied="applied"
      :applying="applying"
      :checklist="checklist"
      :clarification="narration.clarification"
      :derived-status="derivedStatus"
      :error-text="errorText"
      :latest-thinking-line="latestThinkingLine"
      :loading-session="loadingSession"
      :prompt="prompt"
      :result="result"
      :running="running"
      :running-mood="runningMood"
      :running-percent="runningPercent"
      :running-signals="runningSignals"
      :show-checklist="showChecklist"
      :show-summary="showSummary"
      :summary="narration.summary"
      :supporting-narration="supportingNarration"
      :t="t"
      @apply="applyResult"
      @clarify="submitMessage({ prompt: $event })"
      @retry="retryTask"
    />
    <ConversationHistoryPanel
      v-else-if="contentView === 'history'"
      :active-conversation-id="activeConversationId"
      :conversations="conversations"
      :t="t"
      @delete="deleteConversation"
      @select="selectConversation"
    />
    <LLMConfigPanel
      v-else-if="contentView === 'settings'"
      :api-key="llmConfigDraft.apiKey"
      :base-url="llmConfigDraft.baseURL"
      :configured="hasRuntimeLLMConfig"
      :error="llmConfigError"
      :model="llmConfigDraft.model"
      :provider="llmConfigDraft.provider"
      :providers="llmProviderOptions"
      :show-base-url="showLLMBaseURL"
      :t="t"
      @clear="clearLLMConfig"
      @save="saveLLMConfig"
      @update:api-key="updateLLMConfigDraft({ apiKey: $event })"
      @update:base-url="updateLLMConfigDraft({ baseURL: $event })"
      @update:model="updateLLMConfigDraft({ model: $event })"
      @update:provider="setLLMProvider"
    />
    <ComposerBar
      :running="running"
      :placeholder="derivedStatus === 'waiting' ? tr('designer.assistant.placeholder.clarification') : tr('designer.assistant.placeholder.prompt')"
      :t="t"
      @submit="submitMessage"
      @cancel="cancelTask"
    >
      <template #tools>
        <button
          type="button"
          class="assistant-composer__icon-btn assistant-composer__icon-btn--session"
          :title="tr('designer.assistant.action.newConversation')"
          :aria-label="tr('designer.assistant.action.newConversation')"
          @click="startNewConversation"
        >
          <IconPlus :size="16" stroke-width="1.9" />
        </button>
        <button
          type="button"
          class="assistant-composer__icon-btn assistant-composer__icon-btn--session"
          :class="{ 'assistant-composer__icon-btn--active': activeView === 'history' }"
          :title="tr('designer.assistant.action.history')"
          :aria-label="tr('designer.assistant.action.history')"
          @click="toggleHistoryView"
        >
          <IconHistory :size="16" stroke-width="1.9" />
        </button>
        <button
          v-if="llmConfigEnabled"
          type="button"
          class="assistant-composer__icon-btn assistant-composer__icon-btn--session"
          :class="{ 'assistant-composer__icon-btn--active': activeView === 'settings' }"
          :title="tr('designer.assistant.action.llmConfig')"
          :aria-label="tr('designer.assistant.action.llmConfig')"
          @click="toggleSettingsView"
        >
          <IconManager :size="16" stroke-width="1.9" />
        </button>
      </template>
    </ComposerBar>
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
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(280px, 1fr) auto;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--assistant-bg);
  color: var(--assistant-text);
  font-size: 13px;
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
  min-width: 0;
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
  gap: 4px;
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
  transition: background 0.15s, color 0.15s, transform 0.15s;

  &:hover:not(:disabled) {
    background: var(--assistant-surface);
    color: var(--assistant-text);
    transform: translateY(-1px);
  }
}

:deep(.assistant-composer__icon-btn--session) {
  color: rgb(32 36 42 / 52%);

  &:hover:not(:disabled) {
    background: var(--assistant-surface);
    color: var(--assistant-text);
  }
}

:deep(.assistant-composer__icon-btn--active) {
  background: var(--assistant-surface);
  color: var(--assistant-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--assistant-muted) 18%, transparent);
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

@media (max-width: 680px) {
  .easyink-assistant-conversation {
    width: calc(100vw - 24px);
    height: calc(100vh - 48px);
  }
}
</style>
