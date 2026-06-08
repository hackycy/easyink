import type { AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantConversationStatus, AssistantEventRecord, AssistantTaskRecord } from '@easyink/assistant-store'
import { AssistantApiError } from '../api'

export function friendlyThinkingText(text: string | undefined, tr: (key: string) => string): string | undefined {
  if (!text)
    return undefined
  const normalized = text.replace(/[.。…]+$/g, '')
  if (normalized.includes('正在理解你的模板需求'))
    return tr('designer.assistant.progress.understand')
  if (normalized.includes('需求信息还不够明确'))
    return tr('designer.assistant.progress.needsClarification')
  if (normalized.startsWith('识别为') && normalized.endsWith('场景'))
    return `${normalized}${tr('designer.assistant.progress.scenarioSuffix')}`
  if (normalized.includes('已理解模板类型与目标'))
    return tr('designer.assistant.progress.confirmedGoal')
  if (normalized.includes('正在规划页面结构与版式'))
    return tr('designer.assistant.progress.layout')
  if (normalized.includes('正在构建数据契约'))
    return tr('designer.assistant.progress.contract')
  if (normalized.includes('正在选择需要加载的模板物料'))
    return tr('designer.assistant.progress.materials')
  if (normalized.includes('正在规划版式骨架'))
    return tr('designer.assistant.progress.skeleton')
  if (normalized.includes('正在生成 EasyInk 模板结构'))
    return tr('designer.assistant.progress.compose')
  if (normalized.includes('校验发现问题'))
    return tr('designer.assistant.progress.repair')
  return text
}

export function formatAssistantError(err: unknown, tr: (key: string) => string): string {
  if (err instanceof AssistantApiError && err.status === 401)
    return tr('designer.assistant.error.unauthorized')
  if (err instanceof Error)
    return err.message
  return String(err)
}

export function statusFromTask(
  task: AssistantTaskRecord,
  nextEvents: AssistantEventRecord[] = [],
  nextResult?: AssistantResult,
): AssistantConversationStatus {
  const taskStatus = task.status
  if (taskStatus !== 'queued' && taskStatus !== 'running')
    return taskStatus
  const types = new Set(nextEvents.map(record => record.event.type))
  if (types.has('task.applied'))
    return 'done'
  if (types.has('task.cancelled'))
    return 'cancelled'
  if (types.has('task.failed'))
    return 'failed'
  if (nextEvents.some(record => record.event.type === 'clarification.required'))
    return 'waiting'
  if (nextResult)
    return 'review'
  return taskStatus
}

export function isOpenStreamStatus(status: AssistantConversationStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting' || status === 'review'
}

export function conversationStatusLabel(status: AssistantConversationStatus, tr: (key: string) => string): string {
  if (status === 'idle')
    return tr('designer.assistant.status.idle')
  if (status === 'queued' || status === 'running')
    return tr('designer.assistant.status.running')
  if (status === 'waiting')
    return tr('designer.assistant.status.waiting')
  if (status === 'review')
    return tr('designer.assistant.status.review')
  if (status === 'done')
    return tr('designer.assistant.status.done')
  if (status === 'failed')
    return tr('designer.assistant.status.failed')
  if (status === 'cancelled')
    return tr('designer.assistant.status.cancelled')
  return status
}

export function formatConversationTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function createLocalConversationId(): string {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}
