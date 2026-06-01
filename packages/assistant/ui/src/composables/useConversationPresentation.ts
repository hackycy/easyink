import type { AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord } from '@easyink/assistant-store'
import type { Ref } from 'vue'
import type { AssistantTranslate } from '../i18n'
import { computed } from 'vue'
import { formatAssistantMessage, translateAssistant } from '../i18n'
import { projectChecklist, projectNarration } from '../projection'
import { friendlyThinkingText } from '../utils/conversation'

export type AssistantDerivedStatus = 'idle' | 'running' | 'waiting' | 'review' | 'done' | 'failed' | 'cancelled'

export interface ConversationPresentationInput {
  taskId: Ref<string | undefined>
  events: Ref<AssistantEventRecord[]>
  result: Ref<AssistantResult | undefined>
  error: Ref<string | undefined>
  draftMode: Ref<boolean>
  t: Ref<AssistantTranslate | undefined>
}

export function useConversationPresentation(input: ConversationPresentationInput) {
  const narration = computed(() => projectNarration(input.events.value))

  const derivedStatus = computed<AssistantDerivedStatus>(() => {
    if (input.draftMode.value)
      return 'idle'
    if (input.error.value)
      return 'failed'
    const types = new Set(input.events.value.map(record => record.event.type))
    if (types.has('task.applied'))
      return 'done'
    if (types.has('task.cancelled'))
      return 'cancelled'
    if (types.has('task.failed'))
      return 'failed'
    if (narration.value.clarification)
      return 'waiting'
    if (input.result.value)
      return 'review'
    if (types.has('task.created'))
      return 'running'
    return 'idle'
  })

  const derivedTask = computed(() => input.taskId.value ? { status: derivedStatus.value } : undefined)
  const checklist = computed(() => projectChecklist({
    events: input.events.value,
    result: input.result.value,
    error: input.error.value,
    task: derivedTask.value,
    t: input.t.value,
  }))
  const running = computed(() => derivedStatus.value === 'running')

  const errorText = computed(() => {
    if (input.error.value)
      return input.error.value
    const failed = [...input.events.value].reverse().find(record => record.event.type === 'task.failed')
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
    return formatFriendlyThinkingText(lines.at(-1))
  })
  const supportingNarration = computed(() => {
    if (running.value || derivedStatus.value !== 'waiting')
      return undefined
    const lines = narration.value.answer
      .split('\n')
      .map(line => formatFriendlyThinkingText(line.trim()))
      .filter((line): line is string => Boolean(line))
    return lines.at(-1)
  })
  const runningMood = computed(() => {
    const id = activeChecklistItem.value?.id
    if (id === 'understand')
      return tr('designer.assistant.progress.understand')
    if (id === 'data')
      return tr('designer.assistant.progress.data')
    if (id === 'layout')
      return tr('designer.assistant.progress.layout')
    if (id === 'compose')
      return tr('designer.assistant.progress.compose')
    if (id === 'validate')
      return tr('designer.assistant.progress.validate')
    return tr('designer.assistant.progress.started')
  })
  const runningSignals = computed(() => {
    const signals: string[] = []
    for (const record of [...input.events.value].reverse()) {
      const event = record.event
      if (event.type === 'tool.completed' && event.summary)
        signals.push(event.summary)
      if (event.type === 'tool.failed' && event.error)
        signals.push(formatAssistantMessage('designer.assistant.progress.issueFound', { error: event.error }, input.t.value))
      if (signals.length >= 2)
        break
    }
    return signals
  })

  function formatFriendlyThinkingText(text: string | undefined): string | undefined {
    return friendlyThinkingText(text, tr)
  }

  function tr(key: string): string {
    return translateAssistant(key, input.t.value)
  }

  return {
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
  }
}
